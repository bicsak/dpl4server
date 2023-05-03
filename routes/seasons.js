let express = require('express');
let router = express.Router();
const Season = require('../models/season');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');

async function addStat(s) {
   let countDienst = await DienstExtRef.countDocuments( { season: s._id } );
   let countCat0 = await DienstExtRef.countDocuments( { season: s._id, category: 0 } );
   let countCat1 = await DienstExtRef.countDocuments( { season: s._id, category: 1 } );
   let countPrem = await DienstExtRef.countDocuments( { season: s._id, category: 1, subtype: 1 } );
   let countWA = await DienstExtRef.countDocuments( { season: s._id, category: 1, subtype: 2 } );
   let countConc = await DienstExtRef.countDocuments( { season: s._id, category: 1, subtype: 3 } );         
   let countWeeks = await Week.countDocuments( { season: s._id } );         
   let ret = Object.assign(s.toJSON(), {countDienst, countCat0, countCat1, countPrem, countWA, countConc, countWeeks});         

   return ret;
}

router.get('/', async function(req, res) { 
   let response = await Season.find( { o: req.authData.o } );         
   if ( req.query.full == 'true' ) {      
      for ( let i = 0; i < response.length; i++ ){        
         response[i] = await addStat(response[i]);
      }      
   }      
   res.json( response );   
});

router.patch('/:id', async function(req, res){
   console.log(`PATCH route on season ${req.params.id}, params: ${req.body}`);
   let seasonDoc = await Season.findById( req.params.id );                     
   // TODO update label and comment accoprdings to req.body.label, rey.body.comment
   // save seasonDoc
   // if boundaries != 0, do a lot of things...
   // 1:    start one week later
   // 2: start one week earlier -> check if not in collision with other Season and create week doc
   // 3: finish one week later -> check in fno in collision and add new week doc
   // 4: finish earlier: delete dpls and DienstExtRefs. Update DPLs' counting, seating docs
   response = await addStat(seasonDoc);
   res.send( response );
   console.log(req.body);
   console.log(response);
});

router.post('/', function(req, res){
   res.send('POST route on seasons');
});

//export this router to use in our index.js
module.exports = router;