let express = require('express');
const jwt = require('jsonwebtoken');
let router = express.Router();
const mongoose = require('mongoose');
const Dpl = require('../models/dpl');
const Period = require('../models/period');
const Week = require('../models/week');
const Dienst = require('../models/dienst');
const Production = require('../models/production');
const Profile = require('../models/profile');

const { DateTime } = require("luxon");

const { writeOperation } = require('../my_modules/orch-lock');
const { createWeekDataRaw } = require('../my_modules/week-data-raw');
const Orchestra = require('../models/orchestra');

/***********
 * Handles following use cases
 * 
 * read week data GET (inculding all seating and dpl data for office or only one for members/scheduler)
 * only for manager:
 * create season POST (creates all weeks) TODO
 * edit (or remove) week's remark (by manager) PATCH
 * change editable flag of the week PATCH
 * edit dienst in a specific week POST
 * edit instrumentation of a specific dienst PATCH 
 * delete one dienst DEL
 * create a dienst in a week POST
 */

async function renumberProduction(session, sId /* season */, pId /* prod id */ ) {
   /***************************************
   * Fill seqnr, total for all dienst (BO1, 2, 3/6...)
   *****************************************/       
 
   aggregatedDienst = await Week.aggregate( [        
     { "$match": { season: sId }  }, // specified season
     { "$unwind": { 'path': '$dienst'} },
     { "$match": { 
       'dienst.category': { '$ne': 2 }, // no special dienste
       'dienst.subtype': { '$ne': 6}, // no extra rehearsal type (with special suffix)
       'dienst.total': { '$ne': -1 } ,  // no excluded dienste
       'dienst.prod':  pId } // specified production
     },     
     { "$project": {  
            _id: 0, // no week doc id
          'dienst.begin': 1, 
          'dienst.category': 1, 
          'dienst.subtype': 1, 
          'dienst.seq': 1, 
          'dienst.total': 1,
          'dienst._id': 1       
    } },                  
    { "$replaceRoot": { newRoot: '$dienst'} },
    { "$sort": { begin: 1 } }        
   ] ).session(session);
   
     let max = {
       r: [0, 0, 0, 0, 0, 0], // rehearsals
       p: 0 // performance
     }; 

     for ( let d of aggregatedDienst ) {
       if ( d.category == 0 ) {                          
         let rehearsalType = d.subtype;
         if ( d.subtype == 3 ) /* vBO */ {
           rehearsalType = 2;
         }
         d.seq = ++max.r[rehearsalType];                             
       } else {        
         d.seq = ++max.p;                          
       }
     }

     for ( let d of aggregatedDienst ) {
       let rehearsalType = d.subtype;
       if ( d.subtype == 3 ) rehearsalType = 2;
       await Week.findOneAndUpdate(
         {'dienst._id': d._id},
         { 'dienst.$.seq': d.seq, 
           'dienst.$.total': d.category == 0 ? max.r[rehearsalType] : max.p //d.total
         }).session( session);                        
       //await Dienst.updateOne(
       await Dienst.findByIdAndUpdate(         
         d._id,
         { 'seq': d.seq, 
         'total': d.category == 0 ? max.r[rehearsalType] : max.p //d.total
         }, {session: session});
     }    
}

// Subtracts dienst-weight after deleting or change in dienst weight
// corrects numbers for current and all succeding dpls for each group and members who had this dienst
async function recalcNumbersAfterWeightChange(session, o /* orchestra id*/, w /* week doc id */, 
did /* dienst id */, correction) {
   let dplDocs = await Dpl.find({o: o, w: w}).session(session);
    for (let dpl of dplDocs) {
      let seating = dpl.seatings.find(s => s.d == did);
      let diff = correction ? correction : seating.dienstWeight;      
      let corr = seating.sp.map( (num, idx) => num >= 16 ? diff : 0);            
      dpl.delta.forEach( (num, idx, arr) => arr[idx] = num - corr[idx]);      
      await dpl.save();
      let succedingDpls = await Dpl.find({o: o, d: dpl.s, p: dpl.p, weekBegin: {$gt: dpl.weekBegin} }).session(session);
      for (let succ of succedingDpls) {         
         succ.start.forEach( (num, idx, arr) => arr[idx] = num - corr[idx]);      
         await  succ.save()    
      }    
    }     
}

