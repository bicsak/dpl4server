let express = require('express');
let router = express.Router();
const Profile = require('../models/profile');
const User = require('../models/user');

const { writeOperation } = require('../my_modules/orch-lock');

router.get('/', async function(req, res) {    
    // if manager: all profiles for this o (for users component to invite users etc.)
    //if scheduler, only for his section and only (confirmed) musicians
    // (for periods component, creating new periods etc.)
    let filter = { o: req.authData.o };
    if ( req.authData.r == 'scheduler' ) {      
      filter = {
         ...filter,
         section: req.authData.s,
         confirmed: true,
         role: 'musician'         
      };
    } //else filter = { ...filter, manager: false };
    let resp = await Profile.find( filter )
    .sort( {
      /*role: -1,*/
      userSn: 1,
      userFn: 1
    } );
    console.log(resp);
    res.json( resp );    
 });

 router.delete('/:id', async function(req, res) {
   //TODO delete profile (invitation by manager)
   // or deny invitation (user denies invitation)
   // check if not already confirmed
   // update user doc's profiles field in users collection (delete from array)
   
 });

 async function createProfile(session, params) { 
  console.log(`Role: ${params.role}, sec: ${params.section}, user: ${params.userId}`);        

  let user = await User.findById( params.userId ).session(session);  

  const profile = new Profile( {
    o: params.o,
    confirmed: false,
    manager: false,
    permanentMember: params.permanent,
    trial: params.trial,
    factor: params.factor,
    remark: params.remark,
    position: params.position,
    section: params.section,
    role: params.role,    
    userFn: user.fn,
    userSn: user.sn,
    userBirthday: user.birthday,
    email: user.email,
    user: user._id
  } );
  await profile.save(session);
  
  return {
    success: true, 
    content: //profile
    profile._doc
    /*{
      ...profile._doc,
      userEmail: profile.email
    }*/
  };
 }
 
 router.post('/', async function(req, res){    
    // Create new profile doc in profiles collection for a specific user with confirmed = false
    // request body contains username (email) and section; if section == all, create office role, otherwise musician role
    // update user doc's profiles field in users collection (add new profile to array)
    // return new profile as IProfile
    
    let result = await writeOperation( req.authData.o, createProfile, {
      ...req.body,      
      o: req.authData.o,             
   });      
   console.log(`Profile successfully created: ${result}`);      
       
   res.json( result );     
 });

 async function editProfile(session, params) { 
  //TODO
  // modify doc in profiles collection   
  // update doc in users collection (profiles field)   
  // return response as IEditProfileEditableData

  return params;
 }

 router.patch('/:id', async function(req, res) {
  console.log(req.body);
  if ( req.body.op == 'edit' ) {
    console.log(`Editing profile with id ${req.params.id}`);
    let result = await writeOperation( req.authData.o, editProfile, {
      ...req.body,      
      o: req.authData.o,             
   });      
   console.log(`Profile successfully created: ${result}`);                
    
    res.json( {success: true, content: result} );     
  } else {
    //TODO accept invitation to an orchestra as musician/office
  }
  
   
 });
 
 //export this router to use in our index.js
 module.exports = router;