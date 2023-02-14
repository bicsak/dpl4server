let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );

const { writeOperation } = require('../my_modules/orch-lock');
const { createWeekDataRaw } = require('../my_modules/week-data-raw');

const Orchestra = require('../models/orchestra');
const Week = require('../models/week');
const Dpl = require('../models/dpl');
const Dplmeta = require('../models/dplmeta');

/***********
 * Handles following cases
 * 
 * only for scheduler: 
 * TODO create dpl POST
 * edit dpl (seatings with extern, scheduler's comment, absent and seating array) POST
 * edit dpl's remark by scheduler PATCH
 * edit dpl's dz corrections
 * TODO edit dpl status (close/publish etc.) PATCH
 * 
 * for members:
 * edit fw/dw by members PATCH
 */

async function countFw(orchId, section, periodId, seasonId, memberIndex) {
   // sum of fw's for this member in season and (piece of) period                 
   let result = await Dpl.aggregate( [
      { '$match': {
         'o': mongoose.Types.ObjectId(orchId), 
         's': section,
         'p': mongoose.Types.ObjectId(periodId), 
      'weekSeason': mongoose.Types.ObjectId(seasonId) } }, 
      { '$unwind': { 'path': '$absent' } }, 
      { '$unwind': { 'path': '$absent', 'includeArrayIndex': 'member' } }, 
      { '$match': { 'member': memberIndex, 'absent': 4 } }, 
      { '$count': 'countFw' }
   ] );   
   return result[0].countFw;
}

// Freiwunsch, Dienstwunsch eintragen/löschen
async function editFwDw( session, params ) {
   let returnVal;    

   let orch = await Orchestra.findById(params.o).session(session);
   let tz = orch.timezone;
   
   // check if dpl's monday is in the future)
   if ( params.begin <= Date.now() ) return { 
      success: false, 
      reason: 'Keine Bearbeitung mehr möglich'
   };
   
   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.begin,
      weekEditable: true,
      closed: false
   } ).session(session).populate('p').populate('weekSeason');   
     
   if ( !affectedDpl ) return { 
      success: false, 
      reason: 'Dienstplan existiert nicht, abgeschlossen oder Woche nicht zum Einteilen freigegeben'
   };
      
   let row = affectedDpl.p.members.findIndex( mem => mem.prof == params.prof );
   if ( row == -1 || !affectedDpl.p.members[row].canWish ) return { 
      success: false, 
      reason: 'Nicht berechtigt'
   };

   if ( params.dw ) {       
      // ********* Dienstwunsch *************
      /*let updateOpt = {};
      updateOpt[`seatings.$.available.${params.mi}`] = !params.erase;
      await Dpl.updateOne( { 
         o: params.o,
         s: params.sec,
         weekBegin: params.begin,                  
         "seatings.d": params.did
      }, { $set: updateOpt } , { session: session  } );*/      
      let seatingIndex = affectedDpl.seatings.findIndex( s => s.d == params.did );
      let dt = DateTime.fromMillis(
         affectedDpl.seatings[seatingIndex].dienstBegin.getTime(), 
         { zone: tz } );            
      let ind = dt.weekday - 1;
      let pmOffset = dt.hour >= 12 ? 1 : 0;                      
      if ( seatingIndex < 0 || 
         affectedDpl.seatings[seatingIndex].sp[params.mi] != 0 || 
         affectedDpl.absent[ind * 2 + pmOffset][params.mi] != 0 ) returnVal = { 
         success: false, reason: 'Eintragen nicht möglich'
      }; else {
         affectedDpl.seatings[seatingIndex].available[params.mi] = !params.erase;
         await affectedDpl.save();
         returnVal = { success: true };
      }      
   } else {  
      // *********** Freiwunsch **************           
      let numberOfWeeks = 0;
      let maxFW = orch.sections.get(params.sec).maxFW;
      if ( !params.erase ) { 
         // ****** Add FW *********                                       
         // calculate max fw for this season (section)
         let extraCriteria = {}; let hasExtraCrit = false;
         if ( !affectedDpl.p.isOpenEnd && affectedDpl.p.nextPBegin.getTime() < affectedDpl.weekSeason.end.getTime() ) {           
            extraCriteria['$lte'] = affectedDpl.p.nextPBegin.getTime() ;
            hasExtraCrit = true;
         }
         if ( affectedDpl.p.begin.getTime() > affectedDpl.weekSeason.begin.getTime() ) {
            extraCriteria['$gte'] = affectedDpl.p.begin.getTime();
            hasExtraCrit = true;
         }
                  
         if ( hasExtraCrit) numberOfWeeks = await Week.countDocuments( {
            o: params.o,
            season: affectedDpl.weekSeason._id,
            begin: extraCriteria
         }); else numberOfWeeks = await Week.countDocuments( {
            o: params.o,
            season: affectedDpl.weekSeason._id
         });
        
         fwCount = await countFw(params.o, params.sec, affectedDpl.p._id, affectedDpl.weekSeason._id, params.mi);
         
          if ( numberOfWeeks * maxFW < fwCount + 1 ) return { 
            success: false, 
            reason: 'FW-Kontingent erschöpft'
         };
         
         console.log(fwCount);

         // check if all seatings in affectedDpl.seatings for params.col satisfies criteria
         // for all dienste that lies in this column: 
         // no available, no seatings[...].sp[...] and has enough collegues
         let unavailableCount = affectedDpl.absent[params.col].reduce(
            (prev, curr,i) => prev + (curr == 0 ? 0 : 1), 0            
         );
         let groupSize = affectedDpl.p.members.length;         
         let colBegin = DateTime.fromMillis(affectedDpl.weekBegin.getTime(), {zone: tz})
         .plus( {days: Math.floor(params.col / 2), hours: params.col % 2 * 12} );
         let colEnd = colBegin.plus( {hours: 12} );
         let isEditable = params.erase || affectedDpl.seatings.filter( 
            s => s.dienstBegin.getTime() >= colBegin.toMillis() && s.dienstBegin.getTime() < colEnd.toMillis()
         ).every( s => {
            //console.log(`Unavailable count: ${unavailableCount}, gr size: ${groupSize}`);
            //console.log(`Observing ${s}`);
            if ( groupSize + s.ext - unavailableCount - s.dienstInstr - s.sp.filter( v => v >= 64 ).length <= 0 ) return false;
            return s.available[params.mi] == 0 && s.sp[params.mi] == 0;               
            }
         );         
         // and no fw/fw is marked
         if ( params.erase && affectedDpl.absent[params.col][params.mi] != 4 ||
            !params.erase && affectedDpl.absent[params.col][params.mi] != 0 ||
            !isEditable ) return {
               success: false, 
               reason: 'Eintragen nicht möglich'
         };
      }
      let updateOpt = {};
      updateOpt[`absent.${params.col}.${params.mi}`] = params.erase ? 0 : 4;
      await Dpl.updateOne( { 
         o: params.o,
         s: params.sec,
         weekBegin: params.begin         
      }, updateOpt, { session: session  } ); 
      /*affectedDpl.absent[params.col][params.mi] = params.erase ? 0 : 4;
      console.log(affectedDpl);  
      mongoose.set('debug', true);
      await affectedDpl.save();*/
      returnVal = { 
         success: true, 
         fwCount: params.erase ? undefined : fwCount + 1,
         maxFw: params.erase ? undefined : numberOfWeeks * maxFW
      };      
   }
   return returnVal; 
} // End of transaction function

