let express = require('express');
let router = express.Router();
const User = require('../models/user');

router.get('/', async function(req, res){
   let oneUser = await User.findOne({});
   res.send('GET route on users ' + ` Login: ${oneUser.login},
   Role: ${oneUser.role}`);
   //await app.get('conn').db.   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;