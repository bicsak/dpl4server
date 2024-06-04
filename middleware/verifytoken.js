const jwt = require('jsonwebtoken');
const Orchestra = require('../models/orchestra');

async function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if ( typeof bearerHeader !== 'undefined' ) {
       const bearer = bearerHeader.split(' ');
       const bearerToken = bearer[1];
       req.token = bearerToken;
       try {
        let authData = jwt.verify(bearerToken, process.env.JWT_PASS)
        console.log('verifing Jwt...', authData);
        /***********
         * 
         *  {
  user: '664520ab802d6f09d341ceb3',
  pid: '664520af3edbc987f7771d94',
  r: 'office',
  m: true,
  o: '664520ae3edbc987f7771d7a',
  s: 'all',
  iat: 1717365208,
  exp: 1717368808
} */
        if ( authData.o ) {
          let orch = await Orchestra.findById(authData.o);
          if (authData.iat*1000 < orch.acceptTokensFrom.getTime()) {
            console.log('Backend accepts no tokens. New login requested');
            res.sendStatus(401);
          } else {        
            req.authData = authData;
            next();
          }
        } else {        
          req.authData = authData;
          next();
        }
       } catch (err) {
         console.log(err);
         res.sendStatus(401);
       }       
    } else {
      console.log('No bearer token');
      res.sendStatus(401);
    }
}

module.exports = verifyToken;