// Updates dz begin in succeeding weeks' dpls
// after scheduler's editing dpl seating 
// deleting dpl
// or editing correction
async function recalcNumbersAfterEdit(session, o /* orchestra id*/, s /* section */, 
   begin /* modified week's monday as Date obj - succeeding weeks have weekBegin > begin */, 
   p /* period - modify only dpls for this period*/, correction) {
  
      let succedingDpls = await Dpl.find({
         o: o, s: s, p: p, weekBegin: {$gt: begin} }).session(session);
      for (let succ of succedingDpls) {         
         succ.start.forEach( (num, idx, arr) => arr[idx] = num - correction[idx]);      
         await  succ.save()    
      }      
}

async function editCorrection( session, params) {
   //params: o, sec, begin, correction 
   
   let dpl = await Dpl.findOne( { o: params.o, weekBegin: params.begin,
      //weekEditable: true, // ???
      s: params.sec 
   }).session(session);
   let oldCorrection = dpl.correction;
   dpl.correction = params.correction;
   if (dpl) await dpl.save(); else return false;
   // update dz begin in all succeeding weeks
   let difference = params.correction.map((val, index) => oldCorrection[index] - val);
   await recalcNumbersAfterEdit(session, 
      params.o, params.sec, params.begin, dpl.p, difference);

   return true;
}

