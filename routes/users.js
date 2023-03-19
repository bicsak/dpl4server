let express = require('express');
let router = express.Router();
const User = require('../models/user');

router.get('/', async function(req, res){
   if ( req.query.q ) {
      console.log(`loading users for ${req.query.q}...`);
      let sanitized = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let resp = await User.find( {         
        email: { $regex: sanitized, $options: '^' }
      } )/*.select('email')*/;                
      res.json( resp.map( val => {
         return { name: val.email, firstname: val.fn, surname: val.sn };
      }) ); 
   }
});

//export this router to use in our index.js
module.exports = router;