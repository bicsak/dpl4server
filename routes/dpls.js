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
         
         let dpl = await Dpl.findOne({
            o: authData.o,
            weekBegin: new Date(req.params.mts*1000),
            s: req.params.section
         }).populate('p').populate('w');                  

         let dplClient = {};         
         if ( dpl ) {
            
            dplClient =  dpl.seatings.map( seating => {               
               let retVal = Object.assign(
                  {}, 
                  seating.toJSON(), 
                  dpl.w.dienst.find( d => d._id.toString() === seating.d.toString() ).toJSON()
               );

               delete retVal.instrumentation;
               delete retVal.d;
               delete retVal.dienstBegin;

               return retVal;
            });        
         }               
         
         res.json({
            msg: 'Auth success',
            dplDB: dpl,
            dplClient: dplClient
         });
      }
   });
   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;