router.patch('/:mts', async function(req, res) {
   /*jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err ) { 
         res.sendStatus(401); 
         return; 
      }      */
      console.log(req.authData);
      if ( req.body.path === '/remark' ) {
         if (req.authData.r !== 'scheduler' ) { 
            res.sendStatus(401); 
            return; 
         }

         if ( req.body.op === 'replace' ) {            
            await Dpl.findOneAndUpdate( { 
               o: req.authData.o,
               weekBegin: new Date(req.params.mts * 1000),
               s: req.authData.s
            }, {
               remark: req.body.value
            });
            res.json( { remark: req.body.value } ); 
            return;
         } else if (req.body.op === 'remove' ) {            
            await Dpl.findOneAndUpdate( { 
               o: req.authData.o,
               weekBegin: new Date(req.params.mts * 1000),
               s: req.authData.s
            }, {
               remark: null
            });
            res.sendStatus( 204 ); 
            return;
         }
      } else if (req.body.path === '/correction') { 
         console.log(`Editing dz correction`);
         let result = await writeOperation( req.authData.o,
            editCorrection, {
               o: req.authData.o, sec: req.authData.s,
               begin: new Date(req.params.mts * 1000),               
               correction: req.body.value
            });                        

         res.json( result ? {success: true, correction: req.body.value} :
            {success: false, reason: 'DB error'} ); 
         //TODO push-notifications
         return;                        

         /*await Dpl.findOneAndUpdate( { 
            o: req.authData.o,
            weekBegin: new Date(req.params.mts * 1000),
            s: req.authData.s
         }, {
            correction: req.body.value
         });
         res.json( { correction: req.body.value } ); 
         return;*/
      } else if (req.body.op == 'delwish' || req.body.op == 'newwish') {
         if ( err || req.authData.r !== 'musician' ) { 
            res.sendStatus(401); 
            return; 
         }
         if ( req.body.op == 'delwish') {
            if (req.body.did) {
               console.log(`Deleting + sign for member ${req.body.mi} column ${req.body.col}, did: ${req.body.did}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: true, dw: true,
                     did: req.body.did, mi: req.body.mi                     
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;               
            } else {               
               console.log(`Deleting fw member ${req.body.mi} for column ${req.body.col}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: true, dw: false,
                     col: req.body.col, mi: req.body.mi                                          
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;
            }
         } else {
            if ( req.body.did ) {               
               console.log(`Adding + sign member ${req.body.mi} for column ${req.body.col}, did: ${req.body.did}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: false, dw: true,
                     did: req.body.did, mi: req.body.mi                                          
                  });                        
      
               res.json(  result ); //TODO push-notifications
               return;
            } else {               
               console.log(`Adding fw member ${req.body.mi} for column ${req.body.col}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: false, dw: false,
                     col: req.body.col, mi: req.body.mi                                          
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;
            }
         }         
      }
   //});
});

async function editDpl( session, params ) {
   let returnVal;   

   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.begin,
      weekEditable: true
   } ).session(session)/*.populate('p').populate('weekSeason')*/;   
     
   if ( !affectedDpl ) return { 
      success: false, 
      reason: 'Dienstplan existiert nicht / nicht editierbar'
   };

   let oldDelta = affectedDpl.delta;

   for ( let i = 0; i < affectedDpl.seatings.length; i++ ) {
      let newSeating = params.sps.find( dienst => dienst.d == affectedDpl.seatings[i].d );
      affectedDpl.seatings[i].ext = newSeating.ext;
      affectedDpl.seatings[i].comment = newSeating.comment;
      affectedDpl.seatings[i].sp = newSeating.sp;
      affectedDpl.seatings[i].available = newSeating.available;
   }
   await affectedDpl.calcDelta();
   let diff = affectedDpl.delta.map( (val, ind) => oldDelta[ind] - val);

   await Dpl.updateOne( { 
      o: params.o,
      s: params.sec,
      weekBegin: params.begin         
   }, {
      '$set': {
         absent: params.absent,
         seatings: affectedDpl.seatings,
         delta: affectedDpl.delta
      }
   }, { session: session  } );
   /*affectedDpl.absent = params.absent;
   affectedDpl.save();*/
      
   /*let row = affectedDpl.p.members.findIndex( mem => mem.prof == params.prof );
   if ( row == -1 || !affectedDpl.p.members[row].canWish ) return { 
      success: false, 
      reason: 'Nicht berechtigt'
   };*/

   // update dz end and dz begin for all succeeding weeks         
   await recalcNumbersAfterEdit(session, params.o, params.sec, params.begin, 
      affectedDpl.p._id, diff);

   /*console.log('In editDpl');
   console.log(params);
   console.log(affectedDpl);*/

   returnVal = true;
   
   return returnVal;
}

/********
 * Edit seatings (incl. absent) for this dpl by scheduler
 */
