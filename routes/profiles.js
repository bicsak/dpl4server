let express = require('express');
let router = express.Router();
const Profile = require('../models/profile');

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
 
 router.post('/', function(req, res){
    res.send('POST route on profiles');
    // TODO
    // Create new profile doc in profiles collection for a specific user with confirmed = false
    // request body contains username (email) and section; if section == all, create office role, otherwise musician role
    // update user doc's profiles field in users collection (add new profile to array)
    // return new profile as IProfile
 });

 router.patch('/:id', function(req, res) {
   //TODO accept invitation to an orchestra as musician/office
   // modify doc in profiles collection
   // if role == musician and first profile in the group, add a second profile with scheduler role
   // update doc in users collection (profiles field)
   // return the whole profile doc in an array  (IProfile[]) with the scheduler's profile if newly created
 });
 
 //export this router to use in our index.js
 module.exports = router;