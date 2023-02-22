function checkPeriodPermission(req,res,next) {
    if ( req.authData.r == 'scheduler' ) next(); else {
       console.log('Not authorized for manipulating periods');
       res.sendStatus(401);
    }        
 }
 
 module.exports = checkPeriodPermission;