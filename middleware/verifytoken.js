const jwt = require('jsonwebtoken');

function verifyToken(req,res,next) {
    const bearerHeader = req.headers['authorization'];
    if ( typeof bearerHeader !== 'undefined' ) {
       const bearer = bearerHeader.split(' ');
       const bearerToken = bearer[1];
       req.token = bearerToken;
       try {
         req.authData = jwt.verify(bearerToken, process.env.JWT_PASS);
         next();
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