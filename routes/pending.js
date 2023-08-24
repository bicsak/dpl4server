let express = require('express');
let router = express.Router();
const app = require('../server');
const Dpl = require('../models/dpl');

router.get('/', async function(req, res) { 
  console.log(req.authData);
    try {
      let session = app.get('session');                   
      let findConfig = {
        o: req.authData.o              
      };
      if ( req.authData.r == 'musician' ) {
        // TODO findConfig.groupSurvey.feedbacks        
        findConfig.closed = true;
      }
      if ( req.authData.r == 'office' ) {
        findConfig.published = true;
        findConfig['officeSurvey.status'] = 'pending';
      }
      console.log(findConfig);
      let pendingDocs = await Dpl.find(findConfig).sort({'weekBegin': 1}).limit(5).session(session);
      
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