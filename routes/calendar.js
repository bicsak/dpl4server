let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');
const ics = require('ics');

//const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');
const Profile = require('../models/profile');

const { DateTime } = require("luxon");

router.get('/', async function(req, res) {   
  // req.query.profId, req.query.type == 'all'|'dienst'|'no-dienst'
    
    try {
      let session = app.get('session');
      let prof = req.query.profId;
      let profDoc = await Profile.findById(prof).session(session).populate('o');
      let orch = profDoc.o;
      let result = await Dpl.aggregate( [
        {
          '$match': { 
            //'o': mongoose.Types.ObjectId(req.authData.o), 
            'weekBegin': { '$gte': DateTime.now().startOf('week').toJSDate() },
            'periodMembers': mongoose.Types.ObjectId(prof)
          }
        }, 
        { '$addFields': { 'memberInd': { '$indexOfArray': [ '$periodMembers', mongoose.Types.ObjectId(prof) ] } } }, 
        { '$unwind': { 'path': '$seatings' } },         
        { '$addFields': { 'disp': { '$arrayElemAt': [ '$seatings.sp', '$memberInd' ] } } }, 
        { '$match': { 
          'seatings.dienstBegin': {'$gt': DateTime.now().toJSDate()},
          'disp': { $in: [1, 16] } // TODO which req.query.type all/no-dienst/dienst
        } 
          // TODO if Krank...
        }, 
        { '$sort': { 'seatings.dienstBegin': 1 } }, 
        //{ '$limit': 3 },
        { '$lookup': { from: 'dienst', localField: 'seatings.d', foreignField: '_id', as: 'dienst' } },
        { '$project': {    
          'published': 1,
          'weekBegin': 1,
          'dienst': { $arrayElemAt: ["$dienst", 0] }
          }
        }
      ]).session(session);
    console.log('Aggregation result:', result);
    /*let response = result.map( val => {
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
    res.status(200).json(response);  */     
    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
       return;
    }

    const { error, value } = ics.createEvents(
      /* result.map(dpl => {
        let event = {
          start: [2018y, 5m, 30d, 6h, 30m], from dpl.begin
          startInputType: 'utc',
          duration: { hours: 6, minutes: 30 }, 
          title: 'Bolder Boulder', dpl.dienst.name + subtype, suffix, seq 
          description: 'Annual 10-kilometer run in Boulder, Colorado',
          location: 'Folsom Field, University of Colorado (finish line)',
          url: 'https://odp.bicsak.net/',  
          status: 'CONFIRMED'/'TENTATIVE', from dpl.published
          productID: 'ODP'
        }
        return event;
      })*/
      [
        {
          title: 'Lunch',
          start: [2023, 11, 15, 12, 15],
          duration: { minutes: 45 }
        },
        {
          title: 'Dinner',
          start: [2023, 11, 15, 12, 15],
          duration: { hours: 1, minutes: 30 }
        }
      ]);
      
      if (error) {
        console.log(error);
        return;
      }
      
      console.log(value);
      res.set({
        'Content-Type': 'text/calendar',        
        'Content-Disposition': `attachment; filename=odp_dienste.ics`,
      });
      res.send(value);
 });

 
//export this router to use in our index.js
module.exports = router;