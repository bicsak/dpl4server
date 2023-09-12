let express = require('express');
let router = express.Router();


router.get('/', async function(req, res) { 
    try {
       /*let response = await Season.find( { o: req.authData.o } );         
       if ( req.query.full == 'true' ) {      
          for ( let i = 0; i < response.length; i++ ){        
             response[i] = await addStat(response[i]);
          }      
       } */     
       response = {
        fw: 1,
        email: 'valami',
        notifications: {
            commentNew: false,
            DPLChanged: false,
            DPLNew: false
        }
       };
       res.status(200).json( response );   
    } catch (err) {
       res.status(500).json( { message: err.message } );
    }
 });

 router.patch('/', async function(req, res) { 

   //TODO
   try {
      /*let response = await Season.find( { o: req.authData.o } );         
      if ( req.query.full == 'true' ) {      
         for ( let i = 0; i < response.length; i++ ){        
            response[i] = await addStat(response[i]);
         }      
      } */     
      response = {
       fw: 1,
       email: 'valami',
       notifications: {
           commentNew: false,
           DPLChanged: false,
           DPLNew: false
       }
      };
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).json( { message: err.message } );
   }
});

//export this router to use in our index.js
module.exports = router;