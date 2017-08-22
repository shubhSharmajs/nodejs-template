/**
 * Created by Rober on 6/10/2016.
 */

let bodyParser = require('body-parser');

export default class RouterBase{
  constructor(router,options){
    this.router = router;
    this.options = options;
    this._setupPreProcessing();
    this._setupDefaultRoutes();
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
  _setupDefaultRoutes(){
    this.router.route('/').get((req, res) => {
        this.search(req, res).then((data)=>{}).catch((err) => res.json({error:true,message:err.toString()}));
      }).post((req, res) => {
        this.post(req, res).then((data)=>{}).catch((err) => res.json({error:true,message:err.toString()}));
    });
    // route middleware to validate :id
    this.router.param('id', (req, res,next, id) => {
      req.id = id;
      next();
    });

    this.router.route('/:id').get((req, res) => {
      this.getById(req.id, req, res).then((data)=>{})
        .catch((err) => res.json({error:true,message:err.toString()}));
    }).put((req, res) =>{
      this.put(req.id,req, res).then((data)=>{})
        .catch((err) => res.json({error:true,message:err.toString()}));
    }).patch((req, res) =>{
      this.patch(req.id,req, res).then((data)=>{})
        .catch((err) => res.json({error:true,message:err.toString()}));
    }).delete((req,res,next) =>{
      this.deleteById(req.id,req,res).then((data)=>{})
        .catch((err) => res.json({error:true,message:err.toString()}));
    });
  }
  _setupPreProcessing(){
    //Parse JSON
    this.router.use(bodyParser.json()); // for parsing application/json

    this.router.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
  }
}
