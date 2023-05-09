let express = require('express');
let router = express.Router();
const Season = require('../models/season');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');

const { writeOperation } = require('../my_modules/orch-lock');

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
   try {
      let response = await Season.find( { o: req.authData.o } );         
      if ( req.query.full == 'true' ) {      
         for ( let i = 0; i < response.length; i++ ){        
            response[i] = await addStat(response[i]);
         }      
      }      
      res.status(200).json( response );   
   } catch (err) {
      res.status(500).send(err.message);
   }
});

async function editSeason(session, params ) {

   let seasonDoc = await Season.findById( params.id ).session(session);                     
   if ( !seasonDoc) return false;      
   // if boundaries != 0, do a lot of things...
   // 1:    start one week later
   // 2: start one week earlier -> check if not in collision with other Season and create week doc
   // 3: finish one week later -> check in fno in collision and add new week doc
   // 4: finish earlier: delete dpls and DienstExtRefs. Update DPLs' counting, seating docs
   seasonDoc.label = params.label;
   seasonDoc.comment = params.comment;
   await seasonDoc.save();
   return await addStat(seasonDoc);   
}

router.patch('/:id', async function(req, res){
   console.log(`PATCH route on season ${req.params.id}, params: ${req.body}`);
   console.log(req.body);
   let success = await writeOperation(req.authData.o, editSeason, {
      ...req.body,
      o: req.authData.o,
      id: req.params.id,      
   });     
   console.log(success);
  if (success) res.send( {
   success: true,
   content: success
  });   

  // res.status(400).json({ error: 'message' })
  else res.send( {
   success: false, message: 'Fehler'
  });      
});

router.post('/', function(req, res){
   res.send('POST route on seasons');
});

//export this router to use in our index.js
module.exports = router;