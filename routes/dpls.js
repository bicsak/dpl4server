let express = require('express');
let router = express.Router();
const Dpl = require('../models/dpl');

router.get('/', async function(req, res){
   let oneDpl = await Dpl.findOne({});
   res.send('GET route on weeks. ' + ` Begin: ${oneDpl.weekBegin}`);
   //await app.get('conn').db.   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;