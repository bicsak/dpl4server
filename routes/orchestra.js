let express = require('express');
const jwt = require('jsonwebtoken');
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

   let orchDoc = await Orchestra.create([{      
      code: params.orchCode,
      fullName: params.orchName,
      location: params.orchLocation,
      timezone: params.orchTimezone,
      // ... add default values for fields :
      maxDienst: [10, 9, 10, 8],
      lastPerformance: true,
      calendar: true,
      venues: [ {full: params.orchLocation, abbr: params.orchLocation} ],
      sections: { 
          sec0: { abbr: "1. Vl", name: "1. Violine", maxFW: 1, active: false },          
          sec1: { abbr: "2. Vl.", name: "2. Violine", maxFW: 1, active: false },          
          sec2: { abbr: "Va", name: "Bratsche", maxFW: 1, active: false },                    
          sec3: { abbr: "Vc", name: "Cello", maxFW: 1, active: false },                    
          sec4: { abbr: "Kb", name: "Kontrabass", maxFW: 1, active: false },                
          sec5: { abbr: "Fl", name: "Flöte", maxFW: 1, active: true },
          sec6: { abbr: "Ob", name: "Oboe", maxFW: 1, active: false },
          sec7: { abbr: "Kl", name: "Klarinette", maxFW: 1, active: false },                    
          sec8: { abbr: "Fg", name: "Fagott", maxFW: 1, active: true },
          sec9: { abbr: "Tp", name: "Trompete", maxFW: 1, active: false },          
          sec10: { abbr: "Hr", name: "Horn", maxFW: 1, active: false },                              
          sec11: { abbr: "Pos", name: "Posaune", maxFW: 1, active: false },                    
          sec12: { abbr: "Tb", name: "Tuba", maxFW: 1, active: false },
          sec13: { abbr: "Hf", name: "Harfe", maxFW: 1, active: false },              
          sec14: { abbr: "Pk/Schl", name: "Pauke/Schlagwerk", maxFW: 1, active: false },              
          sec15: { abbr: "", name: "", maxFW: 1, active: false }, // other instrument             
        },
      categories: [ 
        {
            subtypes:  ["OA", "OS", "BO", "VBO", "HP", "GP", "?"],          
            suffixes:  ["OA", "OS", "BO", "VBO", "HP", "GP", ""],
            locations: [0, 0, 1, 1, 1, 1, 0], 
            durations: [150, 150, 180, 220, 180, 180, 150], 
            numbers: [true, true, true, true, false, false, false] // show nubmers like OA1, OA1 in suffix [true, true, true, ...], [false, false,...], [false]
        },
        {
            subtypes:  ["Vorst.", "WA", "Prem.", "Konz."],
            suffixes:  ["", "WA", "Premiere", ""],
            locations: [1, 1, 1, 2],
            durations: [180, 180, 180, 180],
            numbers: [false, false, false, false] // show nubmers like OA1, OA1 in suffix [true, true, true, ...], [false, false,...], [false]
         },
        {
            subtypes: ["Sonst."],
            suffixes:  [""],
            locations: [0],
            durations: [150],
            numbers: [false] // show nubmers like OA1, OA1 in suffix [true, true, true, ...], [false, false,...], [false]         

        }
    ],
    writeLock: Boolean 
   }], {session}); 
   console.log(orchDoc);   
   if ( !orchDoc ) return { statusCode: 400 };
   
  

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
      notifications: {
        dplChanged: true,
        dplFinal: true,
        dplRejected: true, // DPL zurückgewiesen von einer anderen Mitarbeiterin des OB
        approvalNew: true // Genehmigung angefragt
    },    

      userFn: userDoc.fn,
      userSn: userDoc.Sn,
      userBirthday: userDoc.birthday                
   }], {session});    
   if ( !profileDoc ) return {
     statusCode: 400,
     content: "Benutzerprofil konnte nicht erzeugt werden"
   };   
 
   // update doc in users collection (push profile to profiles array) 
     
   //let userDoc = await User.findById(profileDoc.user).session(session);  
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
   await userDoc.save();
    
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
   }  
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