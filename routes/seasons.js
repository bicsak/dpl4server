let express = require('express');
let router = express.Router();
const jwt = require('jsonwebtoken');
const Season = require('../models/season');

function verifyToken(req,res,next) {
   const bearerHeader = req.headers['authorization'];
   if ( typeof bearerHeader !== 'undefined' ) {
      const bearer = bearerHeader.split(' ');
      const bearerToken = bearer[1];
      req.token = bearerToken;
      next();
   } else {
      req.sendStatus(401);
   }
}


router.get('/', verifyToken, async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
         let resp = await Season.find( { o: authData.o } );
         console.log(resp);
         res.json( resp );
      }
   });
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;