function checkDplPermission(req,res,next) {
   next();
    /*const bearerHeader = req.headers['authorization'];
    if ( typeof bearerHeader !== 'undefined' ) {
       const bearer = bearerHeader.split(' ');
       const bearerToken = bearer[1];
       req.token = bearerToken;
       next();
    } else {
       req.sendStatus(401);
    }*/ //TODO if not scheduler, send 401, or if patch (edit wish) and not member
    // req.token.r == scheduler or ==musician and req.method patch and req.body.op newwish/delwish
    // req.method containing 'get'/'post' etc
}

module.exports = checkDplPermission;