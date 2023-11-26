let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');

/*const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');
*/

router.patch('', async function(req, res) {           
    if (req.body.path == 'comment' && req.body.op == 'replace') {
       let result = await writeOperation( req.authData.o, replacePeriodComment, {      
          //o: req.authData.o,       
          pId: req.params.pId,      
          //sec: req.authData.s,
          newComment: req.body.value
       });      
       console.log(`Comment changed: ${result}`);  
       res.json( {
          success: true,
          content: result
       } );  
    } else {
      res.status(404); // Bad request
    }      
 });
 
//export this router to use in our index.js
module.exports = router;