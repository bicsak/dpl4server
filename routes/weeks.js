let express = require('express');
const jwt = require('jsonwebtoken');
let router = express.Router();
const mongoose = require('mongoose');
const Dpl = require('../models/dpl');
const Period = require('../models/period');
const Week = require('../models/week');
const Dienst = require('../models/dienst');
const Profile = require('../models/profile');

async function createWeekDataRaw(begin, authData, sec) {
   let beginDate = new Date(begin*1000); 

   let weekRaw = { begin: parseInt(begin) }; // for return value

   let wplDoc = await Week.findOne({
      o: authData.o,
      begin: beginDate               
   }).populate('season', 'label begin end -_id')
   .populate('o', 'timezone')
   //.populate('dienst.prod')
   .populate({
      path: 'dienst.prod',
      populate: {
         path: 'firstDienst',
         select: 'begin -_id',
         options: {
            transform: doc => doc == null ? null : doc.begin.getTime()
         }
      },
      select: 'duration name firstDienst instrumentation'
   })
   .select('-dpls -begin');

   if ( wplDoc ) {
      let dplDocs;
      let wplRaw = {
         season: wplDoc.season,
         editable: wplDoc.editable,
         remark: wplDoc.remark,
         dienst: wplDoc.dienst
      };      

      if (sec) dplDocs = await Dpl.find({
         o: authData.o,         
         w: wplDoc.id,
         s: sec
      }).populate({
         path: 'p',
         select: 'begin members.row members.initial members.start members.factor', // -_id
         populate: {
            path: 'members.prof',
            select: 'userFn userSn userBirthday'
         }
      }).select('-absent._id -seatings.dienstBegin -seatings.dienstInstr -seatings.dienstWeight -seatings._id');                                
      else dplDocs = await Dpl.find({ o: authData.o, w: wplDoc.id }).populate({
         path: 'p',
         select: 'begin members.row members.initial members.start members.factor', // -_id
         populate: {
            path: 'members.prof',
            select: 'userFn userSn userBirthday'
         }
      }).select('-absent._id -seatings.dienstBegin -seatings.dienstInstr -seatings.dienstWeight -seatings._id');                                

      let dplRaw = {};
      if ( dplDocs.length ) // scheduler already created dpl for this week
      {
         
         for ( let i = 0; i < dplDocs.length; i++ ) {
            // dpl data accessible only for active members of the group and scheduler...
            // office has access only to closed dpls
            let dplAccess = true;         
            if (  authData.r == 'musician'
               && !dplDocs[i].p.members.find( m =>  m.prof._id == authData.pid ) ||
               authData.r == 'office' && !dplDocs[i].closed ) dplAccess = false;                
            
            let finalRemark; let finalAbsent; let finalSeatings;

            if ( !dplAccess ) {
               // remove all seating data if no access should be granted
               finalAbsent = dplDocs[i].absent.map(
                  (abs) => {
                     return {
                        am: abs.am.fill(0),
                        pm: abs.pm.fill(0)
                     }
                  }
               );
               finalSeatings = dplDocs[i].seatings.map(
                  (seatingObj) => { 
                     return {
                        sp: seatingObj.sp.fill(0),
                        d: seatingObj.d,
                        ext: 0                        
                     };
                  }
               );
            } else {
               finalRemark = dplDocs[i].remark;
               if ( authData.r == 'office' ) {
                  finalAbsent = dplDocs[i].absent.map(
                     (abs) => {
                        return {
                           am: abs.am.map(v => v == 4 ? 0 : v),
                           pm: abs.pm.map(v => v == 4 ? 0 : v)
                        }
                     }
                  ); // erase fw-s (- signs)...   
                  finalSeatings = dplDocs[i].seatings.map( v => {                      
                     return {
                        d: v.d,
                        ext: v.ext,
                        comment: v.comment,
                        sp: v.sp.map( c => c == 2 ? 0 : c)                        
                     }                     
                  } );
                  //...and erase dw-s (+ signs)
               } else {
                  finalAbsent = dplDocs[i].absent;
                  finalSeatings = dplDocs[i].seatings;
               }               
            }            
   
            dplRaw[dplDocs[i].s] = {
               period: dplDocs[i].p,
               accessAllowed: dplAccess,
               closed: dplDocs[i].closed,
               remark: finalRemark, //scheduler's remark for the whole week
               absent: finalAbsent, // Krankmeldunden, Freiwünsche etc.
               sps: finalSeatings // seating plans for each dienst                                  
            };                                             


            /* Dienstzahlen --- only if authorized and single section request */
            if ( (authData.r === 'musician' || authData.r === 'scheduler') && sec ) {   
               dplRaw[dplDocs[i].s] = {
                  ...dplRaw[dplDocs[i].s],
                  start: dplDocs[i].start,
                  correction: dplDocs[i].correction                
               };
               
               let lastDplDoc = await Dpl
               .find({
                  o: authData.o,
                  s: dplDocs[i].s,                                                 
               })
               .where('weekBegin').lt(wplDoc.season.begin).gte(dplDocs[i].p.begin) // before this week                                 
               .sort('-weekBegin')
               .limit(1)                              
               .select('start delta correction weekBegin');               
               let normVal = 0;
               if ( lastDplDoc.length ) {
                  //console.log(lastDpl);
                  let endOfWeek = lastDplDoc[0].start.map( (val, j) => 
                     val + lastDplDoc[0].correction[j] + lastDplDoc[0].delta[j]*dplDocs[i].p.members[j].factor + dplDocs[i].p.members[j].start );                  
                  normVal = Math.min(...endOfWeek);                  
                  dplRaw[dplDocs[i].s].start = dplDocs[i].start.map( (val) => val-normVal );
               }               
            }                                                                                                              
         }
                           
      } 

      weekRaw = {
         ...weekRaw,
         oTz: wplDoc.o.timezone,
         wpl: wplRaw,
         dpls: dplRaw         
      };         
      
      /* Assigned Period --- only if single section request */ 
      if ( sec && !dplDocs.length ) {
         let p = await Period.find({
            o: authData.o,
            s: sec                  
         }).where('begin').lte(beginDate)
         .select('begin members')
         .sort('-begin')
         .limit(1)
         .populate('members.prof', 'userFn userSn userBirthday'); 
         
         if (p.length) weekRaw.assignedPeriod = p[0];
      }      
   }
   
   return weekRaw;          
}

