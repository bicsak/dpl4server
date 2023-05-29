let express = require('express');
let router = express.Router();
const User = require('../models/user');

router.get('/', async function(req, res){
   if ( req.query.q ) {
      console.log(`loading users for ${req.query.q}...`);
      let sanitized = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      console.log(sanitized.split(",")[0]);
      let configObj = {
         sn: { $regex: '^'+sanitized.split(",")[0], $options: 'i'}          
      };
      if (sanitized.split(",").length > 1) configObj.fn = { 
         $regex: '^'+sanitized.split(",")[1], $options: 'i' } 
      //console.log(sanitized.split(",")[1]);
      let resp = await User.find( configObj );                
      console.log(resp);
      res.json( resp.map( val => {
         return { name: val._id, firstname: val.fn, surname: val.sn, birthday: val.birthday };
      }) ); 
   }
});

//export this router to use in our index.js
module.exports = router;