let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');
const Orchestra = require('../models/orchestra');

/*const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');
*/

router.patch('', async function(req, res) { 
   console.log(req.body);
   console.log(req.authData);   
    if (req.authData.m ) {
      let updatedO = await Orchestra.findByIdAndUpdate(req.authData.o, req.body, {returnDocument: 'after'});
       /*let result = await writeOperation( req.authData.o, replacePeriodComment, {      
          //o: req.authData.o,       
          pId: req.params.pId,      
          //sec: req.authData.s,
          newComment: req.body.value
       });      */
       //console.log(`Comment changed: ${result}`);  
       console.log(updatedO);
       res.json(  updatedO );  
    } else {
      res.status(404); // Bad request
    }  
 });
 
//export this router to use in our index.js
module.exports = router;