async function updateProductionsFirstAndLastDienst(session, o, p) {
   let firstLast = await Dienst.aggregate([
      {
        '$match': {
          'o': o, 
          'prod': p
        }
      }, {
        '$sort': {
          'begin': 1
        }
      }, {
        '$group': {
          '_id': null, 
          'firstDienst': {
            '$first': '$_id'
          }, 
          'lastDienst': {
            '$last': '$_id'
          }
        }
      }
    ]).session(session);
    console.log(firstLast);
    if ( firstLast) {
      /*await Production.updateOne( {
        o: o,
         _id: p
      }, {
         firstDienst: firstLast.firstDienst,
         lastDienst: firstLast.lastDienst
      }).session(session);*/
      await Production.findByIdAndUpdate( p, {
          firstDienst: firstLast.firstDienst,
          lastDienst: firstLast.lastDienst
       }, {session: session});
   } else {
      /*await Production.deleteOne({
         o: o, _id: p
      }).session(session);*/
      await Production.findByIdAndRemove(p, {session: session});
   }
}

// Change editable flag for week in a transaction
async function changeEditable( session, params ) {              
    let weekDoc = await Week.findOneAndUpdate( { 
        o: params.o,
        begin: params.begin
    }, {
        editable: params.editable
    }, { session: session } );    

    await Dpl.updateMany( { 
        o: params.o,
        w: weekDoc._id
    }, {
        weekEditable: params.editable
    }, { session: session  } );   

    return params.editable; // TODO
} // End of transaction function

router.get('/:mts', async function(req, res) {
   /*jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {*/
         let resp = await createWeekDataRaw(req.params.mts, req.authData);          
         res.json( resp );
      /*}
   });*/
});

router.get('/:section/:mts', async function(req, res) {
   /*jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {*/
         let resp = await createWeekDataRaw(req.params.mts, req.authData, req.params.section);                   
         res.json( resp );
      /*}
   });*/
});

router.patch('/:mts', async function(req, res) {
   //jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || req.authData.r !== 'office' || !req.authData.m ) { res.sendStatus(401); return; }
      if ( req.body.path === '/remark' ) {
         if ( req.body.op === 'replace' ) {            
            await Week.findOneAndUpdate( { 
               o: req.authData.o,
               begin: new Date(req.params.mts * 1000)
            }, {
               remark: req.body.value
            });
            res.json( { remark: req.body.value } ); 
            return;
         } else if (req.body.op === 'remove' ) {            
            await Week.findOneAndUpdate( { 
               o: req.authData.o,
               begin: new Date(req.params.mts * 1000)
            }, {
               remark: null
            });
            res.sendStatus( 204 ); 
            return;
         }
      } else if ( req.body.path === '/editable' && req.body.op === 'replace' ) {
         let result = await writeOperation( req.authData.o,
            changeEditable, {
               o: req.authData.o,               
               begin: new Date(req.params.mts * 1000),
               editable: req.body.value
            });                        

         res.json( { editable: result } ); //TODO push-notifications
         return;
      }
   //});
});

async function editInstrumentation( session, params ) {
   let weekDoc = await Week.findOneAndUpdate({
      'dienst._id': params.did
   }, {
      '$set': { 'dienst.$.instrumentation': params.instr }               
   }, { session: session } );

   await Dienst.findByIdAndUpdate(params.did, {
      '$set': { 'instrumentation': params.instr }               
   }, { session: session } );    
   
   for (const key in params.instr) {
      if (params.instr.hasOwnProperty(key)) {
         await Dpl.findOneAndUpdate({
            o: params.o,
            s: key,
            w: weekDoc._id,
            'seatings.d': params.did
         }, {
            'seatings.$.dienstInstr': params.instr[key]
         }, { session: session } );          
      }
   }

   return params.instr;
}

