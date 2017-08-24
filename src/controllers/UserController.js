//
import UserDBSchema from '../database/schema';
import Sequelize from 'sequelize';
import SqlStore from '../modules/databaseFilter';

export default class UserController {
  constructor() {
    this.UserDB = new UserDBSchema();
    this.sqlStore = new SqlStore({}, this.UserDB.objectdb(), {
      userId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      display_name: Sequelize.STRING,
      username: Sequelize.STRING,
      email_address: Sequelize.STRING,
      firstname: Sequelize.STRING,
      lastname: Sequelize.STRING,
      created_by: Sequelize.STRING,
      updated_by: Sequelize.STRING,
      change_pw: Sequelize.INTEGER,
      account_locked: Sequelize.INTEGER,
      user_disabled: Sequelize.INTEGER,
    });
  }
  async create(obj) {
    return await this.UserDB.User.create(obj);
  }
  async update(id, obj) {
    // let updateObj = await this.UserDB.User.findOne({userId:id});
    // console.log('update obj - ',updateObj);
    // {ad_display_name : req.body.ad_display_name || updateObj.ad_display_name}
    return await this.UserDB.User.update(obj, { where: { userId: id } });
  }
  async delete() {

  }
  async findById(id) {
    return await this.UserDB.User.findOne({ userId: id });
  }
  async findAll(query, req, res) {
    return await this.sqlStore.search(req);
  }
}
