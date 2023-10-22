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
        // tODO lookup production for duration
        // lookup period for initials??
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
       result.map(dpl => {
        let event = {
          start: [dpl.dienst.begin.getUTCFullYear(), dpl.dienst.begin.getUTCMonth()+1, dpl.dienst.begin.getUTCDate(), dpl.dienst.begin.getUTCHours(), dpl.dienst.begin.getUTCMinutes()], 
          startInputType: 'utc',
          duration: { hours: 3, minutes: 0 }, // TODO from orch or production
          title: dpl.dienst.name, // TODO + subtype, suffix, seq toUpperCase, zLM etc.
          description: 'Status:, Genehmigung:, Einteilung, Aushilfen:, Dienstkommentar von DE, OD, Freiwünsche:, Einteilung OK?', // TODO
          location: 'Wiesbaden GH', // TODO dpl.location or from orch.categories
          url: `https://odp.bicsak.net/musician/week/?mts=${dpl.weekBegin.getTime()}`,  // TODO url from env
          status: dpl.published ? 'CONFIRMED' : 'TENTATIVE', 
          productID: 'ODP'
        }
        return event;
      })
      /*[
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
      ]*/);
      
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