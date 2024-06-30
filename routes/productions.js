let express = require('express');
const mongoose = require( 'mongoose' );
let router = express.Router();
//const jwt = require('jsonwebtoken');
const Production = require('../models/production');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');

const { writeOperation } = require('../my_modules/orch-lock');

router.get('/', async function(req, res) {   
        console.log(`loading Productions for ${req.query.q}...`);
        let sanitized = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        console.log(sanitized);

          let resp = await Production.find( { 
              o: req.authData.o,              
              name: { $regex: '^'+sanitized, $options: 'i'}
            } ).limit(10).select('name duration weight firstDienst').populate({
               path: 'firstDienst',
               select: 'begin -_id',
               options: {
                  transform: doc => doc == null ? null : doc.begin.getTime()
               }
            });                
         console.log(resp);
        res.json( resp );       
});

router.get('/:season', async function(req, res) {   
        console.log("loading Productions...");                 
        console.log(req.params.season)         ;

        aggregatedDienst = await DienstExtRef.aggregate( [        
            { "$match": {  
                season: new mongoose.Types.ObjectId(req.params.season),
                o: new mongoose.Types.ObjectId(req.authData.o),
                category: { $ne: 2 } 
            } },
            
            { "$group": { 
              "_id": "$prod"
            } }
          ]);
          console.log(aggregatedDienst);

          let resp = await Production
          .find( { 
              o: req.authData.o,
            _id: {
                "$in": aggregatedDienst.map( x => x._id )
            } } )
        .select('name comment weight duration firstDienst lastDienst instrumentation extra')
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
});

async function editProdName(session, params ) {
   await Production.findByIdAndUpdate( params.id, { name: params.name }).session(session);

   if (params.all) {
      // Update name field for all dienst in DienstExtRef collection
      await DienstExtRef.updateMany(
         { o: params.o, prod: params.id },
         { name: params.name }
      ).session(session);   

      // Update name field for all dienst embedded in Week collection
      await Week.updateMany(
         { o: params.o },
         { "$set": { "dienst.$[elem].name": params.name } },
         { multi: true, arrayFilters: [ { "elem.prod": params.id } ] }
      ).session(session);
   }
   return true;
}

router.patch('/:id', async function(req, res) {    
      if ( ! req.authData.m ) 
         res.sendStatus(401);
      else {  
         const changes = req.body;
         //console.log(`PATCH request for prod id:  ${req.params.id}`);
      
         if ( changes.name ) {
            let success = await writeOperation(req.authData.o, editProdName, {
               o: req.authData.o,
               id: req.params.id,
               name: changes.name,
               all: changes.all
            });             
            
            res.json( {name: changes.name} );
         } else {
            //console.log( 'CHANGES', changes );
            let update = {
               comment: changes.comment,
               duration: changes.duration,
               weight: changes.weight,
               extra: changes.extra,            
            };            
            for (const key in changes.instrumentation) {
               if (changes.instrumentation.hasOwnProperty(key)) {
                  update['instrumentation.'+key] = changes.instrumentation[key];
               }
            }            
            //console.log(update);            
            // Update document in productions collection
            await Production.findByIdAndUpdate( req.params.id, update);
            
            res.json( changes );

         }
      }
   //} );   
} );

//export this router to use in our index.js
module.exports = router;