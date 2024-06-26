let express = require('express');
const jwt = require('jsonwebtoken');
let router = express.Router();
const Profile = require('../models/profile');
const User = require('../models/user');
const Period = require('../models/period');
const Orchestra = require('../models/orchestra');

const { writeOperation } = require('../my_modules/orch-lock');
const { notificationDefaults } = require('../my_modules/notifications');

router.get('/', async function(req, res) { 
    if ( req.query.pending ) {      
      let profileDocs = await Profile.find( {        
        user: req.authData.user,
        confirmed: false
      }).populate('o');
      console.log(profileDocs);
      let resp = profileDocs.map(
        p => {
          return {
            id: p._id,
            orchestraFullName: p.o.fullName,
            intendedManager: false,
            role: p.role,   
            section: p.section == 'all' ? 'all' : p.o.sections.get(p.section).name, // 'Flöte' statt 'sec0'
            factor: p.factor,
            trial: p.trial,
            remark: p.remark,
            position: p.position,
            permanent: p.permanentMember
          }
        }
      );      
      let newManagerDoc = await Profile.find( {        
        user: req.authData.user,
        intendedManager: true
      }).populate('o');
      if ( newManagerDoc.length ) {
        resp.push( {
          id: newManagerDoc[0]._id,
          orchestraFullName: newManagerDoc[0].o.fullName,
          role: 'office',   
          section: 'all',
          intendedManager: true,
          factor: newManagerDoc[0].factor,
          trial: newManagerDoc[0].trial,
          remark: newManagerDoc[0].remark,
          position: newManagerDoc[0].position,
          permanent: newManagerDoc[0].permanentMember
        } );
      }
      res.json(resp);
      return;
    }
    // if manager: all profiles for this o (for users component to invite users etc.)
    // if scheduler, only for his section and only (confirmed) musicians
    // (for periods component, creating new periods etc.)
    let filter = { o: req.authData.o };
    if ( req.authData.r == 'scheduler' ) {      
      filter = {
         ...filter,
         section: req.authData.s,
         confirmed: true,
         role: 'musician'         
      };
    }
    let resp = await Profile.find( filter ).sort( {    
      userSn: 1,
      userFn: 1
    } );
    
    res.json( resp );    
 });

 async function deleteProfile(session, params) { 
  // delete profile (or if not yet confirmed, the invitation by manager)
  // or deny invitation (user denies invitation)
      
  // check if delete is allowed
  // delete profile possible for board, scheduler always, office (if not manager)
  // musician: if not yet confirmed or confirmed but no periods involved  

  let profileDoc = await Profile.findById( params.prof ).session(session);  
  if ( !profileDoc || profileDoc.manager ) return;
  if ( profileDoc.role == 'musician' && profileDoc.confirmed ) {
    //check if profile is contained ina any periods
    let periodDoc = await Period.findOne( {
      o: params.o,
      "members": { $elemMatch: {prof: params.prof} }
    } ).session(session);
    if ( periodDoc ) return;      
  }
  console.log('Finding userDoc...');

  // update user doc's profiles array field in users collection (delete from array)
  if ( profileDoc.confirmed ) {
    let userDoc = await User.findById( profileDoc.user ).session(session);  
    let indexOfProfile = userDoc.profiles.findIndex(
      p => p._id == params.prof
    );
    userDoc.profiles.splice(indexOfProfile, 1);
    await userDoc.save();
  }  

  // delete profile doc
  await profileDoc.deleteOne();
 }

 router.delete('/:id', async function(req, res) {
  console.log(`Delete request for prof id ${req.params.id}`);
  await writeOperation( req.authData.o, deleteProfile, {
    prof: req.params.id,      
    o: req.authData.o,             
  });
 });

 async function createProfile(session, params) { 
  console.log(`Role: ${params.role}, sec: ${params.section}, user: ${params.userId}`);        

  let user = await User.findById( params.userId ).session(session);  
  if ( !user ) return {
    success: false,
    reason: 'Benutzer existiert nicht'
  };

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
    notifications: notificationDefaults[params.role],
    lastVisitedHome: new Date(),
    userFn: user.fn,
    userSn: user.sn,
    userBirthday: user.birthday,
    email: user.email,
    user: user._id
  } );
  await profile.save(session);
  
  return {
    success: true, 
    content: profile._doc 
  };
 }
 
 router.post('/', async function(req, res){    
    // Create new profile doc in profiles collection for a specific user with confirmed = false
    // request body contains userId, section, role
    // update user doc's profiles field in users collection (add new profile to array)
    // hm...
    // return new profile as IProfile
    console.log(req.body);
    let result = await writeOperation( req.authData.o, createProfile, {
      ...req.body,      
      o: req.authData.o,             
   });      
   console.log(`Profile successfully created: ${result}`);      
       
   res.json( result );     
 });

 async function editProfile(session, params) {   
  let profileDoc = await Profile.findById(params.prof).session(session);
  if ( !profileDoc ) return {
    success: false,
    reason: "Benutzerprofil nicht gefunden"
  };
  
  // modify doc in profiles collection
  profileDoc.remark = params.remark;
  profileDoc.position = params.position;
  profileDoc.permanentMember = params.permanent;
  profileDoc.trial = params.trial;
  profileDoc.factor = params.factor;
  await profileDoc.save();
  
  // update doc in users collection (profiles field)   
  let userDoc = await User.findById(profileDoc.user).session(session);
  let indexOfProfile =  userDoc.profiles.findIndex(
    p => p._id == params.prof
  );  
  userDoc.profiles[indexOfProfile].remark = params.remark;
  userDoc.profiles[indexOfProfile].position = params.position;
  userDoc.profiles[indexOfProfile].permanentMember = params.permanent;
  userDoc.profiles[indexOfProfile].trial = params.trial;
  userDoc.profiles[indexOfProfile].factor = params.factor;
  await userDoc.save();
  
  // return response as IEditProfileEditableData
  return {
    success: true,
    content: {
      remark: params.remark,
      position: params.position,
      permanent: params.permanent,
      trial: params.trial,
      factor: params.factor
    }
  };  
 }

 async function confirmNewManager(session, params) { 
  // orchestra doc, set acceptTokensFrom value
  console.log(params.prof);
  await Orchestra.findByIdAndUpdate(params.o, {
    acceptTokensFrom: new Date()
  }).session(session);

  let oldManagersProfileDoc = await Profile.findOne({manager: true}).session(session);
  
  let profileDoc = await Profile.findById(params.prof).session(session);
  if ( !profileDoc ) return {
    success: false,
    reason: "Benutzerprofil nicht gefunden"
  };
  profileDoc.manager = true;
  profileDoc.intendedManager = false;
  await profileDoc.save();    

  // update doc in users collection (update profile in profiles array)     
  let userDoc = await User.findById(profileDoc.user).session(session);
  let indexOfProfile =  userDoc.profiles.findIndex(
    p => p._id == params.prof
  );    
  userDoc.profiles[indexOfProfile].manager = true;
  await userDoc.save();

  oldManagersProfileDoc.manager = false;  
  await oldManagersProfileDoc.save();    

  // update doc in users collection (update profile in profiles array)     
  let oldUserDoc = await User.findById(oldManagersProfileDoc.user).session(session);
  console.log('oldManagersProfileDoc._id', oldManagersProfileDoc._id);
  console.log('oldUserDoc', oldUserDoc._id);
  console.log('oldUserDoc profiles', oldUserDoc.profiles);
  let indexOfOldProfile =  oldUserDoc.profiles.findIndex(
    p => p._id == oldManagersProfileDoc._id.toString()
  );    
  oldUserDoc.profiles[indexOfOldProfile].manager = false;
  await oldUserDoc.save();
     
  return {
    success: true,
    content: true
  }  
 }

 async function confirmProfile(session, params) { 
  let profileDoc = await Profile.findById(params.prof).session(session);
  if ( !profileDoc ) return {
    success: false,
    reason: "Benutzerprofil nicht gefunden"
  };
  profileDoc.confirmed = true;
  await profileDoc.save();  

  // update doc in users collection (push profile to profiles array)   
  let userDoc = await User.findById(profileDoc.user).session(session);  
  let profileParams = {
    _id: params.prof,
    o: profileDoc.o,
    role: profileDoc.role,
    manager: profileDoc.manager,
    section: profileDoc.section,
    permanentMember: profileDoc.permanentMember,
    trial: profileDoc.trial,
    factor: profileDoc.factor,
    remark: profileDoc.remark,
    position: profileDoc.position,
  };
  userDoc.profiles.push( profileParams );  
  await userDoc.save();

  let oId = profileDoc.o;
  await profileDoc.populate('o');  
  profileParams.o = profileDoc.o;
  profileParams.token = jwt.sign({
      user: profileDoc.user,
      pid: params.prof,
      r: profileDoc.role,
      m: profileDoc.manager,
      o: oId,
      s: profileDoc.section
  }, process.env.JWT_PASS, { expiresIn: '1h' } );  
    
  return {
    success: true,
    content: profileParams
  }  

 }

 router.patch('/:id', async function(req, res) {
  console.log(req.body);
  if ( req.body.op == 'edit' ) {
    console.log(`Editing profile with id ${req.params.id}`);
    let result = await writeOperation( req.authData.o, editProfile, {
      ...req.body,      
      o: req.authData.o,             
      prof: req.params.id
   });         
    
    res.json( result );     
  } else if ( req.body.op == 'newIntendedManager' ) {
    if ( req.body.newManager ) {
      //set intendedManager to true
      await Profile.findOneAndUpdate({_id: req.params.id, o: req.authData.o, manager: false, role: 'office'}, {intendedManager: true});  
    } else {
      //set intendedManager to false
      await Profile.findOneAndUpdate({_id: req.params.id, o: req.authData.o, manager: false, role: 'office'}, {intendedManager: false});  
    }
    res.json( {
      success: true,
      content: req.body.newManager
    });
  } else if ( req.body.op == 'confirmNewManager' ) {
    let result = await writeOperation( req.authData.o, confirmNewManager, {      
      o: req.authData.o,             
      prof: req.params.id
    });             
    res.json( result );

  } else {
    let result = await writeOperation( req.authData.o, confirmProfile, {      
      o: req.authData.o,             
      prof: req.params.id
   });             
  res.json( result );      
  }     
 });
 
 //export this router to use in server.js
 module.exports = router;