let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');

const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');

const { DateTime } = require("luxon");

router.get('/', async function(req, res) { 
  console.log(req.authData);
    try {
      let session = app.get('session');             
      let result = await Dpl.aggregate( [
        {
          '$match': { 
            'o': mongoose.Types.ObjectId(req.authData.o), 
            'weekBegin': { '$gte': DateTime.now().startOf('week').toJSDate() },
            'periodMembers': mongoose.Types.ObjectId(req.authData.pid)
          }
        }, 
        { '$addFields': { 'memberInd': { '$indexOfArray': [ '$periodMembers', mongoose.Types.ObjectId(req.authData.pid) ] } } }, 
        { '$unwind': { 'path': '$seatings' } },         
        { '$addFields': { 'disp': { '$arrayElemAt': [ '$seatings.sp', '$memberInd' ] } } }, 
        { '$match': { 
          'seatings.dienstBegin': {'$gt': DateTime.now().toJSDate()},
          'disp': { $in: [1, 16] } } 
        }, 
        { '$sort': { 'seatings.dienstBegin': 1 } }, 
        { '$limit': 3 },
        { '$lookup': { from: 'dienst', localField: 'seatings.d', foreignField: '_id', as: 'dienst' } },
        { '$project': {    
          'published': 1,
          'weekBegin': 1,
          'dienst': { $arrayElemAt: ["$dienst", 0] }
          }
        }
      ]).session(session);
    console.log('Aggregation result:', result);
    let response = result.map( val => {
      return {
        weekBegin: val.weekBegin.getTime(),
        published: val.published,
        name: val.dienst.name,
        category: val.dienst.category,
        subtype: val.dienst.subtype,
        seq: val.dienst.seq,
        total: val.dienst.total,
        suffix: val.dienst.suffix,
        dienstBegin: val.dienst.begin.getTime()
      }
    });
    console.log('Converted:', response);
    res.status(200).json(response);       
    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
    }
 });

 
//export this router to use in our index.js
module.exports = router;