let express = require('express');
let router = express.Router();
const Profile = require('../models/profile');
const Orchestra = require('../models/orchestra');
const User = require('../models/user');
const bcrypt = require('bcryptjs');

router.get('/', async function(req, res) { 
    try {
       let profDoc = await Profile.findById( req.authData.pid );                            
       response = {
        fw: null,
        email: profDoc.email,
        notifications: profDoc.notifications
       };
       if ( req.authData.r == 'scheduler' ) {
         let orchDoc = await Orchestra.findById( req.authData.o );                            
         response.fw = orchDoc.sections.get(req.authData.s).maxFW;
       }
       res.status(200).json( response );   
    } catch (err) {
       res.status(500).json( { message: err.message } );
    }
 });

router.patch('/notification', async function(req, res) { 
   // body: path: 'commentNew' | 'dplChanged' | 'dplNew' etc. value: true/false
   try {
      let path = 'notifications.'+req.body.path;
      let updateObj = {};
      updateObj[path] = req.body.value;
      await Profile.findByIdAndUpdate( req.authData.pid, {
         $set: updateObj
      } );               
      console.log('patch request notifications', req.body.path, req.body.value);
      response = {
       value: req.body.value 
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

router.patch('/email', async function(req, res) {    
   try {      
      console.log(req.body);
      await Profile.findByIdAndUpdate( req.authData.pid, {
         email: req.body.email
      } );      
      response = {
       email: req.body.email
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

router.patch('/pw', async function(req, res) {    
   try {      
      let userDoc = await User.findById(req.authData.user);      
      userDoc.comparePassword(req.body.oldPassword, (err, isMatch) => {         
         if ( !err && isMatch ) {
            // old password was correct            
            bcrypt.hash(req.body.password, 10, async (err, hash) => {
               if (err) {
                 console.log("bcrypt error");
               } else {            
                 await User.findByIdAndUpdate(req.authData.user, {
                  pw: hash
                 });
               }
             });    
             res.status(200).json({});   
         } else {            
            // old password is wrong
            res.status(403).json( { message: 'Not authenticated' } );
         }
      } );        
      
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

router.patch('/fw', async function(req, res) {    
   try {
      let path = 'sections.'+req.authData.s+'.maxFW';
      let updateObj = {};
      updateObj[path] = req.body.fw;
      await Orchestra.findByIdAndUpdate( req.authData.o, {
         $set: updateObj
      } );          
      response = {
       fw: req.body.fw
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});


//export this router to use in our index.js
module.exports = router;