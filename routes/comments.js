const path = require('node:path');
let express = require('express');
let router = express.Router();

const nodemailer = require('nodemailer');
const Email = require('email-templates');

const { writeOperation } = require('../my_modules/orch-lock');
const mongoose = require('mongoose');
const Orchestra = require('../models/orchestra');
const Dpl = require('../models/dpl');
const Profile = require('../models/profile');
const User = require('../models/user');
const DplMeta = require('../models/dplmeta');

const { DateTime } = require("luxon");

function abbrev(message, length) {
    return message.substring(0, Math.min(length,message.length))
    + (message.length > length ? '...' : '');
}

const transporter = nodemailer.createTransport({                
    host: process.env.MAIL_HOST,                        
    port: process.env.MAIL_PORT,

    secure: false, // upgrade later with STARTTLS
    auth: {                          
      user: process.env.MAIL_USER,                          
      pass: process.env.MAIL_PASS
    },
    tls:{
        rejectUnauthorized:false  // if on local
    }
});

const email = new Email({
    message: { from: '"Orchesterdienstplan" no-reply@odp.bicsak.net' },
    // uncomment below to send emails in development/test env:
    //send: true,
    transport: transporter,
    /* attachment for every e-mail globally */
    /*attachments: [{
        filename: 'favicon-32x32.png',
        path: '../favicon-32x32.png',
        cid: 'logo' //same cid value as in the html img src
    }]*/
});     


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
        noEmail: params.noEmail,
        row: row
    };
    meta.comments.push( comment )
    await meta.save();

    let dtBegin = DateTime.fromJSDate(meta.dpl.weekBegin, {zone: orchestraDoc.timezone});
    let dtEnd = dtBegin.plus({day: 7});

    if ( !params.noEmail ) {
        // Send emails
        // Step 1: get scheduler's profile id (from profiles collection)
        let schedulerProfDoc = await Profile.findOne({
            o: params.o,
            sec: params.sec,
            role: 'scheduler',
            'notifications.commentNew': true
        }).session(session);
        // Step 2: get all profile docs whith ids for the group (dplMeta's periodmembers array) and scheduler where userId field not equal to comment's author's userId and commentnotification is true
        let profiles = await Profile.find({
            o: params.o,
            sec: params.sec,
            _id: { $in: meta.periodMembers.map( m => m.prof).concat(schedulerProfDoc?._id) },
            user: { $ne: params.user },
            'notifications.commentNew' : true
        }).session(session);        
        
        //Step 3: send emails in loop for all profiles in the list
        for ( let i = 0; i < profiles.length; i++ ) {                
            email.send({
                template: 'commentnew',
                message: { 
                    to: `"${profiles[i].userFn} ${profiles[i].userSn}" ${profiles[i].email}`, 
                    attachments: [{
                        filename: 'favicon-32x32.png',
                        path: path.join(__dirname, '..') + '/favicon-32x32.png',
                        cid: 'logo' //same cid value as in the html img src
                    }]
                },
                locals: {
                    name: profiles[i].userFn, // recipient of e-mail ('Cornelia')
                    link: `${params.origin}/${profiles[i].role == 'scheduler' ? 'scheduler' : 'musician'}/week?profId=${profiles[i]._id}&mts=${dtBegin.toSeconds()}`,                                
                    author: params.role == 'scheduler' ? 'Dein/e DiensteinteilerIn' : `${userDoc.fn} ${userDoc.sn}`,
                    instrument: orchestraDoc.sections.get(params.sec).name,
                    kw: dtBegin.toFormat("W"),
                    period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`, //TODO        
                    comment: params.message, 
                    orchestra: orchestraDoc.code,
                    orchestraFull: orchestraDoc.fullName,
                    scheduler: profiles[i].role == 'scheduler',
                    rowAuthor: row                
                }
            })/*.then(console.log)*/.catch(console.error);
        }   
    } 


    comment.timestamp = comment.timestamp.getTime();        
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
        origin: req.get('origin'),
        message: req.body.message, 
        noEmail: req.body.noEmail,
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