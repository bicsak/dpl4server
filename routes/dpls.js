let express = require('express');
const jwt = require('jsonwebtoken');
let router = express.Router();
const Dpl = require('../models/dpl');
const Period = require('../models/period');
const Week = require('../models/week');

function verifyToken(req,res,next) {
   const bearerHeader = req.headers['authorization'];
   if ( typeof bearerHeader !== 'undefined' ) {
      const bearer = bearerHeader.split(' ');
      const bearerToken = bearer[1];
      req.token = bearerToken;
      next();
   } else {
      req.sendStatus(403);
   }
}

router.get('/:mts', verifyToken, async function(req, res) {
   
   jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err) 
         res.sendStatus(403);
      else {
         let oneDpl = await Dpl.findOne({
            o: authData.o,
            weekBegin: new Date(req.params.mts*1000),
            s: authData.s
         }).populate('p').populate('w');                  
               
         console.log(authData);
         res.json({
            msg: 'Auth success',
            dpl: oneDpl
         });
      }
   });
   
});

router.post('/', function(req, res){
   res.send('POST route on weeks.');
});

//export this router to use in our index.js
module.exports = router;