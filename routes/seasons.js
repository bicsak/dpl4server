let express = require('express');
let router = express.Router();

const Season = require('../models/season');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');
const Orchestra = require('../models/orchestra');
const Dpl = require('../models/dpl');
const Dplmeta = require('../models/dplmeta');

const { writeOperation } = require('../my_modules/orch-lock');
const { cleanWeek } = require('../my_modules/week-data-raw');

const { DateTime } = require("luxon");


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
   if ( params.boundaries ) {
      let orchDoc = await Orchestra.findById(params.o);   
      if ( params.boundaries == 1 ) {
         // start season one week later...         
         let newBegin = DateTime.fromJSDate(seasonDoc.begin, {zone: orchDoc.timezone}).plus({weeks: 1}).toJSDate();         
         // TODO check if still ok (season contains at least 1 week)
         // if so, following 3 lines:
         await cleanWeek(session, params.o, seasonDoc.begin.getTime(), true);
         await Week.deleteOne({o: params.o, begin: seasonDoc.begin}).session(session);                  
         await Dpl.deleteMany( {
            o: params.o,
            weekBegin: seasonDoc.begin
         }).session(session);
         // delete dplMetas as well
         await Dplmeta.deleteMany( {
            o: params.o,
            weekBegin: seasonDoc.begin
         }).session(session);      
         seasonDoc.begin = newBegin;
      } else if ( params.boundaries == 2 ) {
         // start one week earlier
         console.log("setting season's begin one week earlier...");      
         // change season doc's begin and add new week doc
         let newBegin = DateTime.fromJSDate(seasonDoc.begin, {zone: orchDoc.timezone}).minus({weeks: 1}).toJSDate();
         // TODO check if still ok (no collision with prev season)
         seasonDoc.begin = newBegin;
         await Week.create([{
            o: params.o,
            season: seasonDoc._id,
            begin: newBegin,
            remark: "",
            editable: false,
            dpls: {},
            dienst: []
         }], {session});
      } else if ( params.boundaries == 3 ) {
         // finish one week later
         console.log("setting season's end one week later...");
         // change season doc's end and add new week doc         
         let newEnd = DateTime.fromJSDate(seasonDoc.end, {zone: orchDoc.timezone}).plus({weeks: 1}).toJSDate();      
         // TODO check if still ok (no collision with next season)
         await Week.create([{
            o: params.o,
            season: seasonDoc._id,
            begin: seasonDoc.end,
            remark: "",
            editable: false,
            dpls: {},
            dienst: []
         }], {session});
         seasonDoc.end = newEnd;
      } else if ( params.boundaries == 4 ) {
         //finish season one week earlier
         let newEnd = DateTime.fromJSDate(seasonDoc.end, {zone: orchDoc.timezone}).minus({weeks: 1}).toJSDate();               
         // TODO check if still ok (season contains at least 1 week, i.e. begin < newEnd)
         // if so, following 3 lines:         
         await cleanWeek(session, params.o, newEnd.getTime(), true);
         await Week.deleteOne({o: params.o, begin: newEnd}).session(session);         
         await Dpl.deleteMany( {
            o: params.o,
            weekBegin: newEnd
         }).session(session);                  
         await Dplmeta.deleteMany( {
            o: params.o,
            weekBegin: newEnd
         }).session(session);         
         seasonDoc.end = newEnd;
      }      
   }
   
   seasonDoc.label = params.label;
   seasonDoc.comment = params.comment;
   await seasonDoc.save();
   
   return {
      statusCode: 200,
      body: seasonDoc
   };
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
      if (result.statusCode == 200 ) res/*.status(200)*/.json( 
         await addStat(result.body)
      );      
      else res.status(result.statusCode).send( result.message);      
   } catch (err) {
      res.status(400).send(`Patching season with id ${req.params.id} failed`);
   }
});

async function createSeason(session, params ) {
   let orchDoc = await Orchestra.findById(params.o);   
   let dtBegin = DateTime.fromObject({
      year: params.fromDate.year, month: params.fromDate.month, day: params.fromDate.day
   }, {zone: orchDoc.timezone }).startOf('week'); 
   let dtEnd = DateTime.fromObject({
      year: params.toDate.year, month: params.toDate.month, day: params.toDate.day
   }, {zone: orchDoc.timezone }).plus({days: 1}).startOf('week');    
   console.log(dtBegin);
   console.log(dtEnd);
   let seasonDoc = await Season.create([{
      o: params.o,
      label: params.label,
      comment: params.comment,
      begin: dtBegin.toJSDate(),
      end: dtEnd.toJSDate()
   }], {session}); 
   console.log(seasonDoc);   
   while ( dtBegin.toMillis() < dtEnd.toMillis()) {
      await Week.create([{
         o: params.o,
         season: seasonDoc[0]._id,
         begin: dtBegin.toJSDate(),
         remark: "",
         editable: false,
         dpls: {},
         dienst: []
      }], {session});
      dtBegin = dtBegin.plus({weeks: 1});
   }
   return {
      statusCode: 201,
      body: await addStat(seasonDoc[0])
   };
}

router.post('/', async function(req, res){
   console.log(req.params,req.body);
   try {
      let result = await writeOperation(req.authData.o, createSeason, {
         ...req.body,
         o: req.authData.o,         
      });     
      console.log(result);
      res.status(result.statusCode).send( result.body );      
   } catch (err) {
      res.status(400).send(`Creating season failed`);
   }         
   // 201: Successfully created
   // 500: failed to create (conflict?)
   // 400 otherwise (error)
});

async function deleteSeason(session, params ) {
   // check: only if does not contain any dienste and no dpls
   let countDpls = await Dpl.countDocuments({
      o: req.authData.o,
      weekSeason: req.params.seasonId
   }).session(session);
   let countDienst = await DienstExtRef.countDocuments({
      o: req.authData.o,
      season: req.params.seasonId
   }).session(session);
   if ( countDpls || countDienst ) {      
      return {
         statusCode: 400,
         body: `Spielzeit kann nicht gelöscht werden`
      };
   }
   let result = await Season.deleteOne({
      _id: params.id,
      o: params.o
   }).session(session);
   if ( !result.deletedCount ) return {
      statusCode: 404,
      body: "Nicht gefunden"
   };
   // delete all week docs from collection   
   await Week.deleteMany({
      o: params.o,
      season: params.id
   }).session(session);
   return true;
}

router.delete('/:seasonId', async function(req, res) {    
   console.log( `Deleting season ${req.params.seasonId}...` );   
   try {
      let result = await writeOperation(req.authData.o, deleteSeason, {
         id: req.params.seasonId,
         o: req.authData.o,         
      });           
      if ( result === true ) res.status(202).send();      // request accepted
      else res.status(result.statusCode).send( result.body ); 
   } catch (err) {
      res.status(400).send(`Delete not allowed`);
      // 400: problem, not deleted, 404: not found   
   }                 
});

//export this router to use in our index.js
module.exports = router;