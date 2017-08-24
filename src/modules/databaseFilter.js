/**
 * Created by robert on 8/19/17.
 */

// http://docs.sequelizejs.com/en/latest/
const Sequelize = require('sequelize');
const async = require('async');
const crypto = require('crypto');
const debug = require('debug')('jsonApi:store:relationaldb');
const Joi = require('joi');
const filter = require('./processFilter');

const _ = {
  pick: require('lodash.pick'),
  assign: require('lodash.assign'),
  omit: require('lodash.omit'),
};
const util = require('util');

const MIN_SERVER_VERSION = '1.10.0';

export default class SqlStore {
  constructor(config, objectdb, user_schema = {}) {
    this.config = config;
    this._sequelizeInstances = {};
    this.relations = {};
    if (objectdb) {
      this.attributes = {
        userId: Joi.number(),
        display_name: Joi.string(),
        username: Joi.string(),
        email_address: Joi.string(),
        firstname: Joi.string(),
        lastname: Joi.string(),
        created_by: Joi.string(),
        updated_by: Joi.string(),
        change_pw: Joi.string(),
        account_locked: Joi.string(),
        user_disabled: Joi.string(),
      };

      this.sequelize = objectdb;

      let localAttributes = Object.keys(
        this.attributes,
      ).filter((attributeName) => {
        const settings = this.attributes[attributeName]._settings;
        if (!settings) return true;
        return !(settings.__one || settings.__many);
      });
      localAttributes = _.pick(this.attributes, localAttributes);
      let relations = Object.keys(
        this.attributes,
      ).filter((attributeName) => {
        const settings = this.attributes[attributeName]._settings;
        if (!settings) return false;
        return (settings.__one || settings.__many) && !settings.__as;
      });
      relations = _.pick(this.attributes, relations);

      const modelAttributes = this._joiSchemaToSequelizeModel(localAttributes);
      this.resource = 'user';
      this.baseModel = this.sequelize.define(
        'user',
        user_schema,
        { timestamps: false },
      );

      this.relations = {};
      this.relationArray = [];
      Object.keys(relations).forEach((relationName) => {
        const relation = relations[relationName];
        const otherModel = this._defineRelationModel(
          relationName,
          relation._settings.__many,
        );

        this.relations[relationName] = otherModel;
        this.relationArray.push(otherModel);
      });
    }
  }
  initialise(resourceConfig) {
    this.resourceConfig = resourceConfig;

    const database = this.config.database || resourceConfig.resource;
    const sequelizeArgs = [
      database,
      this.config.username,
      this.config.password,
      {
        dialect: this.config.dialect,
        host: this.config.host,
        port: this.config.port,
        logging:
          this.config.logging ||
          require('debug')('jsonApi:store:relationaldb:sequelize'),
        freezeTableName: true,
      },
    ];

    // To prevent too many open connections, we will store all Sequelize instances in a hash map.
    // Index the hash map by a hash of the entire config object. If the same config is passed again,
    // reuse the existing Sequelize connection resource instead of opening a new one.

    const md5sum = crypto.createHash('md5');
    const instanceId = md5sum
      .update(JSON.stringify(sequelizeArgs))
      .digest('hex');
    const instances = this._sequelizeInstances;

    if (!instances[instanceId]) {
      const sequelize = Object.create(Sequelize.prototype);
      Sequelize.apply(sequelize, sequelizeArgs);
      instances[instanceId] = sequelize;
    }
    this.sequelize = instances[instanceId];
    this._buildModels();
    this.ready = true;
  }
  populate(callback) {
    const self = this;
    const tasks = [
      function (cb) {
        self.baseModel.sync().asCallback(cb);
      },
      function (cb) {
        async.eachSeries(
          self.relationArray,
          (model, ecb) => {
            model.sync().asCallback(ecb);
          },
          cb,
        );
      },
      function (cb) {
        async.eachSeries(
          self.resourceConfig.examples,
          (exampleJson, ecb) => {
            const validation = Joi.validate(
              exampleJson,
              self.resourceConfig.attributes,
            );
            if (validation.error) return ecb(validation.error);
            self.create(
              { request: { type: self.resourceConfig.resource } },
              validation.value,
              ecb,
            );
          },
          cb,
        );
      },
    ];
    async.series(tasks, callback);
  }
  async search(request) {
    const processed = filter.parseAndValidate(request, this.attributes);
    const options = {};
    const where = this._generateSearchBlock(processed);
    if (where) {
      options.where = where;
    }
    const includeBlocks = this._generateSearchIncludes(request.params.filter);

    // debug('includeBlocks', util.inspect(includeBlocks, { depth: null }));
    if (includeBlocks.count.length) {
      options.include = includeBlocks.count;
    }
    const count = await this.baseModel.count(options);
    debug('Count', count);
    if (includeBlocks.findAll.length) {
      options.include = includeBlocks.findAll;
    }
    const order = this._generateSearchOrdering(request);
    if (order) {
      options.order = order;
    }
    const pagination = this._generateSearchPagination(request);
    if (pagination) {
      if (pagination.offset > 0 || pagination.limit <= count) {
        _.assign(options, pagination);
      }
    }
    const result = await this.baseModel.findAll(options);


    const records = result.map((i) => {
      const json = this._fixObject(i.toJSON());
      return json;
    });
    debug('Produced', JSON.stringify(records));
    return { data: records, count };
  }