router.post('/:mts', async function(req, res) {   
   console.log(req.body); 
   
   let result = await writeOperation( req.authData.o, editDpl, {
      ...req.body, 
      o: req.authData.o, 
      sec: req.authData.s,
      begin: new Date(req.params.mts * 1000)          
   });      
   console.log(`Dpl successfully updated: ${result}`);      
   
   // return new week plan            
   let resp = await createWeekDataRaw(req.params.mts, req.authData, req.authData.s);   
   res.json( result === true ? { success: true, week: resp} : result );            
 });

 async function deleteDpl( session, params ) {      
   let dpl = await Dpl.findOne( { 
      o: params.o, _id: params.dpl, weekEditable: true }).session(session);
   /********
    * check if dpl is empty (no scheduler's data)        
    */
   let isEmpty = dpl.seatings.reduce(
      (empty, seating) => empty && seating.sp.reduce((empty, code) => empty && !code, true ), true
   );
   if ( !isEmpty ) return;
   await recalcNumbersAfterEdit( session, params.o, params.sec, dpl.weekBegin, dpl.p, dpl.correction);   
   await Dplmeta.deleteOne( { o: params.o, dpl: params.dpl } ).session(session);
   await Dpl.deleteOne( { _id: params.dpl, o: params.o } ).session(session);
   let weekDoc = await Week.findOne({ o: params.o, begin: dpl.weekBegin }).session(session);
   weekDoc.dpls[params.sec] = undefined;
   await weekDoc.save();   
 }

 router.delete('/:dplId', async function(req, res) {    
   console.log( `Deleting DPL ${req.params.dplId}...` );   
   await writeOperation( req.authData.o, deleteDpl, {        
       o: req.authData.o, 
       prof: req.authData.pid,
       role: req.authData.r,
       dpl: req.params.dplId,       
       sec: req.authData.s,        
    });             
});

async function createDpl( session, params ) {
   // Create new Dpl
   console.log('In transaction fcn');
   let week = await createWeekDataRaw(params.begin, params.authData, params.authData.s);
   console.log(week);
   if ( !week.wpl.editable || !week.assignedPeriod ) return false;
   let groupSize = week.assignedPeriod.members.length;
   let dtBegin = new Date(params.begin*1000);
   let absent = [];
   for ( let i = 0; i < 14; i++ ) {
      absent[i] = Array(groupSize).fill(0);
   }
   let seatings = [];
   for ( let dienst of week.wpl.dienst ) {
      seatings.push( {
         d: dienst._id,
         ext: 0,
         sp: Array(groupSize).fill(0), // seating plan; n x    
         comment: '', // scheduler's comment    
         available: Array(groupSize).fill(false),

         dienstBegin: new Date(dienst.begin * 1000),
         dienstWeight: dienst.weight,
         dienstInstr: dienst.instrumentation.get(params.authData.s) // for this section only
      });
   }
   console.log(`o: ${params.authData.o}, s: ${params.authData.s}, p: ${week.assignedPeriod._id}`);
   let lastDplDoc = await Dpl
   .find({
      o: params.authData.o,
      s: params.authData.s,
      p: week.assignedPeriod._id,                                
   }).session(session).where('weekBegin').lt(dtBegin) // before this week                                 
   .sort('-weekBegin').limit(1);

   console.log(`lastDpl`);
   console.log(lastDplDoc[0]);
   console.log('End: ');
   console.log(lastDplDoc[0].end);

   let dplId = new mongoose.Types.ObjectId();
   await Dpl.create( [{
      _id: dplId,
      o: params.authData.o,
      w: week.wpl._id,
      p: week.assignedPeriod._id,
      s: params.authData.s, // section
      weekBegin: dtBegin,
      weekEditable: true,
      weekSeason: week.wpl.season._id,
      closed: false,
      published: false,
      remark: params.remark,
      absent: absent, 
      correction: Array(groupSize).fill(0),
      delta: Array(groupSize).fill(0),
      start: lastDplDoc[0] ? lastDplDoc[0].end : Array(groupSize).fill(0), // TODO ha van előző hét, annak a vége, egyébként 0,0,0...
      seatings: seatings
   }], { session } );

   // create dplmeta doc
   await Dplmeta.create( {
      o: params.authData.o,
      dpl: dplId,
      dplPeriod: week.assignedPeriod._id,
      periodMembers: week.assignedPeriod.members.map(
         mem => {
            return {
               prof: mem.prof._id,
               row: mem.row,
               canComment: mem.canComment
            };
         }
      ),
      comments: []      
   } );
   
   let weekDoc = await Week.findById(week.wpl._id).session(session);
   weekDoc.dpls.set(params.authData.s, {
      closed: false,
      published: false,
      dplRef: dplId
   } );
   await weekDoc.save();

   return true;   
}

router.post('/', async function(req, res) {   
   console.log(req.body);
   console.log('Creating DPL TODO');
   let result = await writeOperation( req.authData.o, createDpl, {      
      authData: req.authData,
      begin: req.body.mts,
      remark: req.body.remark
   });      
   console.log(`Dpl successfully updated: ${result}`);      
   
   // return new week plan            
   let resp = await createWeekDataRaw(req.body.mts, req.authData, req.authData.s);   
   console.log(resp);
   res.json( result === true ? { success: true, content: resp} : 
      {success: false, reason: 'Nicht erfolgreich'} );            
});


 
 //export this router to use in our index.js
module.exports = router;