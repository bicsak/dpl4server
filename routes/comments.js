let express = require('express');
let router = express.Router();

const { writeOperation } = require('../my_modules/orch-lock');
const mongoose = require('mongoose');
const Orchestra = require('../models/orchestra');
const Dpl = require('../models/dpl');
const User = require('../models/user');
const DplMeta = require('../models/dplmeta');

const { DateTime } = require("luxon");

function abbrev(message, length) {
    return message.substring(0, Math.min(length,message.length))
    + (message.length > length ? '...' : '');
}

/***********
 * Handles following cases
 * 
 * for members of the group or scheduler
 * delete comment DEL (only by author or scheduler)
 * create comment POST 
 * react to a comment (only members)
 */

// orchestra and section data comes from req.authData.o, req.authData.s
router.get('/:dplId', async function(req, res) {
    // check if scheduler's profile or 
    // member and req.authData.p profile is in members' array for this dpl's period
    let meta = await DplMeta.findOne({
        o: req.authData.o,
        dpl: req.params.dplId
    });
    //console.log(meta);
    //console.log( meta.toJSON().comments );
    res.json( meta.toJSON().comments );
 });

 async function deleteComment(session, params, createEvent) {    
    // check if scheduler's profile or 
    // member and req.authData.p profile is in members' array for this dpl's period
    console.log(`deleting comment dpl: ${params.dpl}, sec: ${params.sec}, o: ${params.o}`);
    let orchestraDoc = await Orchestra.findById(params.o).session(session);                      
    let meta = await DplMeta.findOne({
        o: params.o,
        dpl: params.dpl,
        sec: params.sec
    }).populate('dpl').session(session);

    if ( !meta ) return {
        success: false,
        reason: 'No such dpl'
    };
    console.log(meta);
    let cIndex = meta.comments.findIndex( c => c._id == params.cId );
    if ( cIndex == -1 ) return {
        success: false,
        reason: 'No comment with the specified id'
    };
    if ( params.role == 'musician' ) {
        let member = meta.periodMembers.find( pm => pm.prof == params.prof);
        if ( meta.closed || !member || !meta.periodMembers[member.row].canComment) return {
            success: false,
            reason: 'Commenting not allowed'
        };        
    } else if ( params.role != 'scheduler' ) return {
        success: false,
        reason: 'Not authorized'
    }     
    let commentData = {
        fn: meta.comments[cIndex].userFn,
        sn: meta.comments[cIndex].userSn,
        //message: abbrev(meta.comments[cIndex].message, 20)
        ts: DateTime.fromJSDate(meta.comments[cIndex].timestamp, {zone: orchestraDoc.timezone})
    };
    //meta.comments.splice(cIndex, 1);
    meta.comments[cIndex].deleted = true;
    await meta.save();
    
    let dtBegin = DateTime.fromJSDate(meta.dpl.weekBegin, {zone: orchestraDoc.timezone});
    await createEvent( {        
        weekBegin: meta.dpl.weekBegin, 
        sec: params.sec, 
        profiles: meta.dpl.periodMembers, 
        entity: "comment", action: "del", 
        extra: `Zur Woche ${dtBegin.toFormat("kkkk 'KW' W")} von ${commentData.fn} ${commentData.sn} ${commentData.ts.toFormat('dd.MM.yyyy HH:mm')}`, 
        user: params.prof
     });
    
    return {
        success:true
    };
 }

 router.delete('/:dplId/:commentId', async function(req, res) {    
    console.log( `Deleting ${req.params.dplId}/${req.params.commentId}...` );    

    let result = await writeOperation( req.authData.o, deleteComment, {        
        o: req.authData.o, 
        prof: req.authData.pid,
        role: req.authData.r,
        dpl: req.params.dplId,
        cId: req.params.commentId,
        sec: req.authData.s        
     });             

    res.json( result );
 });

 async function createComment(session, params, createEvent) {    
    console.log(`Role: ${params.role}, prof: ${params.prof}`);        
    let orchestraDoc = await Orchestra.findById(params.o).session(session);                      
    let meta = await DplMeta.findOne({
        o: params.o,
        dpl: params.dpl,
        sec: params.sec
    }).populate('dpl').session(session);
    let userDoc = await User.findById(params.user).session(session);
    if ( !meta || !userDoc ) return {
        success: false,
        reason: 'No such dpl or user'
    };    

    let row = -1;
    if ( params.role == 'musician' ) {
        let member = meta.periodMembers.find( pm => pm.prof == params.prof);
        if ( meta.closed || !member || !meta.periodMembers[member.row].canComment) return {
            success: false,
            reason: 'Commenting not allowed'
        };
        else row = member.row;
    } else if ( params.role != 'scheduler' ) return {
        success: false,
        reason: 'Not authorized'
    }                

    let comment = {
        _id: new mongoose.Types.ObjectId(),
        message: params.message,
        prof: params.prof,
        user: params.user,
        userFn: userDoc.fn,
        userSn: userDoc.sn,
        feedback: Array(meta.periodMembers.length).fill(0),
        timestamp: new Date(),
        deleted: false,
        row: row
    };
    meta.comments.push( comment )
    await meta.save();
    comment.timestamp = comment.timestamp.getTime();    
    let dtBegin = DateTime.fromJSDate(meta.dpl.weekBegin, {zone: orchestraDoc.timezone});
    await createEvent({
        weekBegin: meta.dpl.weekBegin, 
        sec: meta.dpl.s, profiles: meta.dpl.periodMembers, entity: "comment", action: "new", 
        extra: `Zur Woche ${dtBegin.toFormat("kkkk 'KW' W")} Von ${userDoc.fn} ${userDoc.sn}: ${abbrev(params.message, 20)}`, 
        user: params.prof
     });
    return {
        success: true,
        comment: comment
    };    
 }

 router.post('/:dplId', async function(req, res) {      
    let result = await writeOperation( req.authData.o, createComment, {
        message: req.body.message, 
        o: req.authData.o, 
        prof: req.authData.pid,
        user: req.authData.user,
        role: req.authData.r,
        dpl: req.params.dplId,
        sec: req.authData.s
     });           
         
     res.json( result );     
 });

 async function reactToComment(session, params, createEvent) {  
    let meta = await DplMeta.findOne({
        o: params.o,
        dpl: params.dpl,
        sec: params.sec
    }).populate('dpl').session(session);
    if ( !meta ) return {
        success: false,
        reason: 'No such dpl'
    };
    let orchestraDoc = await Orchestra.findById(params.o).session(session);                      
    
    let row = -1;
    if ( params.role == 'musician' ) {
        let member = meta.periodMembers.find( pm => pm.prof == params.prof);
        if ( meta.closed || !member || !meta.periodMembers[member.row].canComment) return {
            success: false,
            reason: 'Editing not allowed'
        };
        else row = member.row;
    } else return {
        success: false,
        reason: 'Reaction only for group members'
    }     

    let cIndex = meta.comments.findIndex( c => c._id == params.cId);
    if ( row != params.row || cIndex == -1 ) return {
        success: false,
        reason: 'Bad request'
    }
    meta.comments[cIndex].feedback[row] = params.value;
    await meta.save();
    let dtBegin = DateTime.fromJSDate(meta.dpl.weekBegin, {zone: orchestraDoc.timezone});
    await createEvent({
        weekBegin: meta.dpl.weekBegin,
        sec: meta.dpl.s, 
        profiles: meta.dpl.periodMembers, 
        entity: 'comment', 
        action: 'edit', 
        extra: `Woche: ${dtBegin.weekYear} KW ${dtBegin.weekNumber} Reaktion auf Nachricht von ${meta.comments[cIndex].userFn} ${meta.comments[cIndex].userSn}`,
        user: params.prof
     } );

    return {
        success: true,
        content: params.value
    };
 }

 router.patch('/:dplId/:cId', async function(req, res) {       
    if (req.body.path == 'feedback' && req.body.op == 'replace') {
        console.log( `Modifying reaction to comment ${req.params.dplId}/${req.params.cId}`);
        let result = await writeOperation( req.authData.o, reactToComment, {
            row: req.body.row, 
            value: req.body.value,
            o: req.authData.o, 
            prof: req.authData.pid,
            role: req.authData.r,
            dpl: req.params.dplId,
            cId: req.params.cId,
            sec: req.authData.s
         });      
         console.log(`Feedback changed: ${result}`);  
         res.json( result );  
    } else {
        res.status(404); // Bad request
    }        
 });


//export this router to use in our index.js
module.exports = router;