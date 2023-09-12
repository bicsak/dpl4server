let express = require('express');
let router = express.Router();


router.get('/', async function(req, res) { 
    try {
       /*let response = await Profile.find( { o: req.authData.o } );         
       if ( req.query.full == 'true' ) {      
          for ( let i = 0; i < response.length; i++ ){        
             response[i] = await addStat(response[i]);
          }      
       } */     
       //TODO
       response = {
        fw: 1,
        email: 'valami',
        notifications: {
            commentNew: false,
            dplChanged: false,
            dplFinal: false
        }
       };
       res.status(200).json( response );   
    } catch (err) {
       res.status(500).json( { message: err.message } );
    }
 });

router.patch('/notification', async function(req, res) { 
   //TODO body: path: 'commentNew' | 'DPLChanged' | 'DPLNew', value: true/false
   try {
      /*let response = await Season.find( { o: req.authData.o } );         
      if ( req.query.full == 'true' ) {      
         for ( let i = 0; i < response.length; i++ ){        
            response[i] = await addStat(response[i]);
         }      
      } */     
      console.log('patch request notifications', req.body.path, req.body.value);
      response = {
       value: req.body.value // TODO save it really into Db
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

router.patch('/email', async function(req, res) {    
   try {
      /*let response = await Season.find( { o: req.authData.o } );         
      if ( req.query.full == 'true' ) {      
         for ( let i = 0; i < response.length; i++ ){        
            response[i] = await addStat(response[i]);
         }      
      } */     
      response = {
       email: '' // TODO
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

router.patch('/pw', async function(req, res) {    
   try {
      /*let response = await Season.find( { o: req.authData.o } );         
      if ( req.query.full == 'true' ) {      
         for ( let i = 0; i < response.length; i++ ){        
            response[i] = await addStat(response[i]);
         }      
      } */           
      res.status(200)/*.json( response )*/;   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

router.patch('/fw', async function(req, res) {    
   try {
      /*let response = await Season.find( { o: req.authData.o } );         
      if ( req.query.full == 'true' ) {      
         for ( let i = 0; i < response.length; i++ ){        
            response[i] = await addStat(response[i]);
         }      
      } */     
      response = {
       fw: 0 // TODO
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});


//export this router to use in our index.js
module.exports = router;