router.patch('/:mts/:did', async function(req, res) {
//   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || req.authData.r !== 'office' || !req.authData.m ) { res.sendStatus(401); return; }

      // TODO req.body is an array of {op:..., path: ..., value: ...}
      if ( req.body.path === '/instr' ) {
         if ( req.body.op === 'replace' ) { 

            let result = await writeOperation( req.authData.o,
            editInstrumentation, {
               o: req.authData.o,
               did: req.params.did,               
               instr: req.body.value               
            });                        
            res.json( { instrumentation: result } );            
            return;
         } 
      }
  // });
});

// deletes 1 dienst from DB in a transaction
/********
 * @params
 * session 
 * params Object: did, mts, o
 * @return true if success
 */
async function deleteDienst(session, params ) {
    // read dienst to get season id and prod id for renumber function
    let dienstDoc = await Dienst.findById( params.did ).session(session);    

    // delete dienst from weeks coll
    await Week.updateOne( { o: params.o, 'dienst._id': params.did }, 
    //{ '$pull': { dienst: { '$elemMatch': {_id: params.did} } } } ).session(session);
    { '$pull': { dienst: { _id: params.did} } }).session(session);
    
    //delete dienst from dienstextref coll
    //await Dienst.deleteOne( { '_id': params.did } ).session(session);
    await Dienst.findByIdAndRemove(params.did, {session: session});           
    
    if ( dienstDoc.prod ) {
      //update first and last dienst for this prod
      await updateProductionsFirstAndLastDienst(session, params.o, dienstDoc.prod);      
      
      // recalc OA1, etc. for season and production (if not sonst. dienst):     
      await renumberProduction(session, dienstDoc.season, dienstDoc.prod);            
    }
    
    // recalc dienstzahlen for all dpls for this week    
    await recalcNumbersAfterWeightChange(session, params.o, dienstDoc.w, params.did);        
    
    // delete seatings subdocs from all dpls
    await Dpl.updateMany({
      o: params.o,
      w: dienstDoc.w
    }, {
      '$pull': {
         seatings: {
            d: params.did
         }
      }
    } ).session(session);
    
    return true;
}

router.delete('/:mts/:did', async function(req, res) {
   //jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || req.authData.r !== 'office' || !req.authData.m ) { res.sendStatus(401); return; }
      console.log(`Deleting Dienst req ${req.params.mts}, ${req.params.did}`);
      let result = await writeOperation( req.authData.o, deleteDienst, {
         o: req.authData.o, did: req.params.did, mts: req.params.mts });      
      console.log(`Dienst successfully deleted: ${result}`);
      
      // return new week plan            
      let resp = await createWeekDataRaw(req.params.mts, req.authData);
      res.json( resp );            
   //});
});

