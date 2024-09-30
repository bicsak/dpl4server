let express = require('express');
const jwt = require('jsonwebtoken');
let router = express.Router();
const mongoose = require( 'mongoose' );
const Orchestra = require('../models/orchestra');
const Profile = require('../models/profile');
const User = require('../models/user');

const { writeOperation } = require('../my_modules/orch-lock');

const { DateTime } = require("luxon");

async function updateOrchestra( session, params ) { 
   // Take maxFW value for each section from orchestra doc
   let orchDocOld = await Orchestra.findById(params.auth.o);
   let sections = orchDocOld.sections;   
   sections.forEach( (val, key, map) => { map.set(key, {
      abbr: val.abbr,
      name: val.name,
      active: val.active,
      maxFW: val.maxFW ? val.maxFW : 1
   }); } );   
   console.log(sections);
   params.config.sections = sections;
   // update orchestra doc with user input preserving maxFW from DB
   let updatedO = await Orchestra.findByIdAndUpdate(params.auth.o, params.config, {returnDocument: 'after'}).session(session);       
   //console.log(updatedO);
   return {statusCode: 200, content: updatedO};            
}

router.patch('', async function(req, res) { 
   //console.log(req.body);
   //console.log(req.authData);   
    if (req.authData.m ) {
      try {      
         let result = await writeOperation(req.authData.o, updateOrchestra, {
            config: req.body,
            auth: req.authData         
         });     
         console.log(result);
         res.status(result.statusCode).send( result.content );      
      } catch (err) {
         res.status(400).send(`Updating orchestra failed`);
      }          
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
      // add default values for fields :
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
            locations: [0, 0, 0, 0, 0, 0, 0], 
            durations: [150, 150, 180, 220, 180, 180, 150], 
            numbers: [true, true, true, true, false, false, false] // show nubmers like OA1, OA1 in suffix [true, true, true, ...], [false, false,...], [false]
        },
        {
            subtypes:  ["Vorst.", "WA", "Prem.", "Konz."],
            suffixes:  ["", "WA", "Premiere", ""],
            locations: [0, 0, 0, 0],
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
    writeLock: false
   }], {session}); 
   console.log(orchDoc);   
   if ( !orchDoc ) return { statusCode: 400 };     

   let profileDoc = await Profile.create([{  
      o: new mongoose.Types.ObjectId(orchDoc[0]._id),
      user: new mongoose.Types.ObjectId(params.auth.user),
      role: 'office',
      manager: true,
      confirmed: true,
      permanentMember: true,
      trial: true, 
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
   console.log('new profile Doc', profileDoc);
 
   // update doc in users collection (push profile to profiles array)         
   let profileParams = {
     _id: new mongoose.Types.ObjectId(profileDoc[0]._id),
     o: new mongoose.Types.ObjectId(orchDoc[0]._id),
     role: 'office',
     manager: true,
     section: 'all',
     permanentMember: true,
     trial: false,
     factor: 1,
     remark: '',
     position: '',
   };
   
   userDoc.orchCredit = userDoc.orchCredit - 1;  
   userDoc.profiles.push( profileParams );  
   await userDoc.save();
    
   profileParams.token = jwt.sign({
       user: userDoc._id,
       pid: profileDoc[0]._id,
       r: 'office',
       m: true,
       o: orchDoc._id,
       s: 'all'
   }, process.env.JWT_PASS, { expiresIn: '1h' } );  

   console.log('profile params', profileParams);
   profileParams.o = orchDoc[0];
     
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