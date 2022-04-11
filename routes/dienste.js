let express = require('express');
const mongoose = require( 'mongoose' );
let router = express.Router();
const jwt = require('jsonwebtoken');
const DienstExtRef = require('../models/dienst');

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
        console.log(`loading Dienste for ${req.query.q}...`);

          let resp = await DienstExtRef.find( { 
              o: authData.o,
              category: 2,
              name: { $regex: req.query.q, $options: '^' }
            } ).limit(10).select('name -_id');                
        res.json( resp.map( doc => doc.name ) ); 

      }
   });
});

//export this router to use in our index.js
module.exports = router;