let express = require('express');
let router = express.Router();
const Profile = require('../models/profile');

router.get('/', async function(req, res) {    
    // TODO if manager: all profiles for this o; if scheduler, only for his section
    let resp = await Profile.find( { o: req.authData.o } );
    console.log(resp);
    res.json( resp );    
 });

 /*
 router.post('/', function(req, res){
    res.send('POST route on profiles');
    // Create new profile for a specific user; confirmed = false
 });*/
 
 //export this router to use in our index.js
 module.exports = router;