async function renumberProduction(sId /* season */, pId /* prod id */ ) {
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
       'dienst.prod': pId} // specified production
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
    { newRoot: '$dienst' },
    { "$sort": { begin: 1 } }        
   ] );
   
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
         }
       );                        
       await DienstExtRef.updateOne(
         { _id: d._id },
         { 'seq': d.seq, 
         'total': d.category == 0 ? max.r[rehearsalType] : max.p //d.total
         }
       );
     }    
}

router.get('/:mts', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
         let resp = await createWeekDataRaw(req.params.mts, authData);          
         res.json( resp );
      }
   });
});

router.get('/:section/:mts', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
         let resp = await createWeekDataRaw(req.params.mts, authData, req.params.section);          
         res.json( resp );
      }
   });
});

router.patch('/:mts', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || authData.r !== 'office' || !authData.m ) { res.sendStatus(401); return; }
      if ( req.body.path === '/remark' ) {
         if ( req.body.op === 'replace' ) {            
            await Week.findOneAndUpdate( { 
               o: authData.o,
               begin: new Date(req.params.mts * 1000)
            }, {
               remark: req.body.value
            });
            res.json( { remark: req.body.value } ); 
            return;
         } else if (req.body.op === 'remove' ) {            
            await Week.findOneAndUpdate( { 
               o: authData.o,
               begin: new Date(req.params.mts * 1000)
            }, {
               remark: null
            });
            res.sendStatus( 204 ); 
            return;
         }
      } else if ( req.body.path === '/editable' && req.body.op === 'replace' ) {

         const session = await mongoose.connection.startSession();
         try {
            session.startTransaction();
            weekDoc = await Week.findOneAndUpdate( { 
               o: authData.o,
               begin: new Date(req.params.mts * 1000)
            }, {
               editable: req.body.value
            }, { session } );
   
            await Dpl.updateMany( { 
               o: authData.o,
               w: weekDoc._id
            }, {
               weekEditable: req.body.value
            }, { session } );

            await session.commitTransaction();
         } catch(error) {
            console.log('error, aborting transaction');
            console.log(error);
            await session.abortTransaction();
         }
         session.endSession();       

         res.json( { editable: req.body.value } ); //TODO push-notifications
         return;
      }
   });
});

