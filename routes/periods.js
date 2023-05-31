let express = require('express');
let router = express.Router();
const Period = require('../models/period');
const Dpl = require('../models/dpl');

const { writeOperation } = require('../my_modules/orch-lock');

/*****
 * Only for schedulers
 */

/*********
 * List all periods for an orchestra section
 * jwt token's orchestra and section will be taken
 */
router.get('/', async function(req, res) {        
    let periodDocs = await Period.find( { 
        o: req.authData.o,
        s: req.authData.s } ).sort('begin').select('-o -s -next')        
        .populate( {
            path: 'members.prof',
            select: 'userFn userSn userBirthday user'            
    } );
    let resp = [];

    for ( let i = 0; i < periodDocs.length; i++ ) {
      let c =  await Dpl.countDocuments( {
         o: req.authData.o,
         s: req.authData.s,
         p: periodDocs[i]._id
      });      
      resp.push({
         ...periodDocs[i].toJSON(),
         countDpl: c
      } );
      if ( periodDocs[i].isOpenEnd ) {
         let lastDpl = await Dpl.find( {
            o: req.authData.o,
            s: req.authData.s,
            p: periodDocs[i]._id
         } ).sort('-weekBegin').limit(1).select('weekBegin');         
         resp[resp.length - 1].lastDplBegin = lastDpl[0].weekBegin.getTime();
      }
    }
    console.log(resp);
    res.send(resp);
 });

 async function deletePeriod(session, params) {    
   // params.o, params. sec, params.pId
   // TODO check if period contains any dpls - if yes, abort
   // TODO delete period from collection
   // TODO set other periods' isOpenEnd and nextPBegin fields
   return true;
 }

 router.delete('/:pId', async function(req, res) {    
   console.log( `Deleting period ${req.params.pId}...` );   
   let result = await writeOperation( req.authData.o, deletePeriod, {        
       o: req.authData.o,  
       sec: req.authData.s,              
       pId: req.params.pId       
    });             

   res.json( result );
});

async function replacePeriodComment(session, params) {     
   await Period.findByIdAndUpdate( params.pId, {
      comment: params.newComment
   }).session(session);
   return params.newComment;
}

router.patch('/:pId', async function(req, res) {       
   // edit period's general comment
   // set to req.body.value (if req.body.path: 'comment', req.body.op: 'replace')
   if (req.body.path == 'comment' && req.body.op == 'replace') {
      let result = await writeOperation( req.authData.o, replacePeriodComment, {      
         //o: req.authData.o,       
         pId: req.params.pId,      
         //sec: req.authData.s,
         newComment: req.body.value
      });      
      console.log(`Comment changed: ${result}`);  
      res.json( {
         success: true,
         content: result
      } );  
   } else {
     res.status(404); // Bad request
   }      
});


async function createPeriod(session, params) {     
   // TODO create period with date, comment and group; 
   // check if operation is allowed; 
   // update other periods' nextPBegin and isOpenEnd
   // return new Period
   return true;
}
 
 router.post('/', async function(req, res) {
   //TODO    
    console.log(req.body);
    let result = await writeOperation( req.authData.o, createPeriod, {      
      o: req.authData.o,       
      sec: req.authData.s/*, TODO other params from req.body*/
   });      
   console.log(`Period created: ${result}`);      
       
   res.json( { success: false,
      reason: "Not yet implemented" } );     
 });

 async function editPeriodMember(session, params) {        
   let period = await Period.findById( params.pId ).session(session);
   period.members[params.row].canWish = params.memberData.canWish;
   period.members[params.row].canComment = params.memberData.canComment;
   period.members[params.row].initial = params.memberData.initial;
   // tODO check if initial is unique in the group
   period.members[params.row].start = params.memberData.start;
   if (params.memberData.comment) period.members[params.row].comment = params.memberData.comment;
   await period.save();   
   return true;
 }

 router.put('/:pId/:row', async function(req, res) {       
   // edit row-th member in pId period
   console.log(req.params.pId, req.params.row, req.body.member);
   try {
      let result = await writeOperation( req.authData.o, editPeriodMember, {      
         o: req.authData.o, 
         pId: req.params.pId,      
         row: req.params.row,
         sec: req.authData.s,
         memberData: req.body.member
      });      
      console.log(`Period member edited: ${result}`);                   
      res.json( {
         success: true,
         content: req.body.member
      } );        
   } catch(err) {
      res.status(409).send({
         success: false,
         reason: 'Konflikt'
      });
   }
   
 });
 
 //export this router to use in our index.js
 module.exports = router;