let express = require('express');
const mongoose = require( 'mongoose' );
let router = express.Router();
const jwt = require('jsonwebtoken');
const Production = require('../models/production');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');

router.get('/', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
        console.log(`loading Productions for ${req.query.q}...`);

          let resp = await Production.find( { 
              o: authData.o,              
              name: { $regex: req.query.q, $options: '^' }
            } ).limit(10).select('name');                
         console.log(resp);
        res.json( resp ); 

      }
   });
});

router.get('/:season', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
        console.log("loading Productions...");                 
        console.log(req.params.season)         ;

        aggregatedDienst = await DienstExtRef.aggregate( [        
            { "$match": {  
                season: new mongoose.Types.ObjectId(req.params.season),
                o: new mongoose.Types.ObjectId(authData.o),
                category: { $ne: 2 } 
            } },
            
            { "$group": { 
              "_id": "$prod"
            } }
          ]);
          console.log(aggregatedDienst);

          let resp = await Production
          .find( { 
              o: authData.o,
            _id: {
                "$in": aggregatedDienst.map( x => x._id )
            } } )
        .select('name comment duration firstDienst lastDienst instrumentation extra')
        .populate( { 
           path: 'firstDienst', 
           select: 'begin -_id', 
           options: {
              transform: doc => doc == null ? null : doc.begin.getTime()
            }
         })
         .populate( { 
            path: 'lastDienst', 
            select: 'begin -_id', 
            options: {
               transform: doc => doc == null ? null : doc.begin.getTime()
             }
          });        
        console.log(resp);
         res.json( resp );

      }
   });
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

router.patch('/:id', async function(req, res) { 
   jwt.verify(req.token, process.env.JWT_PASS, async function (err, authData) {
      if (err || ! authData.m ) 
         res.sendStatus(401);
      else {  
         const changes = req.body;
         console.log(`PATCH request for prod id:  ${req.params.id}`);
      
         if ( changes.name ) {         
            console.log(`New name: ${changes.name}`);
            // Update document in productions collection
            await Production.findOneAndUpdate( { 
               o: authData.o,
               _id: req.params.id
            }, {
               name: changes.name
            });
            
            // Update name field for all dienst in DienstExtRef collection
            await DienstExtRef.updateMany(
               { o: authData.o,
               prod: req.params.id
               },
               {
                  name: changes.name
               }
            );

            // Update name field for all dienst embedded in Week collection
            await Week.updateMany(
               { o: authData.o },
               { "$set": { "dienst.$[elem].name": changes.name } },
               { multi: true,
               arrayFilters: [ { "elem.prod": req.params.id } ] }
            );
            
            res.json( {name: changes.name} );
         } else {
            console.log( changes );
            /*let update = {
               comment: changes.comment,
               duration: changes.duration,
               extra: changes.extra,            
            };
            let instrumentation = {};
            for ( let i = 0; i < 13; i++ ) {
               if ( changes['sec'+i] ) instrumentation['sec'+i] = changes['sec'+i];
            }
            if ( instrumentation != {} ) update.instrumentation = instrumentation;

            console.log(update);*/
            
            // Update document in productions collection
            await Production.findOneAndUpdate( { 
               o: authData.o,
               _id: req.params.id
            }, changes);
            
            res.json( changes );

         }
      }
   } );   
} );

//export this router to use in our index.js
module.exports = router;