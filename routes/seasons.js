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
   if ( !seasonDoc) return {
      statusCode: 404,
      message: 'Specified season does not exist'
   };      
   // if boundaries != 0, do a lot of things...
   // 1:    start one week later
   // 2: start one week earlier -> check if not in collision with other Season and create week doc
   // 3: finish one week later -> check in fno in collision and add new week doc
   // 4: finish earlier: delete dpls and DienstExtRefs. Update DPLs' counting, seating docs
   seasonDoc.label = params.label;
   seasonDoc.comment = params.comment;
   await seasonDoc.save();
   let result = await addStat(seasonDoc);  
   return {
      statusCode: 200,
      body: result
   } ;
   //{ statusCode: 304, message: `Season with id ${params.id} not updated`}
}

router.patch('/:id', async function(req, res){
   console.log(`PATCH route on season ${req.params.id}, params: ${req.body}`);
   console.log(req.body);
   try {
      let result = await writeOperation(req.authData.o, editSeason, {
         ...req.body,
         o: req.authData.o,
         id: req.params.id,      
      });     
      console.log(result);
   if (result.statusCode == 200 ) res/*.status(200)*/.json( result.body);      
   else res.status(result.statusCode).send( result.message);      
} catch (err) {
   res.status(400).send(`Patching season with id ${req.params.id} failed`);
}
});

router.post('/', function(req, res){
   res.status(201).send('POST route on seasons');
   console.log(req.params,req.body);
   // 201: Successfully created
   // 500: failed to create (conflict?)
   // 400 otherwise (error)
});

router.delete('/:seasonId', async function(req, res) {    
   console.log( `Deleting season ${req.params.seasonId}...` );

   /*let result = await writeOperation( req.authData.o, deleteComment, {        
       o: req.authData.o, 
       prof: req.authData.pid,
       role: req.authData.r,
       dpl: req.params.dplId,
       cId: req.params.commentId,
       sec: req.authData.s,        
    });   */          

    // 400: problem, not deleted, 404: not found
   res.status(202); // request accepted
});

//export this router to use in our index.js
module.exports = router;