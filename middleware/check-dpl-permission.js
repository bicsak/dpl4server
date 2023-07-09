function checkDplPermission(req,res,next) {
   if ( req.authData.r == 'scheduler' || 
   req.authData.r == 'musician' && (req.body.op == 'delwish' || req.body.op == 'newwish') ) {
      next();
   } else {
      console.log('Not authorized for manipulating dpl');
      res.sendStatus(401);
   }   
    // if not scheduler, send 401, or if patch (edit wish) and not member
    // req.token.r == scheduler or ==musician and req.method patch and req.body.op newwish/delwish
    // req.method containing 'get'/'post' etc
}

module.exports = checkDplPermission;