async function createDienst(session, params) {
   console.log('createDienst transaction fn');
   console.log(params);

   let prodDoc; 
   let createProd = true;
   let newDienstId = new mongoose.Types.ObjectId();   
   let orchestraDoc = await Orchestra.findById(params.o).session(session);                  
   let dienstInstrumentation = new Map(
      Array.from(orchestraDoc.sections, ([key, value]) => [key, 0] )            
   );

   let weekDoc = await Week.findOne( {o: params.o, begin: new Date(params.mts * 1000)} ).session(session);

   if ( params.category !== 2 ) {
      
      if ( ! (params.prod instanceof Object) ) {         
         createProd = false;
         prodDoc = await Production.findById(params.prod).session(session);         
         
         dienstInstrumentation = new Map(
            Array.from(prodDoc.instrumentation, ([key, value]) => [key, value.count] ) 
         );  
         //console.log(prodDoc.instrumentation);
         //console.log(dienstInstrumentation);
      } else {                  
         let prodInstrumentation = new Map(
            Array.from(orchestraDoc.sections, ([key, value]) => [key, {count: 0, extra: ''}] )            
         );
         // set instrumentation values of the map from params.prod.instrumentation for active sections
         Object.entries(params.prod.instrumentation).forEach(([key, value]) => {
            prodInstrumentation.set(key, value);   
         });         

         prodDoc = new Production( {
            o: params.o, 
            name: params.prod.name, 
            comment: params.prod.comment, // Musikalische Leitung, Regisseur, Konzertprogramm etc. 
            extra: params.prod.extra, // optional, extra instruments (Celesta, Harp, Alt-Saxofon etc.)               
            instrumentation: prodInstrumentation, // template instrumentation. Dienst-Besetzung kann abweichen!
            firstDienst: newDienstId,
            lastDienst: newDienstId,    
            duration: params.prod.duration // optional, only if duration is specified for this prod            
         } );
         prodDoc.$session(session);
         await prodDoc.save();                  
         
         dienstInstrumentation = new Map(
            Array.from(prodInstrumentation, ([key, value]) => [key, value.count] )            
         );                    
      }
   }
   
   if ( params.instrumentation ) {
      // if it was a copy-paste create-dienst
      // we have explicitly instrumentation for dienst
      // overwrite key, values from from params.instrumentations      
      Object.entries(params.instrumentation).forEach(([key, value]) => {
         dienstInstrumentation.set(key, value);   
      });               
   }

   // insert new week for dienst ext ref collection
   const dienstDoc = new Dienst( {
      _id: newDienstId,
      o: params.o,
      season: weekDoc.season,
      w: weekDoc._id,
      begin: new Date(params.begin), 
      name: params.name,
      prod: prodDoc?._id,
      category: params.category,
      subtype: params.subtype,
      weight: params.weight,
      comment: params.comment,
      instrumentation: dienstInstrumentation,
      location: params.location,
      duration: params.duration
   } );
   dienstDoc.$session(session);
   await dienstDoc.save();
   
   // insert new dienst for week
   weekDoc.dienst.push( {
      _id: dienstDoc._id,
      name: dienstDoc.name,
      begin: dienstDoc.begin,
      prod: dienstDoc.prod,
      category: dienstDoc.category,
      subtype: dienstDoc.subtype,
      suffix: dienstDoc.suffix,
      weight: dienstDoc.weight,
      duration: dienstDoc.duration, // or undefined for auto duration calculation    
      location: dienstDoc.location,
      instrumentation: dienstDoc.instrumentation,
      comment: dienstDoc.comment, // by manager (for example: Kleiderordnung, Anspielprobe etc.)
      seq: 0, // -1 for exluded, 0: not calculated, 1..n
      total: 0 // total of performances/rehearsals this kind in the season
   } );
   await weekDoc.save();   
   
   if ( params.category !== 2 && !createProd ) {
      //update first and last dienst for this prod
      await updateProductionsFirstAndLastDienst(session, params.o, prodDoc._id);      
      
      // recalc OA1, etc. for season and production (if not sonst. dienst):     
      await renumberProduction(session, dienstDoc.season, prodDoc._id);            
   }
   
   // add seatings subdocs for all dpls
   let dplDocs = await Dpl.find({o: params.o, w: weekDoc._id}).session(session);   
    for (let dpl of dplDocs) {
      //console.log(dpl);
      let seatingDoc = dpl.seatings.create({
         d: dienstDoc._id,
         ext: 0,
         sp: Array(dpl.start.length).fill(0),
         comment: '',
         dienstBegin: dienstDoc.begin,
         dienstWeight: dienstDoc.weight,
         dienstInstr: dienstDoc.instrumentation.get(dpl.s)
      });
      dpl.seatings.push( seatingDoc );      
      //console.log(seatingDoc);
      await dpl.save();      
    }     
   
   return true;
}

