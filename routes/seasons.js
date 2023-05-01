let express = require('express');
let router = express.Router();
const Season = require('../models/season');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');

router.get('/', async function(req, res) { 
   let response = await Season.find( { o: req.authData.o } );         
   if ( req.query.full == 'true' ) {
      console.log('Creating stat for seasons component (manager)');
      for ( let i = 0; i < response.length; i++ ){
         let countDienst = await DienstExtRef.countDocuments( { season: response[i]._id } );
         let countCat0 = await DienstExtRef.countDocuments( { season: response[i]._id, category: 0 } );
         let countCat1 = await DienstExtRef.countDocuments( { season: response[i]._id, category: 1 } );
         let countPrem = await DienstExtRef.countDocuments( { season: response[i]._id, category: 1, subtype: 1 } );
         let countWA = await DienstExtRef.countDocuments( { season: response[i]._id, category: 1, subtype: 2 } );
         let countConc = await DienstExtRef.countDocuments( { season: response[i]._id, category: 1, subtype: 3 } );         
         let countWeeks = await Week.countDocuments( { season: response[i]._id } );         
         response[i] = Object.assign(response[i].toJSON(), {countDienst, countCat0, countCat1, countPrem, countWA, countConc, countWeeks});         
      }      
   }      
   res.json( response );   
});

router.post('/', function(req, res){
   res.send('POST route on seasons');
});

//export this router to use in our index.js
module.exports = router;