router.patch('/:mts/:did', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || authData.r !== 'office' || !authData.m ) { res.sendStatus(401); return; }

      // TODO req.body is an array of {op:..., path: ..., value: ...}
      if ( req.body.path === '/instr' ) {
         if ( req.body.op === 'replace' ) { 
            const session = await mongoose.connection.startSession();
            try {
               session.startTransaction();                       
               let weekDoc = await Week.findOneAndUpdate({
                  'dienst._id': req.params.did
               }, {
                  '$set': { 'dienst.$.instrumentation': req.body.value }               
               }, { session } );
               await Dienst.findByIdAndUpdate(req.params.did, {
                  '$set': { 'instrumentation': req.body.value }               
               }, { session } );
               /*Object.entries(req.body.value).forEach( async ([key, value]) => {
                  await Dpl.findOneAndUpdate({
                     o: authData.o,
                     s: key,
                     w: weekDoc._id,
                     'seatings.d': req.params.did
                  }, {
                     'seatings.$.dienstInstr': value
                  }, { session } );
                  //does not work because anonym function promise (async) in try-catch block
               });*/               

               for (const key in req.body.value) {
                  if (req.body.value.hasOwnProperty(key)) {
                     await Dpl.findOneAndUpdate({
                        o: authData.o,
                        s: key,
                        w: weekDoc._id,
                        'seatings.d': req.params.did
                     }, {
                        'seatings.$.dienstInstr': req.body.value[key]
                     }, { session } );
                      
                  }
               }
               await session.commitTransaction();
            } catch(error) {
               console.log('error, aborting transaction');
               console.log(error);
               await session.abortTransaction();
            }
            session.endSession();

            res.json( { instrumentation: req.body.value } );            
            return;
         } 
      }
   });
});


router.delete('/:mts/:did', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || authData.r !== 'office' || !authData.m ) { res.sendStatus(401); return; }
      console.log(`Deleting Dienst req ${req.params.mts}, ${req.params.did}`);
      // read dienst to get season id and prod id for renumber function
      dienstDoc = await DienstExtRef.findOne( { _id: req.params.did } );

      // delete dienst from weeks coll
      await Week.updateOne( { _id: req.params.mts }, // todo not correct, need id
      { $pull: { dienste: { $elemMatch: {_id: req.params.did} } } } );

      //delete dienst from dienstextref coll
      await DienstExtRef.deleteOne( { _id: req.params.id } );
      
      // recalc OA1, etc. for season and production (if not sonst. dienst): 
      await renumberProduction(dienstDoc.s._id, dienstDoc.prod._id);
      
      //TODO
      // recalc dienstzahlen for all dpls
      // delete seatings subdocs from all dpls
      
      // return new week plan
      let resp = await createWeekDataRaw(req.params.mts, authData);          
      res.json( resp );            
   });
});


router.post('/:mts', async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err || authData.r !== 'office' || !authData.m ) { res.sendStatus(401); return; }
      // TODO create new dienst 

      // insert new dienst for week id :mts
      // with or without dienst instrumentation (paste / new)
      // insert new week for dienst ext ref collection
      // recalc OA1, etc. for season and production (if not sonst. dienst)      
      // add seatings subdocs for all dpls
      // return new week plan
   });
});

/*
router.post('/', function(req, res){
   res.send('POST route on weeks.');
});*/

//export this router to use in our index.js
module.exports = router;