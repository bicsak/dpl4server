let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');

const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');

const { DateTime } = require("luxon");

router.get('/', async function(req, res) {     
  //console.log(req.authData);
  //console.log(req.query.unit);
  //console.log(req.query.dpl);
    try {
      let session = app.get('session');             
      let dplDoc = await Dpl.findById(req.query.dpl).session(session).populate('p');
      let groupSize = dplDoc.periodMembers.length;
      //console.log('preview', dplDoc);
      // req.authData.s -> 'sec5'
      //if req.query.unit dzp
      // dplDoc.p.isOpendEnd == true -> every ,  ... .p.nextPBegin -> dienst.begin < nextPBegin
      // dplDoc.weekSeason == dienst.season
      let filterObj = {};
      if ( req.query.unit == 'sz' ) filterObj.season = mongoose.Types.ObjectId(dplDoc.weekSeason);      
      filterObj.o = mongoose.Types.ObjectId(req.authData.o);
      filterObj.begin = { '$gte': DateTime.fromJSDate(dplDoc.weekBegin).endOf('week').toJSDate() };
      if ( req.query.unit == 'dzp' && !dplDoc.p.isOpenEnd ) filterObj.begin['$lt'] = dplDoc.p.nextPBegin;
      filterObj.category = { '$ne': 2};
      let key = `instrumentation.${req.authData.s}`;
      filterObj[key] = { '$ne': 0 };
      console.log('filter', filterObj);
      let test = await DienstExtRef.aggregate( [
        {
          '$match': filterObj
        }
      ]).session(session);
      //console.log('Test:', test);
      let dienste = await DienstExtRef.aggregate( [
        {
          '$match': filterObj
        },         
        {
            '$group': {
                _id: `$instrumentation.${req.authData.s}`,
                count: { $sum: '$weight'}           
            }
        },
        { '$sort': {_id: 1} }      
      ]).session(session);
    //console.log('Aggregation result dienste:', dienste);
    let special = await DienstExtRef.aggregate( [
      {
        '$match': { 
          'o': mongoose.Types.ObjectId(req.authData.o), 
          'begin': { '$gte': DateTime.fromJSDate(dplDoc.weekBegin).endOf('week').toJSDate() },            
          'category': 2
        }
      }, 
      { '$count': "countSpecial" }          
    ]).session(session);
    //console.log('Aggregation result special:', special);
    let result = Array(groupSize).fill(0);
    dienste.forEach( obj => result[ obj._id - 1] = obj.count );
    res.status(200).json( {
      n: result, special: special.length ? special[0].countSpecial : 0
    } );       
    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
    }
 });

 
//export this router to use in our index.js
module.exports = router;