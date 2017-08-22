/**
 * Created by robert on 8/18/17.
 */
/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */


import { Router } from 'express';
import UserDBSchema from '../database/schema'
import Sequelize from 'sequelize';
const router = new Router();

import SqlStore from '../modules/databaseFilter';
import RouterBase from '../router/routerbase'
class BaseApi extends RouterBase{
  constructor(){
    let router =  new Router();
    super(router, {});
    this.router = router;
  }
  async search(req,res){

  }
  async getById(id, req, res){

  }
  async post(req, res){

  }
  async put(id, req, res){

  }
  async patch(id, req, res){

  }
  async deleteById(id,req,res){

  }
}

class UserController {
  constructor(){
    this.UserDB = new UserDBSchema();
    this.sqlStore = new SqlStore({}, this.UserDB.objectdb(),{
      userId: { type: Sequelize.INTEGER, primaryKey: true,autoIncrement: true},
      ad_display_name: Sequelize.STRING,
      ad_username: Sequelize.STRING,
      email_address: Sequelize.STRING,
      firstname: Sequelize.STRING,
      lastname: Sequelize.STRING,
      created_by: Sequelize.STRING,
      updated_by: Sequelize.STRING,
      change_pw: Sequelize.INTEGER,
      account_locked: Sequelize.INTEGER,
      user_disabled: Sequelize.INTEGER
    });

  }
  async create(obj){
     return await this.UserDB.User.create(obj);
  }
  async update(){

  }
  async delete(){

  }
  async findById(){

  }
  async findAll(query,req,res){
    return await this.sqlStore.search(req);
  }
}

class UserApi extends BaseApi{
  constructor(){
    super();
    this.userController  = new UserController();
    this.router.get("/my_method",async (req,res)=>{
      try{
        await this.my_method(req,res);
      }catch(e){
        res.json({messaage: e.toString()})
      }
    })
  }
  async my_method(req,res){

  }
  async search(req,res){
    let data = await this.userController.findAll(req.body,req,res);
    res.json(data);
  }
  async getById(id, req, res){

  }
  async post(req, res){
    let data = await this.userController.create(req.body);
    res.json(data);
  }
  async put(id, req, res){

  }
  async patch(id, req, res){

  }
  async deleteById(id,req,res){

  }
}
let userApi = new UserApi();
export default userApi.router;
