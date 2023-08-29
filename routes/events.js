let express = require('express');
let router = express.Router();
const app = require('../server');

const Event = require('../models/event');
const Profile = require('../models/profile');

const { DateTime } = require("luxon");

router.get('/', async function(req, res) { 
  //console.log(req.authData);
    try {
      let session = app.get('session');             
      // TODO delete older docs from Events coll
      let findConfig = {
        o: req.authData.o,
        $or: [
          { $and: [ {profiles: []}, {sec: ''} ] },          
          { profiles: req.authData.pid }
        ],
        'created_at': { $gt : DateTime.now().minus({days: 30}).toJSDate() }          
      };
      if ( req.authData.r == 'scheduler' ) {
        findConfig.$or.push( {sec: req.authData.s} );
      }
      if ( req.authData.r == 'office' ) {
        findConfig.$or.push( {public: true} );
      }
      //console.log(findConfig);
      let eventDocs = await Event.find(findConfig).sort({'created_at': -1}).session(session);
      
      //console.log(eventDocs);
      let converted = eventDocs.map( ev => {
        return {
          entity: ev.entity,
          action: ev.action,
          extra: ev.extra,
          ts: ev.created_at.getTime(),
          weekBegin: ev.weekBegin.getTime(),
        }
      });

      let profDoc = await Profile.findById(req.authData.pid).session(session);
      //console.log('converted', converted)
      res.status(200).json({
        events: converted, 
        lastVisit: profDoc.lastVisitedHome.getTime()
      });       
      profDoc.lastVisitedHome = new Date();
      await profDoc.save();
    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
    }
 });

 
//export this router to use in our index.js
module.exports = router;