const Dpl = require('../models/dpl');
const Period = require('../models/period');
const Week = require('../models/week');
const Dienst = require('../models/dienst');
const Production = require('../models/production');

const { DateTime } = require("luxon");

async function createWeekDataRaw (begin /* UNIX ts in Seconds*/, authData, sec) {
   let beginDate = new Date(begin*1000); 

   let weekRaw = { begin: parseInt(begin) }; // for return value

   let wplDoc = await Week.findOne({
      o: authData.o,
      begin: beginDate               
   }).populate('season', 'label begin end')
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
         dienst: wplDoc.dienst,
         _id: wplDoc._id
      };      

      if (sec) dplDocs = await Dpl.find({
         o: authData.o,         
         w: wplDoc.id,
         s: sec
      }).populate({
         path: 'p',
         select: 'begin members.row members.initial members.start members.factor members.canComment members.canWish members.comment', // -_id
         populate: {
            path: 'members.prof',
            select: 'userFn userSn userBirthday user'
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
                  (abs) => abs.fill(0) /*{
                     return {
                        am: abs.am.fill(0),
                        pm: abs.pm.fill(0)
                     }
                  }*/
               );
               finalSeatings = dplDocs[i].seatings.map(
                  (seatingObj) => { 
                     return {
                        sp: seatingObj.sp.fill(0),
                        available: seatingObj.available.fill(false),
                        d: seatingObj.d,
                        ext: 0                        
                     };
                  }
               );
            } else {
               finalRemark = dplDocs[i].remark;
               if ( authData.r == 'office' ) {
                  finalAbsent = dplDocs[i].absent.map(
                     (abs) => abs.map(v => v == 4 ? 0 : v) /*{
                        return {
                           am: abs.am.map(v => v == 4 ? 0 : v),
                           pm: abs.pm.map(v => v == 4 ? 0 : v)
                        }
                     }*/
                  ); // erase fw-s (- signs)...   
                  finalSeatings = dplDocs[i].seatings.map( v => {                      
                     return {
                        d: v.d,
                        ext: v.ext,
                        comment: v.comment,
                        sp: /*v.sp.map( c => c == 2 ? 0 : c)*/ v.sp,
                        available: v.available.map( av => false)
                     }                     
                  } );
                  //...and erase dw-s (+ signs)
               } else {
                  finalAbsent = dplDocs[i].absent;
                  finalSeatings = dplDocs[i].seatings;
               }               
            }            
   
            dplRaw[dplDocs[i].s] = {
               _id: dplDocs[i]._id,
               period: dplDocs[i].p,
               accessAllowed: dplAccess,
               closed: dplDocs[i].closed,
               published: dplDocs[i].published,
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
            
            /* last 3 weeks' delta
            * if single section request (for scheduler and office) */
            if ( sec ) {
               let grSize = dplRaw[sec].period.members.length;
               let prevDelta = [Array(grSize).fill(0), Array(grSize).fill(0), Array(grSize).fill(0)];               
               let dtBegin = DateTime.fromJSDate(beginDate, {
                  zone: wplDoc.o.timezone
               });               

               for ( let i = 0; i < 3; i++ ) {
                  dtBegin = dtBegin.minus({days: 7});                  
                  let prevDplDoc = await Dpl.findOne({
                     o: authData.o,
                     s: sec, 
                     p:  dplRaw[sec].period._id,
                     weekBegin: new Date(dtBegin.toISO())
                  }).select('delta');     
                  if ( prevDplDoc ) prevDelta[2-i] = prevDplDoc.delta;
               }
               dplRaw[sec].prevDelta = prevDelta;
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
   console.log('renumbering prod');
   console.log(aggregatedDienst);
   
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

async function recalcAfterReset( session, o, w, counting, deleteCorrection = false ) {
   console.log('recalc DZ...');
   let dplDocs = await Dpl.find({o: o, weekBegin: new Date(w)}).session(session);
   console.log('dpls:', dplDocs);
    for (let dpl of dplDocs) {            
      dpl.delta.forEach( (_, idx, arr) => arr[idx] = 0);
      if ( deleteCorrection ) dpl.correction.forEach( (_, idx, arr) => arr[idx] = 0);
      await dpl.save();
      let succedingDpls = await Dpl.find({o: o, s: dpl.s, p: dpl.p, weekBegin: {$gt: dpl.weekBegin} }).session(session);
      for (let succ of succedingDpls) {         
         succ.start.forEach( (num, idx, arr) => arr[idx] = num - counting.get(dpl.s)[idx]);      
         await succ.save()    
      }    
    }    
}

async function cleanWeek(session, o, w /* UTC timestamp in Milliseconds*/, deleteCorrection = false) {   
   // delete week's data in other collections      
   console.log('Clean week', w);
   let begin = new Date(w);   
   // find weekDoc
   console.log(o);
   console.log(begin);
   let weekDoc = await Week.findOne({
      o: o,
      begin: begin
   }).session(session);
   console.log('weekDoc', weekDoc);
   
   // create array of distinct productions  
   const productions = [...new Set(weekDoc.dienst.map( d => d.prod))];   
   console.log('productions', productions);
   
   // save counting array (diff + correction ? ha deleteCorrection) for all dpls
   let dplDocs = await Dpl.find({
      o: o,
      weekBegin: begin
   }).session(session);
   console.log('dpls', dplDocs);

   const counting = new Map(
      dplDocs.map( dpl => [
         dpl.s, 
         deleteCorrection ? dpl.delta.map( (x, ind) => x + dpl.correction[ind]) : dpl.delta
      ])
   );
   console.log('counting', counting);
         
   for ( let i = 0; i < weekDoc.dienst.length; i++) {            
      //delete dienst from dienstextref coll      
      console.log('deleting dienst with id:', weekDoc.dienst[i]._id);
      await Dienst.findByIdAndRemove(weekDoc.dienst[i]._id, {session: session});                 
                 
      // delete seatings subdocs from all dpls      
      await Dpl.updateMany({
         o: o,
         w: weekDoc._id
         }, {
         '$pull': {
            seatings: {
               d: weekDoc.dienst[i]._id
            }
         }
      } ).session(session);
   }

   /* ***** for all productions in the list **** */
   
   for ( let i = 0; i < productions.length; i++ ) {      
         //update first and last dienst for this prod
         await updateProductionsFirstAndLastDienst(session, o, productions[i]);      
         
         // recalc OA1, etc. for season and production (if not sonst. dienst):     
         await renumberProduction(session, weekDoc.season, productions[i]);                  
   }
   /****** end of production loop **** */
   
   // Update all DPLs' counting (delta, correction, start), for succeeding weeks, too
   await recalcAfterReset(session, o, w, counting, deleteCorrection ); 
   
   // delete all dienst from weeks coll   
   weekDoc.dienst = [];
   await weekDoc.save();      
}

exports.createWeekDataRaw = createWeekDataRaw;
exports.renumberProduction = renumberProduction;
exports.recalcNumbersAfterWeightChange = recalcNumbersAfterWeightChange;
exports.updateProductionsFirstAndLastDienst = updateProductionsFirstAndLastDienst;
exports.cleanWeek = cleanWeek;