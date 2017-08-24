/**
 * Created by Rober on 5/20/2016.
 */
import Sequelize from 'sequelize';

class UserDBSchema {
  constructor() {
    this.sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });
    this.setup();
    this.roles = ['Administrators', 'Site Administrator', 'Site Technician', 'Airline Admin', 'Ground Handler Admin', 'Ground Handler', 'Airline User'];
  }
  objectdb() {
    return this.sequelize;
  }
  setup() {
    this.User = this.sequelize.define('user', {
      userId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      display_name: Sequelize.STRING,
      username: Sequelize.STRING,
      password: Sequelize.STRING, // shaw256 // just added
      email_address: Sequelize.STRING,
      firstname: Sequelize.STRING,
      lastname: Sequelize.STRING,
      created_by: Sequelize.STRING,
      updated_by: Sequelize.STRING,
      change_pw: Sequelize.INTEGER,
      account_locked: Sequelize.INTEGER,
      user_disabled: Sequelize.INTEGER,
    });
    this.UserGroup = this.sequelize.define('userGroup', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      iata_code: Sequelize.STRING,
      created_by: Sequelize.STRING,
    });
    this.UserProfile = this.sequelize.define('userProfile', {
      theme: Sequelize.STRING,
      address: Sequelize.STRING,
      phone: Sequelize.STRING,
      layout: Sequelize.TEXT(Sequelize.long),
      created_by: Sequelize.STRING,
    });
    this.Group = this.sequelize.define('group', {
      groupId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      group_name: Sequelize.STRING,
      group_desc: Sequelize.STRING,
      iata_code: Sequelize.STRING,
      created_by: Sequelize.STRING,
      updated_by: Sequelize.STRING,
    });
    this.UserRole = this.sequelize.define('userRole', {
      created_by: Sequelize.STRING,
      updated_by: Sequelize.STRING,
    });
    this.Role = this.sequelize.define('role', {
      roleId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      role_name: Sequelize.STRING,
      created_by: Sequelize.STRING,
      updated_by: Sequelize.STRING,
    });
    this.RolePermission = this.sequelize.define('RolePermission', {
      permissionId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      permission_type: Sequelize.STRING,
      created_by: Sequelize.STRING,
    });
    this.RoleGroup = this.sequelize.define('RoleGroup', {
      groupId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      group_type: Sequelize.STRING,
      created_by: Sequelize.STRING,
    });

    this.User.belongsToMany(this.Group, { through: this.UserGroup });
    this.Group.belongsToMany(this.User, { through: this.UserGroup });
    this.User.belongsToMany(this.Role, { through: this.UserRole });
    this.User.hasOne(this.UserProfile);
    this.Role.belongsToMany(this.User, { through: this.UserRole });
    this.Role.hasMany(this.RolePermission, { foreignKey: 'roleId' });
    this.Role.hasMany(this.RoleGroup, { foreignKey: 'roleId' });
    this.Group.belongsTo(this.Role);
  }

  async align() {
    try {
      await this.sequelize.sync();
    } catch (e) {}
  }
}

export default UserDBSchema;