router.post('/:mts', async function(req, res) {
   //jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || req.authData.r !== 'office' || !req.authData.m ) { res.sendStatus(401); return; }      
      let result = await writeOperation( req.authData.o, createDienst, {
         ...req.body, 
         o: req.authData.o, 
         mts: req.params.mts
      });      
      console.log(`Dienst successfully created: ${result}`);      
      
      // return new week plan            
      let resp = await createWeekDataRaw(req.params.mts, req.authData);
      res.json( resp );            
  // });
});

async function editDienst(session, params) {
   console.log(params);

   // read dienst to get season id and prod id for renumber function
   let dienstDoc = await Dienst.findById( params.did ).session(session);    
   let oldWeight = dienstDoc.weight;

   await Week.findOneAndUpdate( { 
      o: params.o,
      /*begin: new Date(params.mts * 1000),*/
      'dienst._id': params.did
   }, {
      '$set': {          
         'dienst.$.subtype': params.subtype,
         'dienst.$.suffix': params.suffix,
         'dienst.$.begin': new Date(params.begin),
         'dienst.$.name': params.name,
         'dienst.$.weight': params.weight,
         'dienst.$.comment': params.comment,
         'dienst.$.duration': params.duration,
         'dienst.$.location': params.location ? { 
            full: params.location.full, 
            abbr: params.location.abbr} : undefined
       }      
   }, {session: session});

   dienstDoc.subtype= params.subtype;
   dienstDoc.suffix= params.suffix;
   dienstDoc.begin= new Date(params.begin);
   dienstDoc.name= params.name;
   dienstDoc.weight= params.weight;
   //dienstDoc.comment= params.comment;
   //dienstDoc.duration= params.duration;
   /*dienstDoc.location= params.location ? { 
      full: params.location.full, 
      abbr: params.location.abbr} : undefined;*/

   await dienstDoc.save();

   // recalc OA1, etc. for season and production (if not sonst. dienst):     
   await renumberProduction(session, dienstDoc.season, dienstDoc.prod);            

   // recalc dienstzahlen for all dpls for this week    
   await recalcNumbersAfterWeightChange(session, params.o, dienstDoc.w, params.did,
      oldWeight - dienstDoc.weight); 

   //update all seating docs in all 
   let dplDocs = await Dpl.find({o: params.o, w: dienstDoc.w}).session(session);
    for (let dpl of dplDocs) {
      let seating = {
         d: dienstDoc._id,
         ext: 0,
         sp: Array(dpl.start.legth).fill(0),
         comment: '',
         dienstBegin: dienstDoc.begin,
         dienstWeight: dienstDoc.weight,
         dienstInstr: dienstDoc.instrumentation.get(dpl.s)
      };                  

      await Dpl.findOneAndUpdate({
         'seatings.d': dienstDoc._id
      }, {
         '$set': { 'seatings.$':  seating}               
      }, { session: session } );

      //dpl.seatings.forEach(... remove())
      //await dpl.save();
      
      // does not work
      // dpl.seatings.id(dienstDoc._id) not the id but d      
    }     
   

   return true;
}

router.post('/:mts/:did', async function(req, res) {
   console.log(req.body);
   //jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || req.authData.r !== 'office' || !req.authData.m ) { res.sendStatus(401); return; }      
      let result = await writeOperation( req.authData.o, editDienst, {
         ...req.body, 
         o: req.authData.o, 
         mts: req.params.mts, 
         did: req.params.did, 
      });      
      console.log(`Dienst successfully updated: ${result}`);      
      
      // return new week plan            
      let resp = await createWeekDataRaw(req.params.mts, req.authData);
      res.json( resp );            
  // });
});

//export this router to use in our index.js
module.exports = router;