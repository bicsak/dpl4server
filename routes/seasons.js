let express = require('express');
let router = express.Router();
const Season = require('../models/season');

router.get('/', async function(req, res) {   
   let resp = await Season.find( { o: req.authData.o } );
   console.log(resp);
   res.json( resp );   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;