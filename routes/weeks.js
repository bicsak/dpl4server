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
      req.sendStatus(403);
   }
}

router.get('/:section/:mts', verifyToken, async function(req, res) {
   
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(403);
      else {
         if ( req.params.section !== authData.s && authData.s !== 'all' ) res.sendStatus(403);

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
         
         if ( dpl ) // scheduler already created dpl for this week
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
               week.dpl.start = dpl.start;
               week.dpl.corr = dpl.correction;               
               
               //TODO query doesnt work season's _id is equal, why ne??
               let lastDpl = await Dpl
               .find({
                  o: authData.o,
                  s: req.params.section,                                  
                  p: dpl.p._id // same period            
               })
               .where('weekBegin').lt(beginDate) // before this week                  
               .populate('w', 'season')
               .where('w.season').ne(dpl.w.season._id) // but another season TODO
               .sort('-weekBegin')
               .limit(1)                              
               .select('start delta correction weekBegin');

               // TODO lastDpl == [] ??
               if ( lastDpl ) {
                  console.log(lastDpl);
                  console.log(`Utolso het: ${lastDpl[0].w.season}`);
                  console.log(`Akt. het: ${dpl.w.season._id}`);
                  let endOfWeek = lastDpl[0].start.map( (val, i) => 
                     val + lastDpl[0].correction[i] + lastDpl[0].delta[i] + dpl.p.members[i].start );                  
                  week.dpl.norm = Math.min(...endOfWeek);
               } else week.dpl.norm = 0;
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
               week.period = p ? p[0] : null;     // TODO [] != null !!!                         

            } else week = null;
            
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