  async find(request) {
    let result = await this.baseModel.findOne({
      where: { id: request.params.id },
      include: this.relationArray,
    });
    result = this._fixObject(result.toJSON());
    return result;
  }

  create(request, newResource, finishedCallback) {
    const self = this;

    self._dealWithTransaction(finishedCallback, (t, finishTransaction) => {
      self.baseModel.create(newResource, t).asCallback((err2, theResource) => {
        if (err2) return finishTransaction(err2);

        self._clearAndSetRelationTables(theResource, newResource, t, (err) => {
          if (err) return finishTransaction(err);

          return finishTransaction(null, newResource);
        });
      });
    });
  }
  delete(request, finishedCallback) {
    const self = this;

    self._dealWithTransaction(finishedCallback, (t, finishTransaction) => {
      self.baseModel
        .findAll({
          where: { id: request.params.id },
          include: self.relationArray,
        })
        .asCallback((findErr, results) => {
          if (findErr) return finishTransaction(findErr);

          const theResource = results[0];

          // If the resource doesn't exist, error
          if (!theResource) {
            return finishTransaction({
              status: '404',
              code: 'ENOTFOUND',
              title: 'Requested resource does not exist',
              detail: `There is no ${request.params.type} with id ${request.params.id}`,
            });
          }

          theResource
            .destroy(t)
            .asCallback(deleteErr => finishTransaction(deleteErr));
        });
    });
  }
  update(request, partialResource, finishedCallback) {
    this._dealWithTransaction(finishedCallback, (t, finishTransaction) => {
      this.baseModel.findOne({
        where: { id: request.params.id },
        include: this.relationArray,
        transaction: t.transaction,
      })
        .asCallback((err2, theResource) => {
          if (err2) return finishTransaction(err2);

          // If the resource doesn't exist, error
          if (!theResource) {
            return finishTransaction({
              status: '404',
              code: 'ENOTFOUND',
              title: 'Requested resource does not exist',
              detail: `There is no ${request.params.type} with id ${request.params.id}`,
            });
          }

          this._clearAndSetRelationTables(
            theResource,
            partialResource,
            t,
            (err) => {
              if (err) return finishTransaction(err);

              theResource.update(partialResource, t).asCallback((err3) => {
                if (err) return finishTransaction(err3);
                return finishTransaction(null, partialResource);
              });
            },
          );
        });
    });
  }
  _buildModels() {
    let localAttributes = Object.keys(
      this.resourceConfig.attributes,
    ).filter((attributeName) => {
      const settings = this.resourceConfig.attributes[attributeName]._settings;
      if (!settings) return true;
      return !(settings.__one || settings.__many);
    });
    localAttributes = _.pick(this.resourceConfig.attributes, localAttributes);
    let relations = Object.keys(
      this.resourceConfig.attributes,
    ).filter((attributeName) => {
      const settings = this.resourceConfig.attributes[attributeName]._settings;
      if (!settings) return false;
      return (settings.__one || settings.__many) && !settings.__as;
    });
    relations = _.pick(this.resourceConfig.attributes, relations);

    const modelAttributes = this._joiSchemaToSequelizeModel(localAttributes);
    this.baseModel = this.sequelize.define(
      this.resourceConfig.resource,
      modelAttributes,
      { timestamps: false },
    );

    this.relations = {};
    this.relationArray = [];
    Object.keys(relations).forEach((relationName) => {
      const relation = relations[relationName];
      const otherModel = this._defineRelationModel(
        relationName,
        relation._settings.__many,
      );
      this.relations[relationName] = otherModel;
      this.relationArray.push(otherModel);
    });
  }
  _joiSchemaToSequelizeModel(joiSchema) {
    const model = {};

    Object.keys(joiSchema).forEach((attributeName) => {
      const attribute = joiSchema[attributeName];
      if (attribute._type === 'string') {
        model[attributeName] = { type: Sequelize.STRING, allowNull: true };
      }
      if (attribute._type === 'date') {
        model[attributeName] = { type: Sequelize.STRING, allowNull: true };
      }
      if (attribute._type === 'number') {
        model[attributeName] = { type: Sequelize.INTEGER, allowNull: true };
      }
      if (attribute._type === 'boolean') {
        model[attributeName] = { type: Sequelize.BOOLEAN, allowNull: true };
      }
    });

    return model;
  }
  _defineRelationModel(relationName, many) {
    const self = this;

    const modelName = `${this.resource}-${relationName}`;
    const modelProperties = {

    };

    const relatedModel = self.sequelize.define(modelName, modelProperties, {
      timestamps: false,
      indexes: [{ fields: [] }],
      freezeTableName: true,
    });

    if (many) {
      self.baseModel.hasMany(relatedModel, {
        onDelete: 'CASCADE',
        foreignKey: `${self.resourceConfig.resource}Id`,
      });
    } else {
      self.baseModel.hasOne(relatedModel, {
        onDelete: 'CASCADE',
        foreignKey: `${self.resourceConfig.resource}Id`,
      });
    }

    return relatedModel;
  }
  _fixObject(json) {
    const self = this;
    const resourceId = `${this.resource}Id`;

    /* Object.keys(json).forEach(attribute => {
      if (attribute.indexOf(`${this.resource}-`) !== 0) return;

      const fixedName = attribute
        .split(`${this.resource}-`)
        .pop();
      json[fixedName] = json[attribute];

      let val = json[attribute];
      delete json[attribute];
      if (!val) return;

      if (!(val instanceof Array)) val = [val];
      val.forEach((j) => {
        if (j.uid) delete j.uid;
        if (j[resourceId]) delete j[resourceId];
      });
    });
*/
    return json;
  }
  _errorHandler(e, callback) {
    // console.log(e, e.stack);
    if (e.message.match(/^ER_LOCK_DEADLOCK/)) {
      return callback({
        status: '500',
        code: 'EMODIFIED',
        title: 'Resource Just Changed',
        detail:
          'The resource you tried to mutate was modified by another request. Your request has been aborted.',
      });
    }

    return callback({
      status: '500',
      code: 'EUNKNOWN',
      title: 'An unknown error has occured',
      detail: `Something broke when connecting to the database - ${e.message}`,
    });
  }
  _generateSearchIncludes(relationships) {
    const self = this;
    if (!relationships) {
      return {
        count: [],
        findAll: Object.keys(self.relations).map(key => self.relations[key]),
      };
    }
    const searchIncludes = Object.keys(self.relations).reduce(
      (partialSearchIncludes, relationName) => {
        const model = self.relations[relationName];
        partialSearchIncludes.findAll.push(model);

        let matchingValue = relationships[relationName];
        if (!matchingValue) return partialSearchIncludes;
        if (matchingValue instanceof Array) {
          matchingValue = matchingValue.filter(i => !(i instanceof Object));
          if (!matchingValue.length) return partialSearchIncludes;
        } else if (matchingValue instanceof Object) {
          return partialSearchIncludes;
        }
        const includeClause = {
          model,
          where: { id: matchingValue },
        };
        partialSearchIncludes.count.push(includeClause);
        // replace simple model with clause
        partialSearchIncludes.findAll.pop();
        partialSearchIncludes.findAll.push(includeClause);
        return partialSearchIncludes;
      },
      {
        count: [],
        findAll: [],
      },
    );

    return searchIncludes;
  }
  _generateSearchBlock(processed) {
    console.log('processed filter', processed);

    const attributesToFilter = _.omit(
      processed,
      Object.keys({}),
    );
    const searchBlock = this._getSearchBlock(attributesToFilter);
    return searchBlock;
  }
  _scalarFilterElementToWhereObj(element) {
    const self = this;

    const value = element.value;
    const op = element.operator;
    if (!op) return value;

    if (op === '>') return { $gt: value };
    if (op === '<') return { $lt: value };

    let iLikeOperator = '$like';
    if (self.sequelize.getDialect() === 'postgres') iLikeOperator = '$iLike';

    if (op === '~') {
      const caseInsensitiveEqualExpression = {};
      caseInsensitiveEqualExpression[iLikeOperator] = value;
      return caseInsensitiveEqualExpression;
    }

    if (op === ':') {
      const caseInsensitiveContainsExpression = {};
      caseInsensitiveContainsExpression[iLikeOperator] = `%${value}%`;
      return caseInsensitiveContainsExpression;
    }
  }
  _filterElementToSearchBlock(filterElement) {
    const self = this;

    if (!filterElement) return {};
    const whereObjs = filterElement.map(scalarFilterElement =>
      self._scalarFilterElementToWhereObj(scalarFilterElement),
    );
    if (!whereObjs.length) return {};
    if (filterElement.length === 1) {
      return whereObjs[0];
    }
    return { $or: whereObjs };
  }
  _getSearchBlock(filter) {
    const self = this;
    if (!filter) return {};
    const searchBlock = {};

    Object.keys(filter).forEach((attributeName) => {
      const filterElement = filter[attributeName];
      searchBlock[attributeName] = self._filterElementToSearchBlock(
        filterElement,
      );
    });

    return searchBlock;
  }
  _dealWithTransaction(done, callback) {
    const self = this;
    const transactionOptions = {
      isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED,
      autocommit: false,
    };
    self.sequelize
      .transaction(transactionOptions)
      .asCallback((err1, transaction) => {
        if (err1) return done(err1);

        const t = { transaction };
        const commit = function () {
          const args = arguments;
          transaction.commit().asCallback((err2) => {
            if (err2) return done(err2);
            return done(...Array.prototype.slice.call(args));
          });
        };
        const rollback = function (e) {
          debug('Err', transaction.name, e);
          const a = function () {
            if (e instanceof Error) return self._errorHandler(e, done);
            return done(e);
          };
          transaction.rollback().then(a, a);
        };
        const finishTransaction = function (err) {
          if (err) return rollback(err);
          return commit(...Array.prototype.slice.call(arguments));
        };

        return callback(t, finishTransaction);
      });
  }
  _clearAndSetMany(
    relationModel,
    prop,
    theResource,
    keyName,
    ucKeyName,
    t,
    taskCallback,
  ) {
    const whereClause = {};
    whereClause[`${theResource.type}Id`] = theResource.id;
    relationModel
      .destroy({
        where: whereClause,
        transaction: t.transaction,
      })
      .asCallback((deleteError) => {
        if (deleteError) return taskCallback(deleteError);

        async.map(
          prop,
          (item, acallback) => {
            relationModel
              .create(item, t)
              .asCallback((err, newRelationModel) => {
                if (err) return acallback(err);

                theResource
                  [`add${ucKeyName}`](newRelationModel, t)
                  .asCallback(acallback);
              });
          },
          taskCallback,
        );
      });
  }
  _clearAndSetOne(
    relationModel,
    prop,
    theResource,
    keyName,
    ucKeyName,
    t,
    taskCallback,
  ) {
    const whereClause = {};
    whereClause[`${theResource.type}Id`] = theResource.id;
    relationModel
      .destroy({
        where: whereClause,
        transaction: t.transaction,
      })
      .asCallback((deleteError) => {
        if (deleteError) return taskCallback(deleteError);
        if (!prop) {
          theResource[`set${ucKeyName}`](null, t).asCallback(taskCallback);
        } else {
          relationModel.create(prop, t).asCallback((err, newRelationModel) => {
            if (err) return taskCallback(err);

            theResource
              [`set${ucKeyName}`](newRelationModel, t)
              .asCallback(taskCallback);
          });
        }
      });
  }
  _clearAndSetRelationTables(theResource, partialResource, t, callback) {
    const self = this;

    const tasks = {};
    Object.keys(self.relations).forEach((relationName) => {
      const prop = partialResource[relationName];
      if (!partialResource.hasOwnProperty(relationName)) return;
      const relationModel = self.relations[relationName];

      const keyName = `${self.resourceConfig.resource}-${relationName}`;
      const ucKeyName =
        keyName[0].toUpperCase() + keyName.slice(1, keyName.length);

      tasks[relationName] = function (taskCallback) {
        if (prop instanceof Array) {
          self._clearAndSetMany(
            relationModel,
            prop,
            theResource,
            keyName,
            ucKeyName,
            t,
            taskCallback,
          );
        } else {
          self._clearAndSetOne(
            relationModel,
            prop,
            theResource,
            keyName,
            ucKeyName,
            t,
            taskCallback,
          );
        }
      };
    });

    async.parallel(tasks, callback);
  }
  _generateSearchOrdering(request) {
    if (!request.params.sort) return undefined;

    let attribute = request.params.sort;
    let order = 'ASC';
    attribute = String(attribute);
    if (attribute[0] === '-') {
      order = 'DESC';
      attribute = attribute.substring(1, attribute.length);
    }
    return [[attribute, order]];
  }
  _generateSearchPagination(request) {
    const page = request.params.page;
    if (!page) return undefined;

    return {
      limit: page.limit,
      offset: page.offset,
    };
  }
}
