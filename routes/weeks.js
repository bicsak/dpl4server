let express = require('express');
const jwt = require('jsonwebtoken');
let router = express.Router();
const Dpl = require('../models/dpl');
const Period = require('../models/period');
const Week = require('../models/week');

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

async function createWeekDataRaw(begin, authData, sec) {
   let beginDate = new Date(begin*1000); 

   let weekRaw = { begin: parseInt(begin) }; // for return value

   let wplDoc = await Week.findOne({
      o: authData.o,
      begin: beginDate               
   }).populate('season', 'label begin end -_id')
   .populate('o', 'timezone')
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
            path: 'members.u',
            select: 'fn sn birthday'
         }
      }).select('-absent._id -seatings.dienstBegin -seatings.dienstInstr -seatings.dienstWeight -seatings._id');                                
      else dplDocs = await Dpl.find({ o: authData.o, w: wplDoc.id }).populate({
         path: 'p',
         select: 'begin members.row members.initial members.start members.factor', // -_id
         populate: {
            path: 'members.u',
            select: 'fn sn birthday'
         }
      }).select('-absent._id -seatings.dienstBegin -seatings.dienstInstr -seatings.dienstWeight -seatings._id');                                

      let dplRaw = {};
      if ( dplDocs.length ) // scheduler already created dpl for this week
      {
         
         for ( let i = 0; i < dplDocs.length; i++ ) {
            // dpl data accessible only for active members of the group and scheduler...
            // office has access only to closed dpls
            let dplAccess = true;         
            if (  authData.r == 'member' && !authData.scheduler 
               && !dplDocs[i].p.members.find( m =>  m.u._id == authData.uid ) ||
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
                        ext: 0,
                        comment: ''
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
            if ( authData.r === 'member' && sec ) {   
               dplRaw[dplDocs[i].s] = {
                  ...dplRaw[dplDocs[i].s],
                  start: dplDocs[i].start,
                  correction: dplDocs[i].correction                
               };
               
               let lastDplDoc = await Dpl
               .find({
                  o: authData.o,
                  s: dplDocs[i].sec,                                                 
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
         .populate('members.u', 'fn sn birthday');    
         if (p.length) weekRaw.assignedPeriod = p[0];
      }      
   }
   
   return weekRaw;          
}

router.get('/:mts', verifyToken, async function(req, res) {
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
         let resp = await createWeekDataRaw(req.params.mts, authData); 
         console.log(resp);
         res.json( resp );
      }
   });
});

router.get('/:section/:mts', verifyToken, async function(req, res) {
   
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(401);
      else {
         if ( req.params.section !== authData.s && authData.s !== 'all' ) res.sendStatus(401);

         let beginDate = new Date(req.params.mts*1000);         
         let week = { begin: parseInt(req.params.mts) }; // for response json data
         let dpl = await Dpl.findOne({
            o: authData.o,
            weekBegin: beginDate,
            s: req.params.section
         }).populate('o', 'timezone')            
         .populate({
            path: 'w', 
            select: 'dienst season editable remark',
            populate: {
               path: 'season',
               select: 'label begin end' // -_id
            }            
         }).populate({
            path: 'p',
            select: 'begin members.row members.initial members.start members.factor', // -_id
            populate: {
               path: 'members.u',
               select: 'fn sn birthday'
            }
         }).select('-absent._id -seatings.dienstBegin -seatings.dienstInstr -seatings.dienstWeight -seatings._id');                                

         if ( dpl && dpl.populated('p') && dpl.populated('w') ) // scheduler already created dpl for this week
         {
            // dpl data accessible only for active members of the group and scheduler...
            // office has access only to closed dpls
            let dplAccess = true;         
            if (  authData.r == 'member' && !authData.scheduler 
               && !dpl.p.members.find( m =>  m.u._id == authData.uid ) ||
               authData.r == 'office' && !dpl.closed ) dplAccess = false;                
            
            let myDpl = {};
            let finalRemark; let finalAbsent; let finalSeatings;

            if ( !dplAccess ) {
               // remove all seating data if no access should be granted
               finalAbsent = dpl.absent.map(
                  (abs) => {
                     return {
                        am: abs.am.fill(0),
                        pm: abs.pm.fill(0)
                     }
                  }
               );
               finalSeatings = dpl.seatings.map(
                  (seatingObj) => { 
                     return {
                        sp: seatingObj.sp.fill(0),
                        d: seatingObj.d,
                        ext: 0,
                        comment: ''
                     };
                  }
               );
            } else {
               finalRemark = dpl.remark;
               if ( authData.r == 'office' ) {
                  finalAbsent = dpl.absent.map(
                     (abs) => {
                        return {
                           am: abs.am.map(v => v == 4 ? 0 : v),
                           pm: abs.pm.map(v => v == 4 ? 0 : v)
                        }
                     }
                  ); // erase only fw-s (- signs)...
   
                  finalSeatings = dpl.seatings.map( v => v == 2 ? 0 : v );
                  //and erase dw-s (+ signs)
               } else {
                  finalAbsent = dpl.absent;
                  finalSeatings = dpl.seatings;
               }               
            }            

            myDpl[dpl.s] = {
               period: dpl.p,
               accessAllowed: dplAccess,
               closed: dpl.closed,
               remark: finalRemark, //scheduler's remark for the whole week
               absent: finalAbsent, // Krankmeldunden, Freiwünsche etc.
               sps: finalSeatings // seating plans for each dienst                                  
            };            

            let wpl = {
               season: dpl.w.season,
               editable: dpl.w.editable,
               remark: dpl.w.remark,
               dienst: dpl.w.dienst
            };            
            
            if ( authData.r === 'member' ) {   
               myDpl[dpl.s] = {
                  ...myDpl[dpl.s],
                  start: dpl.start,
                  correction: dpl.correction                
               };
               
               let lastDpl = await Dpl
               .find({
                  o: authData.o,
                  s: req.params.section,                                                 
               })
               .where('weekBegin').lt(dpl.w.season.begin).gte(dpl.p.begin) // before this week                                 
               .sort('-weekBegin')
               .limit(1)                              
               .select('start delta correction weekBegin');
               
               let normVal = 0;
               if ( lastDpl.length ) {
                  //console.log(lastDpl);
                  let endOfWeek = lastDpl[0].start.map( (val, i) => 
                     val + lastDpl[0].correction[i] + lastDpl[0].delta[i]*dpl.p.members[i].factor + dpl.p.members[i].start );                  
                  normVal = Math.min(...endOfWeek);
                  myDpl[dpl.s].start = dpl.start.map( (val) => val-normVal );
               }
            }     
            
            week = { 
               ...week,
               oTz: dpl.o.timezone,
               wpl: wpl,
               dpls: myDpl
             };                                                   
               
            console.log(dpl);            

         } 
         else { // there is no dpl for this week                     
            let wpl = await Week.findOne({
               o: authData.o,
               begin: beginDate               
            }).populate('season', 'label begin end -_id')
            .populate('o', 'timezone')
            .select('-dpls -begin -_id');

            if ( wpl ) {
               week = {
                  ...week,
                  oTz: wpl.o.timezone,
                  wpl: wpl,
                  dpls: {},
                  assignedPeriods: {}
               };         
               
               let p = await Period
               .find({
                  o: authData.o,
                  s: req.params.section                  
               })
               .where('begin').lte(beginDate)
               .select('begin members')
               .sort('-begin')
               .limit(1)
               .populate('members.u', 'fn sn birthday');    
               if (p.length) week.assignedPeriods[req.params.section] = p[0];
            }            
         }  
                    
         res.json(week);
         console.log(week);
      }
   });
   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;