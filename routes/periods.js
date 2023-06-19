let express = require('express');
let router = express.Router();
const Period = require('../models/period');
const Dpl = require('../models/dpl');
const Orchestra = require('../models/orchestra');

const { writeOperation } = require('../my_modules/orch-lock');
const { DateTime } = require("luxon");

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
      //if ( periodDocs[i].isOpenEnd ) {
         let lastDpl = await Dpl.find( {
            o: req.authData.o,
            s: req.authData.s,
            p: periodDocs[i]._id
         } ).sort('-weekBegin').limit(1).select('weekBegin');         
         resp[resp.length - 1].lastDplBegin = lastDpl[0]?.weekBegin.getTime();
      //}
    }
    console.log(resp);
    res.send(resp);
 });

 async function deletePeriod(session, params) {    
   // params.o, params. sec, params.pId
   // check if period contains any dpls - if yes, abort
   let dplDoc = await Dpl.findOne({
      o: params.o,
      s: params.sec,
      p: params.pId
   }).session(session);
   if ( dplDoc ) return false;

   let periodDoc = await Period.findById(params.pId).session(session);
   let nextPBegin = periodDoc.nextPBegin;
   let nextP = periodDoc.nextP;
   // delete period doc from collection
   //await periodDoc.deleteOne(); // ??
   await Period.findByIdAndRemove(params.pId).session(session);
   
   // set last period's isOpenEnd and nextPBegin, nextP (id) fields
   let lastPeriodDoc = await Period.findOne({
      next: params.pId
   }).session(session);
   console.log("Last Period:", lastPeriodDoc);
   if ( lastPeriodDoc ) {
      lastPeriodDoc.nextP = nextP;
      lastPeriodDoc.nextPBegin = nextPBegin;
      lastPeriodDoc.isOpenEnd = !nextP;
      await lastPeriodDoc.save();
   }
   
   return true;
 }

 router.delete('/:pId', async function(req, res) {    
   console.log( `Deleting period ${req.params.pId}...` );   
   let result = await writeOperation( req.authData.o, deletePeriod, {        
       o: req.authData.o,  
       sec: req.authData.s,              
       pId: req.params.pId       
    });    
    if (result) res.status(202).send({
      success: true,
      content: 'Successfully removed period with id...'
    }); else res.status(400).send({
      success: false,
      reason: 'Failed to remove period'
    });
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
   // create period with date, comment and group;
   // check if operation is allowed 
   // update other periods' nextPBegin and isOpenEnd
   // return new Period
   console.log('Creating new period... params:');
   console.log(params);
   //let dtBegin = new Date(params.begin*1000);
   // must be a monday! get last monday for this date
   let orchDoc = await Orchestra.findById(params.o);
   let dtBegin = DateTime.fromMillis(params.begin*1000, {zone: orchDoc.timezone }).startOf('week').toJSDate();   
   
   let nextPeriodDoc = await Period.find({
      o: params.o,
      s: params.sec,
      begin: { '$gt': dtBegin }
   }).session(session).sort({begin: 'asc'}).limit(1);
   /*let nextPeriodDoc = await Period
   .find({
      o: params.o,
      s: params.sec      
   }).session(session).where('begin').gt(dtBegin)
   .sort('begin').limit(1);*/
   
   let lastPeriodDoc = await Period.find({
      o: params.o,
      s: params.sec,
      begin: { '$lt': dtBegin }
   }).session(session).sort({begin: 'desc'}).limit(1);
   /*let lastPeriodDoc = await Period
   .find({
      o: params.o,
      s: params.sec,
   }).session(session).where('begin').lt(dtBegin)
   .sort('-begin').limit(1);*/
   console.log(lastPeriodDoc);

   if ( lastPeriodDoc.length ) {
      // get last dpl of this last period
      let lastDplDoc = await Dpl.find({
         o: params.o,
         s: params.sec,
         p: String(lastPeriodDoc[0]._id)
      }).session(session).sort('-weekBegin').limit(1);
      console.log(params.o, params.sec, lastPeriodDoc[0]._id);
      console.log('Last Dpl for this period:', lastDplDoc[0]);
      if ( lastDplDoc.length && lastDplDoc[0].weekBegin.getTime() >= dtBegin.getTime() ) {
         // operation not allowed, abort:
         return false;
      }
   }   
   
   const newPeriod = new Period( {
      o: params.o,
      s: params.sec,
      begin: dtBegin,
      next: nextPeriodDoc.length ? nextPeriodDoc[0]._id : undefined,
      nextPBegin: nextPeriodDoc.length ? dtBegin : undefined,
      isOpenEnd: !nextPeriodDoc.length,      
      comment: params.comment,
      members: params.group
   });
   await newPeriod.save( { session: session } );

   if ( lastPeriodDoc.length ) {
      lastPeriodDoc[0].isOpenEnd = false;
      lastPeriodDoc[0].nextPBegin = dtBegin;
      lastPeriodDoc[0].next = newPeriod._id;
      await lastPeriodDoc[0].save();   
   }

   await newPeriod.populate('members.prof', 'userSn userFn userBirthday user');
   // for all members populate profile: userSn, userFn, userBirthday, user (id)
   
   return {
      ...newPeriod.toJSON(),
      countDpl: 0
   };
}
 
router.post('/', async function(req, res) {   
   try {
      let result = await writeOperation( req.authData.o, createPeriod, {      
         o: req.authData.o,       
         sec: req.authData.s,
         begin: req.body.begin,
         comment: req.body.comment,
         group: req.body.group.map( (m, index) => {
            return {
               ...m,
               factor: 1,
               row: index,
               prof: req.body.profileIds[index]
            }
         })
      });      
      console.log(`Period created, result of write operation: ${result}`); 
      console.log(result);
      console.log(result.members);
      if ( !result ) res.status(409).send({
         success: false,
         reason: "Fehler"
      }); else res.json( { 
         success: true,
         content: result 
      } );     
   }  catch (err) {
      res.status(409).send({
         success: false,
         reason: err
      });
   }
});

 async function editPeriodMember(session, params) {        
   let period = await Period.findById( params.pId ).session(session);
   period.members[params.row].canWish = params.memberData.canWish;
   period.members[params.row].canComment = params.memberData.canComment;
   period.members[params.row].initial = params.memberData.initial;
   // TODO check if initial is unique in the group
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
         reason: err
      });
   }
   
 });
 
 //export this router to use in our index.js
 module.exports = router;