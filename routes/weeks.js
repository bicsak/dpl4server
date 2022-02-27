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
         
         // dpl data accessible only for active members of the group and scheduler...
         // office has access only to closed dpls
         let dplAccess = true;         
         if ( authData.r == 'member' && !authData.scheduler 
            && !dpl.p.members.find( m =>  m.u._id == authData.uid ) ||
            authData.r == 'office' && !dpl.closed ) {
            dplAccess = false;
         }         

         if ( dpl && dpl.populated('p') && dpl.populated('w') && dplAccess) // scheduler already created dpl for this week
         {
            let myDpl = {};

            if ( authData.r == 'office' ) {
               dpl.absent = dpl.absent.map(
                  (abs) => {
                     return {
                        am: abs.am.map(v => v == 4 ? 0 : v),
                        pm: abs.pm.map(v => v == 4 ? 0 : v)
                     }
                  }
               ); // erase fw-s (- signs)

               dpl.seatings = dpl.seatings.map( v => v == 2 ? 0 : v );
               //erase dw-s (+ signs)
            }

            myDpl[dpl.s] = {
               period: dpl.p,
               closed: dpl.closed,
               remark: dpl.remark, //scheduler's remark for the whole week
               absent: dpl.absent, // Krankmeldunden, Freiwünsche etc.
               sps: dpl.seatings // seating plans for each dienst                                  
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
                  wpl: wpl                  
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
      }
   });
   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;