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
         if ( req.query.q ) {
            console.log(`loading Dienste for ${req.query.q}...`);

            let resp = await DienstExtRef.find( { 
              o: authData.o,
              category: 2,
              name: { $regex: req.query.q, $options: '^' }
            } ).limit(10).select('name');                
            res.json( resp ); 
         } else {
            
            let q = {
               o: authData.o
            };

            switch ( req.query.category ) {
               case 'special': q.category = 2; break;
               case 'rehearsals': q.category = 0; break;
               case 'performances': q.category = 1;
            }            

            if ( req.query.category != 'special' ) q.prod = req.query.name;
            else q.name = req.query.name;

            if ( req.query.period == 'future') {
               q.begin = {
                  $gte: new Date()                  
               }
            } else if ( req.query.period == 'past' ) {
               q.begin = {
                  $lte: new Date()
               }
            } else if ( req.query.period != 'all') {
               q.season = req.query.period;
            }
            console.log(q);

            let resp = await DienstExtRef
            .find( q )
            .limit(50)
            .select('-o -prod -weight -season');                
            res.json( resp );
         }        

      }
   });
});

//export this router to use in our index.js
module.exports = router;