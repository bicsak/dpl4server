let express = require('express');
let router = express.Router();
const Profile = require('../models/profile');

router.get('/', async function(req, res) {    
    // if manager: all profiles for this o; if scheduler, only for his section and only (confirmed) musicians
    let filter = { o: req.authData.o };
    if ( req.authData.r == 'scheduler' ) {      
      filter = {
         ...filter,
         section: req.authData.s,
         confirmed: true,
         role: 'musician'
      };
    } else filter = { ...filter, manager: false };
    let resp = await Profile.find( filter ).populate('user').sort( {
      /*role: -1,*/
      userSn: 1,
      userFn: 1
    } );
    console.log(resp);
    res.json( resp.map(
      doc => {
         return {
            _id: doc._id,
        
            role: doc.role,
            manager: doc.manager,
            section: doc.section,
            
            confirmed: doc.confirmed,
            
            userId: doc.user.id, 
            userFn: doc.userFn,
            userSn: doc.userSn,
            userEmail: doc.user.email
         };
      }
    ) );    
 });

 /*
 router.post('/', function(req, res){
    res.send('POST route on profiles');
    // Create new profile for a specific user; confirmed = false
 });*/
 
 //export this router to use in our index.js
 module.exports = router;