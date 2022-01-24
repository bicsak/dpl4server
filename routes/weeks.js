let express = require('express');
let router = express.Router();
const Week = require('../models/week');

router.get('/', async function(req, res){
   let oneWeek = await Week.findOne({});
   res.send('GET route on weeks.' + `${oneWeek.begin}`);
   //await app.get('conn').db.   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;