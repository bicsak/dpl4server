let express = require('express');
const mongoose = require( 'mongoose' );
let router = express.Router();
const jwt = require('jsonwebtoken');
const Production = require('../models/production');
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

router.get('/:season', verifyToken, async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
        console.log("loading Productions...");                 
        console.log(req.params.season)         ;

        aggregatedDienst = await DienstExtRef.aggregate( [        
            { "$match": { /*'begin': {'$lt' : new Date()} } */ 
                season: new mongoose.Types.ObjectId(req.params.season),
                o: new mongoose.Types.ObjectId(authData.o),
                category: { $ne: 2 } 
            } },
            //{ "$unwind": { 'path': '$dienst'} },
            /*{ "$match": { 
              'dienst.category': { '$ne': 2 }, // no special dienste
              'dienst.total': { '$ne': -1 } }  // no excluded dienste
            },*/
            { "$group": { 
              "_id": "$prod"/*,
              "dienste": {
                '$push': {
                  begin: "$dienst.begin", 
                  cat: "$dienst.category", 
                  subtype: "$dienst.subtype", 
                  seq: "$dienst.seq", 
                  total: "$dienst.total",
                  did: "$dienst._id"
                }
              }  */
            } }/*,          
            { "$sort": {'dienst.begin': 1} }        */
          ]);
          console.log(aggregatedDienst);

          let resp = await Production
          .find( { 
              o: authData.o,
            _id: {
                "$in": aggregatedDienst.map( x => x._id )
            } } )
        .select('name comment duration firstDienst')
        .populate('firstDienst', 'begin -_id');        
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