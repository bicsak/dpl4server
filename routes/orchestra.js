let express = require('express');
let router = express.Router();
const Orchestra = require('../models/orchestra');
const Profile = require('../models/profile');
const User = require('../models/user');

const { writeOperation } = require('../my_modules/orch-lock');

const { DateTime } = require("luxon");


/*const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');
*/

router.patch('', async function(req, res) { 
   console.log(req.body);
   console.log(req.authData);   
    if (req.authData.m ) {
      let updatedO = await Orchestra.findByIdAndUpdate(req.authData.o, req.body, {returnDocument: 'after'});
       /*let result = await writeOperation( req.authData.o, replacePeriodComment, {      
          //o: req.authData.o,       
          pId: req.params.pId,      
          //sec: req.authData.s,
          newComment: req.body.value
       });      */
       //console.log(`Comment changed: ${result}`);  
       console.log(updatedO);
       res.json(  updatedO );  
    } else {
      res.status(404); // Bad request
    }  
 });

 async function createOrchestra( session, params ) {            
   let userDoc = await User.findById(params.auth.user).session(session);
   if ( userDoc.orchCredit < 1 ) return { statusCode: 400 };
   
   let dt = DateTime.now( { timezone: params.orchTimezone } );
   if ( !dt.zone.isValid ) return { statusCode: 400 };   
/*
   let orchDoc = await Orchestra.create([{      
      code: params.orchCode,
      fullName: params.orchName,
      location: params.orchLocation,
      tz: params.orchTimezone,
      // ... add default values for fields 
   }], {session}); 
   console.log(orchDoc);   
   if ( !orchDoc ) return { statusCode: 400 };
   */
  
/*
   let profileDoc = await Profile.create([{  
      o: orchDoc._id,
      user: params.auth.user,
      role: 'office',
      manager: true,
      confirmed: true,
      //permanentMember: true,
      //trial: true, 
      factor: 1, // 0 < x <= 1, 100%, 50% etc. Vollzeit/Teilzeit
      remark: '', // 'Praktikant'/'ZV bis...'/'festangestellt seit...'
      position: '', // '1. Flöte', 'Solo-Picc','Stimmführer' etc.

      lastVisitedHome: new Date(), // ts for last call for events from this profile

      email: userDoc.email, // only for this profile; can be different from user's email; for notifications (PDF with new DPL etc.)
      // TODO notifications: { type: Map, of: Boolean},    

      userFn: userDoc.fn,
      userSn: userDoc.Sn,
      userBirthday: userDoc.birthday                
   }], {session});    
   if ( !profileDoc ) return {
     statusCode: 400,
     content: "Benutzerprofil konnte nicht erzeugt werden"
   };   */
 
   // update doc in users collection (push profile to profiles array) 
   /*  
   let userDoc = await User.findById(profileDoc.user).session(session);  
   let profileParams = {
     _id: profileDoc._id,
     o: profileDoc.o,
     role: 'office',
     manager: true,
     //section: 'all',
     //permanentMember: profileDoc.permanentMember,
     //trial: profileDoc.trial,
     factor: profileDoc.factor,
     remark: profileDoc.remark,
     position: profileDoc.position,
   };
   userDoc.orchCredit = userDoc.orchCredit - 1;  
   userDoc.profiles.push( profileParams );  
   await userDoc.save();*/
 /*   
   profileParams.token = jwt.sign({
       user: userDoc._id,
       pid: profileDoc._id,
       r: 'office',
       m: true,
       o: orchDoc._id,
       s: 'all'
   }, process.env.JWT_PASS, { expiresIn: '1h' } );  
     
   return {
     statusCode: 201,
     content: profileParams
   }   */ 
}

 router.post('/', async function(req, res){
   console.log(req.params,req.body);
   console.log('authData:', req.authData);
   try {      
      let result = await writeOperation(req.authData.o, createOrchestra, {
         ...req.body,
         auth: req.authData         
      });     
      console.log(result);
      res.status(result.statusCode).send( result.content );      
   } catch (err) {
      res.status(400).send(`Creating orchestra failed`);
   }         
   // 201: Successfully created
   // 500: failed to create (conflict?)
   // 400 otherwise (error)
});
 
//export this router to use in our index.js
module.exports = router;