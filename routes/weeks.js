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
         let week = {};         
         
         let dpl = await Dpl.findOne({
            o: authData.o,
            weekBegin: beginDate,
            s: req.params.section
         }).populate({
            path: 'w', 
            select: 'dienst season editable remark',
            populate: {
               path: 'season',
               select: 'comment label begin end' // -_id
            }            
         }).populate({
            path: 'p',
            select: 'begin members.row members.initial members.start members.factor', // -_id
            populate: {
               path: 'members.u',
               select: 'fn sn birthday -_id'
            }
         }).select('-absent._id');                  
         
         if ( dpl && dpl.populated('p') && dpl.populated('w') ) // scheduler already created dpl for this week
         {            
            // combine seatings and dienst data from collection week and dpl
            week.dienst =  dpl.seatings.map( seating => {               
               let retVal = Object.assign(
                  {}, 
                  seating.toJSON(), 
                  dpl.w.dienst.find( d => d._id.toString() === seating.d.toString() ).toJSON()
               );

               delete retVal.instrumentation;
               delete retVal.d;
               delete retVal.dienstBegin;
               delete retVal.dienstWeight;

               return retVal;
            });        
            week = {
               ...week,
               editable: dpl.w.editable,
               remarkManager: dpl.w.remark,
               period: dpl.p,
               season: dpl.w.season,               
               dpl: {
                  closed: dpl.closed,
                  remark: dpl.remark,
                  absent: dpl.absent               
               }               
            }; 

            if ( authData.r === 'member' ) {                                             
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
                  console.log(lastDpl);
                  let endOfWeek = lastDpl[0].start.map( (val, i) => 
                     val + lastDpl[0].correction[i] + lastDpl[0].delta[i]*dpl.p.members[i].factor + dpl.p.members[i].start );                  
                  normVal = Math.min(...endOfWeek);
               }

               week.dpl.start = dpl.start.map( (val) => val-normVal );
               week.dpl.corr = dpl.correction;               
            }
                        

         } else // there is no dpl for this week
         {
            let wpl = await Week.findOne({
               o: authData.o,
               begin: beginDate               
            }).populate('season', 'comment label begin end -_id');

            if ( wpl ) {
               week = {
                  editable: wpl.editable,
                  dienst: wpl.dienst,
                  season: wpl.season,
                  remarkManager: wpl.remark,               
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
               .populate('members.u', 'fn sn birthday -_id');    
               week.period = p.length ? p[0] : null;            

            } else week = null;
            
         }  
                      
         if (week && week.dpl) {            
            // office should see dpl only if it is closed and do not see + and - signs generally...
            if (authData.r == 'office') {
               if ( !week.dpl.closed) week.dpl = undefined;               
               else {
                  week.dpl.absent = week.dpl.absent.map(
                     (abs) => {
                        return {
                           am: abs.am.map(v => v == 4 ? 0 : v),
                           pm: abs.pm.map(v => v == 4 ? 0 : v)
                        }
                     }
                  ); // erase fw-s (- signs)

                  week.dienst.sp = week.dienst.sp.map( v => v == 2 ? 0 : v );
                  //erase dw-s (+ signs)
               }
            }

            // seating data visible only for active members and scheduler...
            if (authData.r == 'member'
               && !authData.scheduler && !week.p.members.find( (m) => m.u == authData.uid ) ) {
               week.dpl = undefined;
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