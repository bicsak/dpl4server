let express = require('express');
let router = express.Router();
const Profile = require('../models/profile');
const User = require('../models/user');

const { writeOperation } = require('../my_modules/orch-lock');

router.get('/', async function(req, res) {    
    // if manager: all profiles for this o; if scheduler, only for his section and only (confirmed) musicians
    let filter = { o: req.authData.o };
    if ( req.authData.r == 'scheduler' ) {      
      filter = {
         ...filter,
         section: req.authData.s,
         confirmed: true,
         role: 'musician'
      };
    } else filter = { ...filter, manager: false };
    let resp = await Profile.find( filter ).populate('user').sort( {
      /*role: -1,*/
      userSn: 1,
      userFn: 1
    } );
    console.log(resp);
    res.json( resp.map(
      doc => {
         return {
            _id: doc._id,
        
            role: doc.role,
            manager: doc.manager,
            section: doc.section,
            
            confirmed: doc.confirmed,
            
            userId: doc.user.id, 
            userFn: doc.userFn,
            userSn: doc.userSn,
            userEmail: doc.user.email
         };
      }
    ) );    
 });

 router.delete('/:id', async function(req, res) {
   //TODO delete profile (invitation by manager)
   // or deny invitation (user denies invitation)
   // check if not already confirmed
   // update user doc's profiles field in users collection (delete from array)
   
 });

 async function createProfile(session, params) { 
  console.log(`Role: ${params.role}, sec: ${params.sec}, user: ${params.username}`);        

  let user = User.findOne( {
    email: params.username
  }).session(session);  

  const profile = new Profile( {
    o: params.o,
    confirmed: false,
    manager: false,
    section: params.sec,
    role: params.role,    
    userFn: user.fn,
    userSn: user.sn,
    userBirthday: user.birthday,
    email: user.email,
    user: user._id
  } );
  profile.save(session);

  user.profiles.push( {
    _id: profile._id,
    o: params.o,
    role: params.role,
    manager: false,
    section: params.sec,
    confirmed: false
  } );
  user.save();

  return profile;  // TODO as IProfile         
 }
 
 router.post('/', async function(req, res){    
    // Create new profile doc in profiles collection for a specific user with confirmed = false
    // request body contains username (email) and section; if section == all, create office role, otherwise musician role
    // update user doc's profiles field in users collection (add new profile to array)
    // return new profile as IProfile

    let role = req.body.section == 'all' ? 'office' : 'musician';
    let result = await writeOperation( req.authData.o, createProfile, {      
      o: req.authData.o,       
      role: role,      
      sec: req.body.section,
      user: req.body.username
   });      
   console.log(`Profile successfully created: ${result}`);      
       
   res.json( result );     
 });

 router.patch('/:id', async function(req, res) {
   //TODO accept invitation to an orchestra as musician/office
   // modify doc in profiles collection
   // if role == musician and first profile in the group, add a second profile with scheduler role
   // update doc in users collection (profiles field)
   // return the whole profile doc in an array  (IProfile[]) with the scheduler's profile if newly created
 });
 
 //export this router to use in our index.js
 module.exports = router;