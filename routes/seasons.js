let express = require('express');
let router = express.Router();
const Season = require('../models/season');

router.get('/', async function(req, res){
   let oneSeason = await Season.findOne({});
   res.send('GET route on seasons. ' + `Begin: ${oneSeason.begin}, label: ${oneSeason.label},
   comment: ${oneSeason.comment}`);
   //await app.get('conn').db.   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;