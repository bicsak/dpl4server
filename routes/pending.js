let express = require('express');
const mongoose = require( 'mongoose' );
let router = express.Router();
const app = require('../server');
const Dpl = require('../models/dpl');

router.get('/', async function(req, res) { 
  console.log(req.authData);
    try {
      let session = app.get('session');                         
      let pendingDocs;
      if ( req.authData.r == 'musician' ) {
        pendingDocs = await Dpl.aggregate( [
          {
            '$match': {
              'o': mongoose.Types.ObjectId(req.authData.o), 
              'closed': true, 
              'published': false, 
              's': req.authData.s
            }
          }, {
            '$addFields': {
              'memberIndex': {
                '$indexOfArray': [
                  '$periodMembers', mongoose.Types.ObjectId(req.authData.pid) 
                ]
              }
            }
          }, {
            '$project': {
              'status': {
                '$arrayElemAt': [
                  '$groupSurvey.feedbacks', '$memberIndex'
                ]
              }, 
              'weekBegin': 1, 
              s: 1,
              '_id': 1
            }
          }, {
            '$match': {
              'status.vote': 'pending'
            }
          }
        ]).session(session);        
      } else if ( req.authData.r == 'office' ) {
        let findConfig = {
          o: req.authData.o,
          published: true
        };        
        findConfig['officeSurvey.status'] = 'pending';
        console.log(findConfig);
        pendingDocs = await Dpl.find(findConfig).sort({'weekBegin': 1}).limit(5).session(session);             
      }      
      console.log(pendingDocs);
      let converted = pendingDocs.map( p => {
        return {
          section: p.s,
          weekBegin: p.weekBegin.getTime(),
        }
      });
      console.log('converted', converted)
      res.status(200).json(converted);       
    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
    }
 });

 
//export this router to use in our index.js
module.exports = router;