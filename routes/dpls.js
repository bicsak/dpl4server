const path = require('node:path');
let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );

const nodemailer = require('nodemailer');
const Email = require('email-templates');

const { writeOperation } = require('../my_modules/orch-lock');
const { createWeekDataRaw } = require('../my_modules/week-data-raw');
const PDFCreator = require('../my_modules/pdfcreator');

const Orchestra = require('../models/orchestra');
const Profile = require('../models/profile');
const Week = require('../models/week');
const Dpl = require('../models/dpl');
const Dplmeta = require('../models/dplmeta');
const { DateTime } = require('luxon');

const transporter = nodemailer.createTransport({                
   host: process.env.MAIL_HOST,                        
   port: process.env.MAIL_PORT,

   secure: false, 
   auth: {                          
     user: process.env.MAIL_USER,                          
     pass: process.env.MAIL_PASS
   },
   tls:{
       rejectUnauthorized:false  // if on local
   },
   dkim: {
      domainName: "odp.bicsak.net",
      keySelector: "default",
      privateKey: "-----BEGIN PRIVATE KEY-----\nMIICXAIBAAKBgQC40ANDOghp0pyEFI3I3QoP/bAE76is2reGGXCNGYZCOHT2kr8EP9plD5TcJVKSC5+3CieGJUFalNnZDUmBXweDdC7V4ACvand1IOlTogCs4Ncmkp85QcFySusKsRjp6BsRd97l8Bv/s8XsVR13TI5L62umB7A19l262pFn3C6nUwIDAQABAoGAKEN5Un4kMxnla4km0qoFdTJp1Ml50B7eeOK1+Kek7mxqXwXdg8l9hSL95XBkKtlJdJFLxxf6wwdG5tjUONFBS2z7QXbsmgbfurW7by5jnDi+9F4aHCw12Yq4MD1jqV90agFC8h49yKlUePtW1YbUH+LaG06CFAk4Xrv1CgmEqyECQQDy7iROD73LIUBe2tcaiawo5ZTMvez17DsXj2op0Sddt2TEvVedPudkxNWfYv+cXlKwRhCIWBwSlKiXxrffbEc5AkEAwsFrtnsOmy5yDSS9HXNMYBpbf7HZ5ivSB/kRfjWsUtjWOw6Pxctvmy9gp78dHRALwLkbRxeCN54KeTr2lZ126wJANANpIo2cRXHJJoYUqEnx4o/FXFEN+1mpDVJXmLx/gUFTAgzIRZLCWIEMfCPmNsS7T6Kwx4CWAiRyNI0HsX6tgQJAaAJUPAhMLKQJVOuh8/B3gXuSEggxjrMoYAmsRfL0LOqQvslwDvouiHos7GksazD+ldZFsxni+UD15viOaCjIMQJBALFZSKMgT0L6U+COa3QuVAgcUFfVMiTyY4SOCmyXFBCcE4TZgmjsf7AdGtH/wjrq5mow/LTgUAuDSbtTxunNLi4=\n-----END RSA PRIVATE KEY-----"
    }
});

const email = new Email({
   message: { from: '"Orchesterdienstplan" admin@odp.bicsak.net' },
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
 * only for scheduler: 
 * create dpl POST
 * edit dpl (seatings with extern, scheduler's comment, absent and seating array) POST
 * edit dpl's remark by scheduler PATCH
 * edit dpl's dz corrections
 * TODO edit dpl status (close/publish etc.) PATCH
 * 
 * for members:
 * edit fw/dw by members PATCH
 */

async function countFw(orchId, section, periodId, seasonId, memberIndex) {
   // sum of fw's for this member in season and (piece of) period                 
   let result = await Dpl.aggregate( [
      { '$match': {
         'o': mongoose.Types.ObjectId(orchId), 
         's': section,
         'p': mongoose.Types.ObjectId(periodId), 
         'weekSeason': mongoose.Types.ObjectId(seasonId) 
      } }, 
      { '$unwind': { 'path': '$absent' } }, 
      { '$unwind': { 'path': '$absent', 'includeArrayIndex': 'member' } }, 
      { '$match': { 'member': memberIndex, 'absent': 4 } }, 
      { '$count': 'countFw' }
   ] ); 
   console.log('Hiba: ', result)  ;
   return result.length ? result[0].countFw : 0;
}

// Freiwunsch, Dienstwunsch eintragen/löschen
async function editFwDw( session, params, createEvent ) {
   let returnVal;    

   let orch = await Orchestra.findById(params.o).session(session);
   let tz = orch.timezone;
      
   // check if dpl's monday is in the future)
   if ( params.begin <= Date.now() ) return { 
      success: false, 
      reason: 'Keine Bearbeitung mehr möglich'
   };
   
   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.begin,
      weekEditable: true,
      closed: false
   } ).session(session).populate('p').populate('weekSeason');   
     
   if ( !affectedDpl ) return { 
      success: false, 
      reason: 'Dienstplan existiert nicht, abgeschlossen oder Woche nicht zum Einteilen freigegeben'
   };

   if ( affectedDpl.version > params.ver ) return { 
      success: false, 
      reason: 'Es gibt eine neuere Fassung vom Dienstplan. Bitte aktualisiere deine Ansicht'
   };

   let lxBegin = DateTime.fromJSDate(affectedDpl.weekBegin, {zone: tz});
      
   let row = affectedDpl.p.members.findIndex( mem => mem.prof == params.prof );
   if ( row == -1 || !affectedDpl.p.members[row].canWish ) return { 
      success: false, 
      reason: 'Nicht berechtigt'
   };

   if ( params.dw ) {       
      // ********* Dienstwunsch *************
      /*let updateOpt = {};
      updateOpt[`seatings.$.available.${params.mi}`] = !params.erase;
      await Dpl.updateOne( { 
         o: params.o,
         s: params.sec,
         weekBegin: params.begin,                  
         "seatings.d": params.did
      }, { $set: updateOpt } , { session: session  } );*/      
      let seatingIndex = affectedDpl.seatings.findIndex( s => s.d == params.did );
      //console.log('dienst begin ts',  affectedDpl.seatings[seatingIndex].dienstBegin.getTime());
      let dt = DateTime.fromMillis(
         affectedDpl.seatings[seatingIndex].dienstBegin.getTime(), 
         { zone: tz } );            
      //console.log('Ittvagyok', dt);
      //console.log('Ittvagyok', affectedDpl.seatings[seatingIndex].dienstBegin);
      let ind = dt.weekday - 1;
      let pmOffset = dt.hour >= 12 ? 1 : 0;                      
      if ( seatingIndex < 0 || 
         affectedDpl.seatings[seatingIndex].sp[params.mi] != 0 || 
         affectedDpl.absent[ind * 2 + pmOffset][params.mi] != 0 ) returnVal = { 
         success: false, reason: 'Eintragen nicht möglich'
      }; else {
         affectedDpl.seatings[seatingIndex].available[params.mi] = !params.erase;
         affectedDpl.version = affectedDpl.version + 1;
         affectedDpl.state = new Date();
         await affectedDpl.save();
         returnVal = { 
            success: true,
            ver: affectedDpl.version,
            state: affectedDpl.state.getTime()
          };
      } 
      await createEvent({
         weekBegin: affectedDpl.weekBegin,
         sec: params.sec, 
         profiles: affectedDpl.periodMembers, 
         entity: 'dpl', 
         action: 'edit', 
         extra: `${lxBegin.toFormat("kkkk 'KW' W")}: Dienstwunsch gelöscht/eingetragen ${dt.toFormat('dd.MM.yyyy HH:mm')}, ${affectedDpl.p.members[row].initial}`,
         user: params.user
      });     
   } else {  
      // *********** Freiwunsch **************           
      let numberOfWeeks = 0;
      let maxFW = orch.sections.get(params.sec).maxFW;
      if ( !params.erase ) { 
         // ****** Add FW *********                                       
         // calculate max fw for this season (section)
         let extraCriteria = {}; let hasExtraCrit = false;
         if ( !affectedDpl.p.isOpenEnd && affectedDpl.p.nextPBegin.getTime() < affectedDpl.weekSeason.end.getTime() ) {           
            extraCriteria['$lte'] = affectedDpl.p.nextPBegin.getTime() ;
            hasExtraCrit = true;
         }
         if ( affectedDpl.p.begin.getTime() > affectedDpl.weekSeason.begin.getTime() ) {
            extraCriteria['$gte'] = affectedDpl.p.begin.getTime();
            hasExtraCrit = true;
         }
                  
         if ( hasExtraCrit) numberOfWeeks = await Week.countDocuments( {
            o: params.o,
            season: affectedDpl.weekSeason._id,
            begin: extraCriteria
         }); else numberOfWeeks = await Week.countDocuments( {
            o: params.o,
            season: affectedDpl.weekSeason._id
         });
        
         fwCount = await countFw(params.o, params.sec, affectedDpl.p._id, affectedDpl.weekSeason._id, params.mi);
         
          if ( numberOfWeeks * maxFW < fwCount + 1 ) return { 
            success: false, 
            reason: 'FW-Kontingent erschöpft'
         };
         
         console.log(fwCount);

         // check if all seatings in affectedDpl.seatings for params.col satisfies criteria
         // for all dienste that lies in this column: 
         // no available, no seatings[...].sp[...] and has enough collegues
         let unavailableCount = affectedDpl.absent[params.col].reduce(
            (prev, curr,i) => prev + (curr == 0 ? 0 : 1), 0            
         );         
         let groupSize = affectedDpl.p.members.length;         
         let colBegin = DateTime.fromMillis(affectedDpl.weekBegin.getTime(), {zone: tz})
         .plus( {days: Math.floor(params.col / 2), hours: params.col % 2 * 12} );
         let colEnd = colBegin.plus( {hours: 12} );         
         let isEditable = params.erase || affectedDpl.seatings.filter( 
            s => s.dienstBegin.getTime() >= colBegin.toMillis() && s.dienstBegin.getTime() < colEnd.toMillis()
         ).every( s => {
            //console.log(`Unavailable count: ${unavailableCount}, gr size: ${groupSize}`);
            //console.log(`Observing ${s}`);
            if ( groupSize + s.ext - unavailableCount - s.dienstInstr - s.sp.filter( v => v >= 64 ).length <= 0 ) return false;
            return s.available[params.mi] == 0 && s.sp[params.mi] == 0;               
            }
         );
         console.log('isEditable', isEditable);
         // and no fw/fw is marked
         if ( params.erase && affectedDpl.absent[params.col][params.mi] != 4 ||
            !params.erase && affectedDpl.absent[params.col][params.mi] != 0 ||
            !isEditable ) return {
               success: false, 
               reason: 'Eintragen nicht möglich'
         };
      }
      let updateOpt = {};
      updateOpt[`absent.${params.col}.${params.mi}`] = params.erase ? 0 : 4;
      updateOpt.version = affectedDpl.version + 1;
      updateOpt.state = new Date();
      await Dpl.updateOne( { 
         o: params.o,
         s: params.sec,
         weekBegin: params.begin         
      }, updateOpt, { session: session  } ); 
      /*affectedDpl.absent[params.col][params.mi] = params.erase ? 0 : 4;
      console.log(affectedDpl);  
      mongoose.set('debug', true);
      await affectedDpl.save();*/
      returnVal = { 
         success: true, 
         fwCount: params.erase ? undefined : fwCount + 1,
         maxFw: params.erase ? undefined : numberOfWeeks * maxFW,
         ver: updateOpt.version,
         state: updateOpt.state.getTime()
      };
      const daysAbbr = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      await createEvent({
         weekBegin: affectedDpl.weekBegin,
         sec: params.sec, 
         profiles: affectedDpl.periodMembers, 
         entity: 'dpl', 
         action: 'edit', 
         extra: `${lxBegin.toFormat("kkkk 'KW' W")}: Freiwunsch gelöscht/eingetragen, ${affectedDpl.p.members[row].initial} ${daysAbbr[Math.floor(params.col/2)]} ${params.col % 2 ? 'Vorm.' : 'Nachm.'}`,
         user: params.user
      });         
   }
   return returnVal; 
} // End of transaction function

// Updates dz begin in succeeding weeks' dpls
// after scheduler's editing dpl seating 
// deleting dpl
// or editing correction
async function recalcNumbersAfterEdit(session, o /* orchestra id*/, s /* section */, 
   begin /* modified week's monday as Date obj - succeeding weeks have weekBegin > begin */, 
   p /* period - modify only dpls for this period*/, correction) {
  
      let succedingDpls = await Dpl.find({
         o: o, s: s, p: p, weekBegin: {$gt: begin} }).session(session);
      for (let succ of succedingDpls) {         
         succ.start.forEach( (num, idx, arr) => arr[idx] = num - correction[idx]);      
         await  succ.save()    
      }      
}

async function editCorrection( session, params, createEvent) {
   //params: o, sec, begin, correction 
   
   let dpl = await Dpl.findOne( { o: params.o, weekBegin: params.begin,
      //weekEditable: true, // ???
      s: params.sec 
   }).session(session);
   if ( !dpl || dpl.version > params.ver ) {
      return false;
   }
   let oldCorrection = dpl.correction;
   dpl.correction = params.correction;
   dpl.state = new Date();
   dpl.version = dpl.version + 1;
   await dpl.save();
   // update dz begin in all succeeding weeks
   let difference = params.correction.map((val, index) => oldCorrection[index] - val);
   await recalcNumbersAfterEdit(session, 
      params.o, params.sec, params.begin, dpl.p, difference);
   let orchestraDoc = await Orchestra.findById(params.o).session(session);
   let lxBegin = DateTime.fromJSDate(dpl.weekBegin, {zone: orchestraDoc. timezone});
   await createEvent({
      weekBegin: dpl.weekBegin,
      sec: params.sec, 
      profiles: dpl.periodMembers, 
      entity: 'dpl', 
      action: 'edit', 
      extra: `Dienstzahlkorrekturen bearbeitet ${lxBegin.toFormat("kkkk 'KW' W")}`,
      user: params.user
   });

   return {
      ver: dpl.version,
      state: dpl.state
   };
}

async function editSchedulersRemark(session, params, createEvent) {
   /*let dplDoc = await Dpl.findOneAndUpdate( { 
      o: params.o,
      weekBegin: params.begin,
      s: params.sec
   }, { remark: params.remark }).session(session);*/
   let dplDoc = await Dpl.findOne( { 
      o: params.o,
      weekBegin: params.begin,
      s: params.sec
   }).session(session);
   if ( !dplDoc || dplDoc.version > params.ver ) {
      return false;
   }
   dplDoc.remark = params.remark;
   dplDoc.state = new Date(); dplDoc.version = dplDoc.version + 1;
   await dplDoc.save();

   let orchestraDoc = await Orchestra.findById(params.o).session(session);
   let lxBegin = DateTime.fromJSDate(dplDoc.weekBegin, {zone: orchestraDoc.timezone});   
   await createEvent({
      weekBegin: dplDoc.weekBegin,
      sec: params.sec, 
      profiles: dplDoc.periodMembers, 
      entity: 'dpl', 
      action: 'edit', 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name}: Kommentar des Diensteinteilers bearbeitet ${lxBegin.toFormat("kkkk 'KW' W")}`,
      user: params.user
   });
   return {ver: dplDoc.version, state: dplDoc.state};
}

async function voteSurvey(session, params, createEvent ) {
   //console.log('transaction fn voteSurvey');
   //console.log(params);
   let orchestraDoc = await Orchestra.findById(params.o).session(session);                      
   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.begin*1000,      
   } ).session(session).populate('p').populate('periodMembers');        
   if ( !affectedDpl || affectedDpl.version > params.ver ) return false;
   //console.log('Test', affectedDpl.version, params.ver);
   //console.log(affectedDpl.p.members);   
   console.log(affectedDpl);
   if ( params.office ) {
      // office approval procedure
      affectedDpl.officeSurvey.status = params.feedback == 'yes' ? 'confirmed' : 'refused';
      affectedDpl.officeSurvey.reason = params.message;
      affectedDpl.officeSurvey.timestamp = new Date();
      affectedDpl.officeSurvey.editedBy = params.user;

      //in weeks collection as well!
      let updateObj = {}; 
      updateObj[`dpls.${params.sec}.officeSurvey`] = affectedDpl.officeSurvey.status;      
      await Week.findOneAndUpdate({
         o: params.o, begin: params.begin
      }, updateObj).session(session);
   } else {
      // musician survey
      // get member index, save feedback[index]      
      let memberIndex = affectedDpl.periodMembers.findIndex( m => params.user == m._id);      
      affectedDpl.groupSurvey.feedbacks[memberIndex].vote = params.feedback;
      affectedDpl.groupSurvey.feedbacks[memberIndex].comment = params.message;
      affectedDpl.groupSurvey.feedbacks[memberIndex].timestamp = new Date();
   }   
   await affectedDpl.save();   
   /*await createEvent({
      weekBegin: affectedDpl.weekBegin, 
      sec: params.sec, 
      profiles: affectedDpl.periodMembers, 
      public: affectedDpl.published,
      entity: "survey", action: "edit", 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name}, ${dtBegin.toFormat("kkkk 'KW' W")}`, 
      user: params.user
   });*/
   //return affectedDpl.groupSurvey;   

   let dtBegin = DateTime.fromMillis(params.begin*1000, {zone: orchestraDoc.timezone});
   let dtEnd = dtBegin.plus({day: 7});
   if ( params.office ) {      
      console.log('send email to scheduler...');
      if ( params.feedback != 'yes' ) {
         // send email to scheduler about rejected dpl
         let profiles = await Profile.find({
            o: params.o,
            role: 'office',
            _id: { $ne: params.user  },
            'notifications.dplRejected': true
          }).session(session);
         profiles = profiles.concat(await Profile.findOne({
            o: params.o,
            role: 'scheduler',
            section: params.sec,
            'notifications.dplRejected': true
         }).session(session));
         for ( let i = 0; i < profiles.length; i++ ) {      
            email.send({
               template: 'dplrejected',
               message: { 
                  to: `"${profiles[i].userFn} ${profiles[i].userSn}" ${profiles[i].email}`, 
                  attachments: [{
                     filename: 'logo.png',
                     path: path.join(__dirname, '..') + '/favicon-32x32.png',
                     cid: 'logo'
                  }]
               },
               locals: {
                  scheduler: profiles[i].role == 'scheduler',
                  name: profiles[i].userFn,
                  link: `${params.origin}/${profiles[i].role}/week?profId=${profiles[i]._id}&mts=${params.begin}`,                                               
                  instrument: orchestraDoc.sections.get(params.sec).name,
                  kw: dtBegin.toFormat("W"),
                  period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`,        
                  reason: params.message, 
                  orchestra: orchestraDoc.code,
                  orchestraFull: orchestraDoc.fullName,                              
               }
            }).catch(console.error);
         }
      } else {
         // send email for all (scheduler, office, group members with notifications.dplFinal) with the final DPL incl. PDF      
         // create PDF version of DPL with pdfKit
         let weekDoc = await Week.findById(affectedDpl.w).session(session);
         let sectionName = orchestraDoc.sections.get(params.sec).name;
         let sectionAbbr = orchestraDoc.sections.get(params.sec).abbr;            
         PDFCreator.parseWeekData(orchestraDoc, weekDoc);
         PDFCreator.parseDpl(affectedDpl, sectionName, affectedDpl.periodMembers.map(
            pm => {
               return {
                  fn: pm.userFn,
                  sn: pm.userSn
               }
            }
         ) );
         let filename = PDFCreator.createPDF( );     
       let profiles = await Profile.find({
         o: params.o,
         role: 'office',
         'notifications.dplFinal': true
       }).session(session);
       profiles = profiles.concat(await Profile.find({
         o: params.o,
         section: params.sec,
         role: 'musician',
         _id: {
            $in: affectedDpl.periodMembers.map( pm => pm._id)
         },
         'notifications.dplFinal': true
       }).session(session), await Profile.find({
         o: params.o,
         section: params.sec,
         role: 'scheduler',
         'notifications.dplFinal': true
       }).session(session));       
       for ( let i = 0; i < profiles.length; i++) {         
         email.send({
            template: 'dplfinal',
            message: { 
               to: `"${profiles[i].userFn} ${profiles[i].userSn}" ${profiles[i].email}`, 
               attachments: [{
                  filename: 'logo.png',
                  path: path.join(__dirname, '..') + '/favicon-32x32.png',
                  cid: 'logo'
               }, {
                  filename: `dpl_${orchestraDoc.code}_${sectionAbbr}_${dtBegin.toFormat("yyyy_W")}.pdf`,
                  path: path.join(__dirname, '..', 'output') + `/${filename}`,
               }]
            },
            locals: { 
               name: profiles[i].userFn,               
               link: `${params.origin}/${profiles[i].role}/week?profId=${profiles[i]._id}&mts=${params.begin}`,                                               
               instrument: orchestraDoc.sections.get(params.sec).name,
               kw: dtBegin.toFormat("W"),
               period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`,        
               scheduler: profiles[i].role == 'scheduler',
               approved: true,
               orchestra: orchestraDoc.code,
               orchestraFull: orchestraDoc.fullName,                              
            }
         }).catch(console.error);
       }      
      }
   }
   if ( !params.office ) {      
      console.log('send email to scheduler...');
      if ( params.feedback != 'yes' ) {
         // send email to scheduler about rejected survey
         let schedulerProfile = await Profile.findOne({
            o: params.o,
            role: 'scheduler',
            section: params.sec,
            'notifications.surveyFailed': true
         }).session(session);
         if ( schedulerProfile ) { 
            let memberSubdoc = affectedDpl.periodMembers.find( p => p._id == params.user);
            let memberRow = affectedDpl.periodMembers.findIndex( p => p._id == params.user);
            email.send({
               template: 'surveydenied',
               message: { 
                  to: `"${schedulerProfile.userFn} ${schedulerProfile.userSn}" ${schedulerProfile.email}`, 
                  attachments: [{
                     filename: 'logo.png',
                     path: path.join(__dirname, '..') + '/favicon-32x32.png',
                     cid: 'logo'
                  }]
               },
               locals: {
                  link: `${params.origin}/scheduler/week?profId=${schedulerProfile._id}&mts=${params.begin}`,                                               
                  instrument: orchestraDoc.sections.get(params.sec).name,
                  kw: dtBegin.toFormat("W"),
                  period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`,
                  member: `${memberSubdoc.userFn} ${memberSubdoc.userSn}`,
                  rowMember: memberRow,
                  reason: params.message, 
                  orchestra: orchestraDoc.code,
                  orchestraFull: orchestraDoc.fullName,                              
               }
            }).catch(console.error);
         }
      }
      // check if survey is complete
      let count = affectedDpl.groupSurvey.feedbacks.filter( fb => fb.vote == 'pending').length;
      if ( !count ) {
         // if complete, send email to scheduler with template surveycomplete
         let schedulerProfile = await Profile.findOne({
            o: params.o,
            role: 'scheduler',
            section: params.sec,
            'notifications.surveyComplete': true
         }).session(session);
         if ( schedulerProfile ) {             
            email.send({
               template: 'surveycomplete',
               message: { 
                  to: `"${schedulerProfile.userFn} ${schedulerProfile.userSn}" ${schedulerProfile.email}`, 
                  attachments: [{
                     filename: 'logo.png',
                     path: path.join(__dirname, '..') + '/favicon-32x32.png',
                     cid: 'logo'
                  }]
               },
               locals: {
                  link: `${params.origin}/scheduler/week?profId=${schedulerProfile._id}&mts=${params.begin}`,                                               
                  instrument: orchestraDoc.sections.get(params.sec).name,
                  kw: dtBegin.toFormat("W"),
                  period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`,                  
                  orchestra: orchestraDoc.code,
                  orchestraFull: orchestraDoc.fullName,                              
               }
            }).catch(console.error);
         }
      }      
   }

   return {
      surveyAnswer: params.feedback,
      surveyComment: params.message
   };
}

async function editDplStatus(session, params, createEvent ) {
   // edit dpl status, also in weeks collection
   // delete group survey if new status != closed (dpl is not closed && !public, i.e. draft or public)
   // create office survey on publishing (changing state to public)
   // delete office survey on downgrading (state is no more public)
   let closed = false; let public = params.status == 'public';
   if ( params.status != 'draft' ) closed = true;

   let updateObj = {}; 
   updateObj[`dpls.${params.sec}.closed`] = closed;
   updateObj[`dpls.${params.sec}.published`] = public;
   let weekDoc = await Week.findOneAndUpdate( { 
      o: params.o,
      begin: params.begin,      
      editable: true
   }, updateObj).session(session);
   if ( !weekDoc ) return {
      statusCode: 400,
      body: 'Wochenplan nicht gefunden oder nicht editierbar'
   }
   let dplDoc = await Dpl.findOne( { 
      o: params.o,
      weekBegin: params.begin,
      s: params.sec
   }).session(session).populate('periodMembers');
   if ( dplDoc.version > params.ver ) return {
      statusCode: 409,
      body: 'Dienstplan nicht mehr aktuell. Aktualisiere bitte deine Ansicht!'
   }
   dplDoc.closed = closed; dplDoc.published = public;
   await dplDoc.save();
   let orchestraDoc = await Orchestra.findById(params.o).session(session);
   let lxBegin = DateTime.fromJSDate(dplDoc.weekBegin, {zone: orchestraDoc.timezone});   
   let lxEnd = lxBegin.plus({day: 7});
   if ( params.approve ) {
      dplDoc.officeSurvey = {
         timestamp: new Date(),
         status: 'pending',
         comment: params.message
      };
      await dplDoc.save();
      //in weeks collection as well
      updateObj = {}; 
      updateObj[`dpls.${params.sec}.officeSurvey`] = 'pending';      
      await Week.findOneAndUpdate({
         o: params.o, begin: params.begin
      }, updateObj).session(session);
      /* send emails for all office users */ 
      let officeProfiles = await Profile.find( {
         o: params.o,
         role: 'office',
         'notifications.approvalNew': true
      }).session(session);
      for ( let i = 0; i < officeProfiles.length; i++ ) {
         email.send({
            template: 'approvalnew',
            message: { 
               to: `"${officeProfiles[i].userFn} ${officeProfiles[i].userSn}" ${officeProfiles[i].email}`, 
               attachments: [{
                  filename: 'logo.png',
                  path: path.join(__dirname, '..') + '/favicon-32x32.png',
                  cid: 'logo'
               }]
            },
            locals: {
               name: officeProfiles[i].userFn,
               link: `${params.origin}/office/week?profId=${officeProfiles[i]._id}&mts=${params.begin}`,                                               
               instrument: orchestraDoc.sections.get(params.sec).name,
               kw: lxBegin.toFormat("W"),
               period: `${lxBegin.toFormat('dd.MM.yyyy')}-${lxEnd.toFormat('dd.MM.yyyy')}`,                              
               orchestra: orchestraDoc.code,
               orchestraFull: orchestraDoc.fullName,                              
            }
         }).catch(console.error);

      }
   }
   if ( params.status != 'public' ) {
      dplDoc.officeSurvey = null; await dplDoc.save();
      updateObj = {}; 
      updateObj[`dpls.${params.sec}.officeSurvey`] = null;      
      await Week.findOneAndUpdate({
         o: params.o, begin: params.begin
      }, updateObj).session(session);
   }
   if ( params.status != 'closed' ) {
      dplDoc.groupSurvey = null; await dplDoc.save();
   }

   if ( params.status == 'public' && !params.approve && !params.noEmail) {
       // send email for all (scheduler, office, groupe members with notifications.dplFinal) with the final DPL incl. PDF      
       
      // create PDF version of DPL with pdfKit
      let sectionName = orchestraDoc.sections.get(params.sec).name;
      let sectionAbbr = orchestraDoc.sections.get(params.sec).abbr;            
      PDFCreator.parseWeekData(orchestraDoc, weekDoc);
      PDFCreator.parseDpl(dplDoc, sectionName, dplDoc.periodMembers.map(
         pm => {
            return {
               fn: pm.userFn,
               sn: pm.userSn
            }
         }
      ) );
      let filename = PDFCreator.createPDF( );       

       let profiles = await Profile.find({
         o: params.o,
         role: 'office',
         'notifications.dplFinal': true
       }).session(session);
       profiles = profiles.concat(await Profile.find({
         o: params.o,
         section: params.sec,
         role: 'musician',
         _id: {
            $in: dplDoc.periodMembers.map(pm => pm._id)
         },
         'notifications.dplFinal': true
       }).session(session), await Profile.find({
         o: params.o,
         section: params.sec,
         role: 'scheduler',
         'notifications.dplFinal': true
       }).session(session));       
       for ( let i = 0; i < profiles.length; i++) {         
         email.send({
            template: 'dplfinal',
            message: { 
               to: `"${profiles[i].userFn} ${profiles[i].userSn}" ${profiles[i].email}`, 
               attachments: [{
                  filename: 'logo.png',
                  path: path.join(__dirname, '..') + '/favicon-32x32.png',
                  cid: 'logo'
               }, {
                  filename: `dpl_${orchestraDoc.code}_${sectionAbbr}_${lxBegin.toFormat("yyyy_W")}.pdf`,
                  path: path.join(__dirname, '..', 'output') + `/${filename}`,                  
               }]
            },
            locals: { 
               name: profiles[i].userFn, 
               link: `${params.origin}/${profiles[i].role}/week?profId=${profiles[i]._id}&mts=${params.begin}`,                                               
               instrument: orchestraDoc.sections.get(params.sec).name,
               kw: lxBegin.toFormat("W"),
               period: `${lxBegin.toFormat('dd.MM.yyyy')}-${lxEnd.toFormat('dd.MM.yyyy')}`,        
               scheduler: profiles[i].role == 'scheduler',
               approved: false,
               orchestra: orchestraDoc.code,
               orchestraFull: orchestraDoc.fullName,                              
            }
         }).catch(console.error);
       }
   }
   
   await createEvent({
      weekBegin: params.begin, 
      sec: params.sec, 
      profiles: [], 
      entity: 'dpl', 
      action: 'edit', 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name} ${lxBegin.toFormat("kkkk 'KW' W")}: Status geändert`,
      user: params.user
   });
   return true;
}

router.patch('/:mts', async function(req, res) {        
      if ( req.body.path === '/remark' ) {
         if (req.authData.r !== 'scheduler' ) { 
            res.sendStatus(401); 
            return; 
         }
         
         let result = await writeOperation( req.authData.o,
            editSchedulersRemark, {
               o: req.authData.o, sec: req.authData.s,
               user: req.authData.pid,
               begin: new Date(req.params.mts * 1000),                              
               remark: req.body.op == 'replace' ? req.body.value : null,
               ver: req.body.ver
         });                
         if ( result ) {
            if (req.body.op == 'replace') res.json( { 
               remark: req.body.value,
               ver: result.ver,
               state: result.state.getTime()
             } ); 
            else res.json( {                
               ver: result.ver,
               state: result.state.getTime()
             } );  
         } else res.status(404).send({
            message: 'DPL nicht gefunden oder neuere Version vorhanden. Bitte aktualisiere deine Seite!'});
         return;
          
      } else if (req.body.path === '/correction') { 
         console.log(`Editing dz correction`);
         let result = await writeOperation( req.authData.o,
            editCorrection, {
               o: req.authData.o, sec: req.authData.s,
               user: req.authData.pid,
               begin: new Date(req.params.mts * 1000),               
               correction: req.body.value,
               ver: req.body.ver
            });                        

         if ( result ) res.json( {success: true, correction: req.body.value, ver: result.ver, state: result.state.getTime()} );
         else res.status(404).send(
            { message: 'DPL nicht gefunden oder neuere Version vorhanden. Bitte aktualisiere deine Seite!' } );
         //TODO push-notifications
         return;                        
         
      } else if (req.body.path == '/status') {         
         if ( req.authData.r !== 'scheduler' ) { 
            res.sendStatus(401); 
            return; 
         }
         console.log('Editing dpl status by scheduler')

         try {
            let result = await writeOperation(req.authData.o, editDplStatus, {
               ...req.body.value,
               ver: req.body.ver,               
               o: req.authData.o, sec: req.authData.s, user: req.authData.pid,
               begin: new Date(req.params.mts * 1000), 
               origin: req.get('origin')                               
            });
            if ( result === true ) res.json(req.body.value);      // request accepted
            else res.status(result.statusCode).send( {message: result.body} ); 
         } catch (err) {
            res.status(400).send({message: `Problem during changing state`});            
         }    
         
      } else if (req.body.path == '/survey') {
         if ( req.body.op == 'new') {
            if ( req.authData.r !== 'scheduler' ) { 
               res.sendStatus(401); 
               return; 
            }
            // new group survey by scheduler
            console.log('creating survey...', req.body);            
            try {      
               let result = await writeOperation( req.authData.o, createSurvey, {      
                  o: req.authData.o,       
                  sec: req.authData.s,
                  begin: req.params.mts,
                  message: req.body.message,  
                  ver: req.body.ver,       
                  user: req.authData.pid,
                  userId: req.authData.user         
               });      
               console.log(`Survey created, result of write operation: ${result}`);       
               if ( !result ) res.status(409).send({message: 'DPL existiert nicht oder neuere Version vorhanden. Aktualisiere bitte deine Ansicht!'}); 
               else res.json( result );     
            }  catch (err) {
               console.log('some error:', err);
               res.status(409).send({message: err});
            }
         } else if ( req.body.op == 'del' ) {
            if ( req.authData.r !== 'scheduler' ) { 
               res.sendStatus(401); 
               return; 
            }
            // delete group survey
            console.log( `Deleting group survey ${req.params.mts}...` );   
            await writeOperation( req.authData.o, deleteSurvey, {        
               o: req.authData.o, 
               prof: req.authData.pid,
               role: req.authData.r,
               mts: req.params.mts,       
               sec: req.authData.s, 
               user: req.authData.pid       
            });                

         } else if ( req.body.op == 'edit' ) {
            /* vote for survey (yes/no+comment). 
            Musician (group survey, needs also row index) or office (approval)
            req.body.feedback ('yes'|'no'), req.body.message?
            req.params.mts, req.authData.r ...
            */
            console.log('saving feedback to survey...', req.body);            
            try {      
               let result = await writeOperation( req.authData.o, voteSurvey, {      
                  o: req.authData.o,       
                  sec: req.authData.r == 'office' ? req.body.sec : req.authData.s,
                  begin: req.params.mts,
                  feedback: req.body.feedback,
                  message: req.body.message,         
                  ver: req.body.ver,
                  user: req.authData.pid,
                  userId: req.authData.user,
                  office: req.authData.r == 'office',
                  origin: req.get('origin')       
               });      
               console.log(`Feedback saved, result of write operation: ${result}`);       
               if ( !result ) res.status(409).send({message: 'Dienstplan nicht gefunden oder neuere Version vorhanden. Aktualisiere bitte deine Ansicht!'}); 
               else res.json( result );     
            }  catch (err) {
               console.log('some error:', err);
               res.status(409).send( {message: err} );
            }           
         }         
      } else if (req.body.op == 'delwish' || req.body.op == 'newwish') {
         if ( req.authData.r !== 'musician' ) { 
            res.sendStatus(401); 
            return; 
         }
         if ( req.body.op == 'delwish') {
            if (req.body.did) {
               console.log(`Deleting + sign for member ${req.body.mi} column ${req.body.col}, did: ${req.body.did}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: true, dw: true,
                     did: req.body.did, mi: req.body.mi, ver: req.body.ver                     
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;               
            } else {               
               console.log(`Deleting fw member ${req.body.mi} for column ${req.body.col}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: true, dw: false,
                     col: req.body.col, mi: req.body.mi, ver: req.body.ver                                          
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;
            }
         } else {
            if ( req.body.did ) {               
               console.log(`Adding + sign member ${req.body.mi} for column ${req.body.col}, did: ${req.body.did}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: false, dw: true,
                     did: req.body.did, mi: req.body.mi, ver: req.body.ver                                          
                  });                        
      
               res.json(  result ); //TODO push-notifications
               return;
            } else {               
               console.log(`Adding fw member ${req.body.mi} for column ${req.body.col}`);
               let result = await writeOperation( req.authData.o,
                  editFwDw, {
                     o: req.authData.o, sec: req.authData.s, prof: req.authData.pid,
                     begin: new Date(req.params.mts * 1000),
                     erase: false, dw: false,
                     col: req.body.col, mi: req.body.mi, ver: req.body.ver                                          
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;
            }
         }         
      }   
});

async function createSurvey( session, params, createEvent ) {
   console.log('transaction fn createSurvey');
   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.begin*1000,      
   } ).session(session).populate('p').populate('periodMembers');        
   if ( !affectedDpl || affectedDpl.version > params.ver ) return false;
   console.log(affectedDpl.p.members);
   // create survey doc with fields of period.members (profile, row, inactive/pending, no comment, no  timestamp)
   affectedDpl.groupSurvey = {
      comment: params.message,
      feedbacks: affectedDpl.p.members.map( m => {
         return {
            row: m.row,
            member: m.prof,
            vote: affectedDpl.periodMembers[m.row].user == params.userId ? 'inactive' : 'pending'
         };
      })
   };
   console.log(affectedDpl.groupSurvey);
   await affectedDpl.save(); 

   let orchestraDoc = await Orchestra.findById(params.o).session(session);
   let lxBegin = DateTime.fromJSDate(affectedDpl.weekBegin, {zone: orchestraDoc.timezone});   
   let lxEnd = lxBegin.plus({day: 7});
   /* send emails for all members of the group except scheduler (if member) */ 
   let memberProfiles = await Profile.find( {
      o: params.o,
      role: 'musician',
      section: params.sec,
      'notifications.surveyNew': true,
      _id: {
         $in: affectedDpl.groupSurvey.feedbacks.filter(fb => fb.vote == 'pending').map( fb => fb.member)
      }
   }).session(session);
   for ( let i = 0; i < memberProfiles.length; i++ ) {
      email.send({
         template: 'surveynew',
         message: { 
            to: `"${memberProfiles[i].userFn} ${memberProfiles[i].userSn}" ${memberProfiles[i].email}`, 
            attachments: [{
               filename: 'logo.png',
               path: path.join(__dirname, '..') + '/favicon-32x32.png',
               cid: 'logo'
            }]
         },
         locals: {
            name: memberProfiles[i].userFn,
            link: `${params.origin}/musician/week?profId=${memberProfiles[i]._id}&mts=${params.begin}`,                                               
            instrument: orchestraDoc.sections.get(params.sec).name,
            kw: lxBegin.toFormat("W"),
            period: `${lxBegin.toFormat('dd.MM.yyyy')}-${lxEnd.toFormat('dd.MM.yyyy')}`,                              
            orchestra: orchestraDoc.code,
            orchestraFull: orchestraDoc.fullName,                              
         }
      }).catch(console.error);
   }

   /*await createEvent({
      weekBegin: affectedDpl.weekBegin, 
      sec: params.sec, 
      profiles: affectedDpl.periodMembers, 
      public: affectedDpl.published,
      entity: "survey", action: "new", 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name}, ${dtBegin.toFormat("kkkk 'KW' W")}`, 
      user: params.user
   });*/
   return affectedDpl.groupSurvey;   
}

async function editDpl( session, params, createEvent ) {
   let returnVal;   

   let orchestraDoc = await Orchestra.findById(params.o).session(session);
   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.begin,
      weekEditable: true
   } ).session(session).populate('periodMembers p')/*.populate('weekSeason')*/;   
     
   if ( !affectedDpl ) return { 
      success: false, 
      reason: 'Dienstplan existiert nicht / nicht editierbar'
   };   
   if ( affectedDpl.version > params.ver ) return { 
      success: false, 
      reason: 'Dienstplan ist nicht mehr aktuell. Bitte aktualisiere deine Ansicht'
   };   

   //console.log('affectedDpl', affectedDpl);
   let members = affectedDpl.p.members;
   let oldDelta = affectedDpl.delta; 
   // for pdf red
   let groupSize = affectedDpl.periodMembers.length;
   let days = [];
   let dtMonday = DateTime.fromMillis(affectedDpl.weekBegin.getTime(), { timezone: orchestraDoc.timezone});
   for ( let i = 0; i < 7; i++ ) {
      days.push(dtMonday.plus({day: i}));            
   }        
   let changes = []; // for red markings in PDF (changes), columns
   let rejectedFw = [];
   //params.sps.sort( (a, b) => a.dienstBegin.getTime() - b.dienstBegin.getTime() );        
   //console.log('ciklus 0..13');
   for ( let i = 0; i < 14; i++ ) {
      console.log('i:', i);
      changes[i] = [];
      rejectedFw[i] = Array(groupSize).fill(false);
      let dayIndex = Math.floor(i/2);
      let pmShift = i % 2;
      params.sps.forEach( d => {
         let oldSeating = affectedDpl.seatings.find( dienst => dienst.d == d.d );      
          let dtDienstBegin = DateTime.fromMillis(oldSeating.dienstBegin.getTime(), {zone: orchestraDoc.timezone});                   
          if ( dtDienstBegin.day == days[dayIndex].day && (!pmShift && dtDienstBegin.hour < 12 || pmShift && dtDienstBegin.hour >= 12) ) {               
               let comment = false, ext = false;
               let sp = Array(groupSize).fill(false);
               if ( d.comment != oldSeating.comment ) comment = true;
               if ( d.ext != oldSeating.ext ) ext = true;
               for ( let m = 0; m < groupSize; m++ ) {
                  sp[m] = oldSeating.sp[m] != d.sp[m] || params.absent[i][m] != affectedDpl.absent[i][m];
               }
               changes[i].push( {
                  seating: sp,
                  ext: ext,
                  comment: comment
               } );
               rejectedFw[i] = d.sp.map( (sp, mi) => (rejectedFw[i][mi] || (affectedDpl.absent[i][mi] == 4) && !(sp == 0 || sp == 32 || sp >= 64) ));          
          }                    
      });
      if ( !changes[i].length ) {
         changes[i].push({
            seating: Array(groupSize).fill(false),
            ext: false,
            comment: false
         });
         for ( let j = 0; j < groupSize; j++ ) {
            if ( affectedDpl.absent[i][j] != params.absent[i][j] ) changes[i][0].seating[j] = true; // mark cell with red
         }
      }
   }
   
   let seatingChanged = []; // for each dienst an array of size groupsize with info if their seating code has changed. for PDF generation's future red markings   
   //console.log('params.sps', params.sps);
   //console.log('params.absent', params.absent);
   for ( let i = 0; i < affectedDpl.seatings.length; i++ ) {      
      let newSeating = params.sps.find( dienst => dienst.d == affectedDpl.seatings[i].d );      
      seatingChanged.push(
         affectedDpl.seatings[i].sp.map( (code, index) => code != newSeating.sp[index])
      );
      affectedDpl.seatings[i].ext = newSeating.ext;
      affectedDpl.seatings[i].comment = newSeating.comment;
      affectedDpl.seatings[i].sp = newSeating.sp;

      affectedDpl.seatings[i].available = newSeating.available;
   }      
   /*await*/ affectedDpl.calcDelta();
   affectedDpl.version = affectedDpl.version + 1;
   affectedDpl.state = new Date();
   await affectedDpl.save();
   let diff = affectedDpl.delta.map( (val, ind) => oldDelta[ind] - val);

   await Dpl.updateOne( { 
      o: params.o,
      s: params.sec,
      weekBegin: params.begin         
   }, {
      '$set': {
         absent: params.absent,
         seatings: affectedDpl.seatings,
         delta: affectedDpl.delta,
         groupSurvey: null,   // delete surveys upon change in seating
         officeSurvey: null
      }
   }, { session: session  } );
   let updateObj = {}; 
   updateObj[`dpls.${params.sec}.officeSurvey`] = null;      
   await Week.findOneAndUpdate({
         o: params.o, begin: params.begin
   }, updateObj).session(session);
   
   affectedDpl = await Dpl.findById( affectedDpl._id ).session(session).populate('periodMembers p');

   if ( affectedDpl.officeSurvey && affectedDpl.officeSurvey.status != 'confirmed') {
      // change dpl state back to closed      
      await Dpl.updateOne( { 
         o: params.o,
         s: params.sec,
         weekBegin: params.begin         
      }, { closed: true, published: false, officeSurvey: null }, { session: session  } );
      //also in weeks collection!!!
      updateObj = {}; 
      updateObj[`dpls.${params.sec}.closed`] = true;            
      updateObj[`dpls.${params.sec}.published`] = false;      
      await Week.findOneAndUpdate({
         o: params.o, begin: params.begin
      }, updateObj).session(session);            
   }         

   // update dz end and dz begin for all succeeding weeks         
   await recalcNumbersAfterEdit(session, params.o, params.sec, params.begin, 
      affectedDpl.p._id, diff);
   
   let dtBegin = DateTime.fromJSDate(affectedDpl.weekBegin, {zone: orchestraDoc.timezone});
   let dtEnd = dtBegin.plus({day: 7});
   await createEvent({
      weekBegin: affectedDpl.weekBegin, 
      sec: params.sec, 
      profiles: affectedDpl.periodMembers.map( pm => pm._id ), 
      public: affectedDpl.published,
      entity: "dpl", action: "edit", 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name}, ${dtBegin.toFormat("kkkk 'KW' W")}`, 
      user: params.user
   });

   //console.log("rejectedFw", rejectedFw);
   let weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
   rejectedFwPositions = rejectedFw.map( (pos, ind) => pos.map(
       posMem => posMem ? weekdays[Math.floor(ind/2)] + (ind%2 ? ' Nachmittag/Abend' : ' Vormittag') : null
   ));
   
   let rejectedFws = Array(groupSize).fill("");
   for ( let ind = 0; ind < groupSize; ind++ ) {
      rejectedFws[ind] = rejectedFwPositions.map( rp => rp[ind] ).filter(v => v).join(", ");      
   }
   //console.log("positions raw",  rejectedFwPositions);
   //console.log("positions for member:", rejectedFws);


   let memberProfiles = await Profile.find({
      o: params.o,
      role: 'musician',
      'notifications.fwRejected': true,
      _id: {
         $in: affectedDpl.periodMembers.map( 
            (pm, index) => rejectedFws[index] ? pm._id : null )
      },
   });

   //console.log('rejectedFw', rejectedFw);
   //console.log('rejectedPos', rejectedFwPositions);
   
   let sectionName = orchestraDoc.sections.get(params.sec).name;
   for ( let j = 0; j < memberProfiles.length; j++ ) {
      email.send({
         template: 'fwrejected',
         message: { 
            to: `"${memberProfiles[j].userFn} ${memberProfiles[j].userSn}" ${memberProfiles[j].email}`, 
            attachments: [{
               filename: 'logo.png',
               path: path.join(__dirname, '..') + '/favicon-32x32.png',
               cid: 'logo'
            }]
         },
         locals: { 
            name: memberProfiles[j].userFn,               
            link: `${params.origin}/musician/week?profId=${memberProfiles[j]._id}&mts=${params.begin}`,                                               
            instrument: sectionName,
            kw: dtBegin.toFormat("W"),
            columns: rejectedFws[members.find( m => m.prof.toString() == memberProfiles[j]._id.toString()).row],
            period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`,                                
            orchestra: orchestraDoc.code,
            orchestraFull: orchestraDoc.fullName,                              
         }
      }).catch(console.error);
   }      

   if ( affectedDpl.published && !affectedDpl.officeSurvey && !( affectedDpl.weekBegin.getTime() + 7*24*3600*1000 < Date.now() ) ) {
      // get all office profiles
      let officeProfiles = await Profile.find({
         o: params.o,
         role: 'office',
         'notifications.dplChanged': true
      }).session(session);      
      // generate PDF for this section's current dpl (new version)
      let weekDoc = await Week.findById(affectedDpl.w).session(session);
      let sectionName = orchestraDoc.sections.get(params.sec).name;
      let sectionAbbr = orchestraDoc.sections.get(params.sec).abbr;            
      PDFCreator.parseWeekData(orchestraDoc, weekDoc);
      //console.log('DEBUG', affectedDpl.periodMembers);
      PDFCreator.parseDpl(affectedDpl, sectionName, affectedDpl.periodMembers.map(
         pm => {
            return {
               fn: pm.userFn,
               sn: pm.userSn
            }
         }
      ) );
      let filename = PDFCreator.createPDF( changes );
      // get scheduler profile for section     
      let schedulerProfile = await Profile.find({
         o: params.o,
         section: params.sec,
         role: 'scheduler',
         'notifications.dplChanged': true
      }).session(session);          
      let memberProfiles = await Profile.find({
         o: params.o,
         section: params.sec,
         role: 'musician',
         _id: {
            $in: affectedDpl.periodMembers.map( 
               (pm, index) => seatingChanged.some( s => s[index] ) ? pm._id : null )
         },
         'notifications.dplChanged': true
      }).session(session);
      let allProfiles = officeProfiles.concat(memberProfiles, schedulerProfile);
      // send "dplchanged" email for all officeProfiles, scheduler of section and members where      
      for ( let j = 0; j < allProfiles.length; j++ ) {
         email.send({
            template: 'dplchanged',
            message: { 
               to: `"${allProfiles[j].userFn} ${allProfiles[j].userSn}" ${allProfiles[j].email}`, 
               attachments: [{
                  filename: 'logo.png',
                  path: path.join(__dirname, '..') + '/favicon-32x32.png',
                  cid: 'logo'
               }, {
                  filename: `dpl_${orchestraDoc.code}_${sectionAbbr}_${dtBegin.toFormat("yyyy_W")}.pdf`,
                  path: path.join(__dirname, '..', 'output') + `/${filename}`,
               }]
            },
            locals: { 
               name: allProfiles[j].userFn,               
               link: `${params.origin}/${allProfiles[j].role}/week?profId=${allProfiles[j]._id}&mts=${params.begin}`,                                               
               instrument: sectionName,
               kw: dtBegin.toFormat("W"),
               period: `${dtBegin.toFormat('dd.MM.yyyy')}-${dtEnd.toFormat('dd.MM.yyyy')}`,        
               scheduler: allProfiles[j].role == 'scheduler',
               change: 'seating',               
               orchestra: orchestraDoc.code,
               orchestraFull: orchestraDoc.fullName,                              
            }
         })/*.then(PDFCreator.deleteOutputFiles()) - does not work, emails are in loop*/.catch(console.error);
      }   
      //PDFCreator.deleteOutputFiles(); does not work, sync
   }       

   returnVal = true;   
   return returnVal;
}

/********
 * Edit seatings (incl. absent) for this dpl by scheduler
 */
router.post('/:mts', async function(req, res) {   
   console.log('edit seating...', req.body); 

   let result = await writeOperation( req.authData.o, editDpl, {
      ...req.body, 
      o: req.authData.o, 
      sec: req.authData.s,
      user: req.authData.pid,
      begin: new Date(req.params.mts * 1000),
      origin: req.get('origin')      
   });      
   console.log(`Dpl successfully updated: ${result}`);      
   
   // return new week plan            
   let resp = await createWeekDataRaw(req.params.mts, req.authData, req.authData.s);   
   res.json( result === true ? { success: true, week: resp} : result );            
 });

 async function deleteDpl( session, params, createEvent ) {      
   let dpl = await Dpl.findOne( { 
      o: params.o, _id: params.dpl, weekEditable: true }).session(session);
   /********
    * check if dpl is empty (no scheduler's data)        
    */
   let isEmpty = dpl.seatings.reduce(
      (empty, seating) => empty && seating.sp.reduce((empty, code) => empty && !code, true ), true
   );
   if ( !isEmpty ) return;
   await recalcNumbersAfterEdit( session, params.o, params.sec, dpl.weekBegin, dpl.p, dpl.correction);   
   await Dplmeta.deleteOne( { o: params.o, dpl: params.dpl } ).session(session);
   await Dpl.deleteOne( { _id: params.dpl, o: params.o } ).session(session);
   let weekDoc = await Week.findOne({ o: params.o, begin: dpl.weekBegin }).session(session);
   weekDoc.dpls[params.sec] = undefined;
   await weekDoc.save(); 

   let orchestraDoc = await Orchestra.findById(params.o).session(session);                      
   let dtBegin = DateTime.fromJSDate(dpl.weekBegin, {zone: orchestraDoc.timezone});
   await createEvent({
      weekBegin: dpl.weekBegin, 
      sec: dpl.s, 
      profiles: dpl.periodMembers, 
      public: dpl.published,
      entity: "dpl", action: "del", 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name}, ${dtBegin.toFormat("kkkk 'KW' W")}`, 
      user: params.user
   });
 }

 async function deleteSurvey( session, params, createEvent ) {      
   let affectedDpl = await Dpl.findOne( {
      o: params.o,
      s: params.sec,
      weekBegin: params.mts*1000,      
   } ).session(session);        
   if ( !affectedDpl ) return false;   
   affectedDpl.groupSurvey = null;
   await affectedDpl.save();            

   let orchestraDoc = await Orchestra.findById(params.o).session(session);                      
   let dtBegin = DateTime.fromJSDate(affectedDpl.weekBegin, {zone: orchestraDoc.timezone});
   await createEvent({
      weekBegin: affectedDpl.weekBegin, 
      sec: affectedDpl.s, 
      profiles: affectedDpl.periodMembers, 
      public: affectedDpl.published,
      entity: "survey", action: "del", 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.sec).name}, ${dtBegin.toFormat("kkkk 'KW' W")}`, 
      user: params.user
   });
 }

 router.delete('/:dplId', async function(req, res) {    
   console.log( `Deleting DPL ${req.params.dplId}...` );   
   await writeOperation( req.authData.o, deleteDpl, {        
       o: req.authData.o, 
       prof: req.authData.pid,
       role: req.authData.r,
       dpl: req.params.dplId,       
       sec: req.authData.s, 
       user: req.authData.pid       
    });             
});

async function createDpl( session, params, createEvent ) {
   // Create new Dpl
   console.log('In transaction fcn');
   let week = await createWeekDataRaw(params.begin, params.authData, params.authData.s);
   console.log(week);
   if ( !week.wpl.editable || !week.assignedPeriod ) return false;
   let groupSize = week.assignedPeriod.members.length;
   let dtBegin = new Date(params.begin*1000);
   let absent = [];
   for ( let i = 0; i < 14; i++ ) {
      absent[i] = Array(groupSize).fill(0);
   }
   let seatings = [];
   for ( let dienst of week.wpl.dienst ) {
      seatings.push( {
         d: dienst._id,
         ext: 0,
         sp: Array(groupSize).fill(0), // seating plan; n x    
         comment: '', // scheduler's comment    
         available: Array(groupSize).fill(false),

         dienstBegin: new Date(dienst.begin.getTime()),
         dienstWeight: dienst.weight,
         dienstInstr: dienst.instrumentation.get(params.authData.s) // for this section only
      });
   }
   console.log(`o: ${params.authData.o}, s: ${params.authData.s}, p: ${week.assignedPeriod._id}`);
   let lastDplDoc = await Dpl
   .find({
      o: params.authData.o,
      s: params.authData.s,
      p: week.assignedPeriod._id,                                
   }).session(session).where('weekBegin').lt(dtBegin) // before this week                                 
   .sort('-weekBegin').limit(1);

   console.log(`lastDpl`);
   console.log(lastDplDoc[0]);
   console.log('End: ');
   console.log(lastDplDoc[0].end);

   let dplId = new mongoose.Types.ObjectId();
   let members = week.assignedPeriod.members.map( m => m.prof );
   await Dpl.create( [{
      _id: dplId,
      o: params.authData.o,
      w: week.wpl._id,
      p: week.assignedPeriod._id,
      periodMembers: members,
      s: params.authData.s, // section
      weekBegin: dtBegin,
      weekEditable: true,
      weekSeason: week.wpl.season._id,
      closed: false,
      published: false,
      officeSurvey: null, groupSurvey: null,
      remark: params.remark,
      absent: absent, 
      correction: Array(groupSize).fill(0),
      delta: Array(groupSize).fill(0),
      start: lastDplDoc[0] ? lastDplDoc[0].end : Array(groupSize).fill(0), // ha van előző hét, annak a vége, egyébként 0,0,0...
      seatings: seatings,
      version: 1,
      state: new Date()
   }], { session } );

   // create dplmeta doc
   await Dplmeta.create( {
      o: params.authData.o,
      dpl: dplId,
      dplPeriod: week.assignedPeriod._id,
      weekBegin: dtBegin,
      periodMembers: week.assignedPeriod.members.map(
         mem => {
            return {
               prof: mem.prof._id,
               row: mem.row,
               canComment: mem.canComment
            };
         }
      ),
      comments: []      
   } );
   
   let weekDoc = await Week.findById(week.wpl._id).session(session);
   weekDoc.dpls.set(params.authData.s, {
      closed: false,
      published: false,
      dplRef: dplId
   } );
   await weekDoc.save();
   let orchestraDoc = await Orchestra.findById(params.authData.o).session(session);                      
   let lxBegin = DateTime.fromJSDate(dtBegin, {zone: orchestraDoc.timezone});
   await createEvent({
      weekBegin: dtBegin, 
      sec: params.authData.s, 
      profiles: members,       
      entity: "dpl", action: "new", 
      extra: `Dienstplan ${orchestraDoc.sections.get(params.authData.s).name}, ${lxBegin.toFormat("kkkk 'KW' W")}`, 
      user: params.authData.pid
   });

   return true;   
}

router.post('/', async function(req, res) {   
   console.log('creating dpl...', req.body);   
   let result = await writeOperation( req.authData.o, createDpl, {      
      authData: req.authData,
      begin: req.body.mts,
      remark: req.body.remark      
   });      
   console.log(`Dpl successfully created: ${result}`);      
   
   // return new week plan            
   let resp = await createWeekDataRaw(req.body.mts, req.authData, req.authData.s);   
   console.log(resp);
   res.json( result === true ? { success: true, content: resp} : 
      {success: false, reason: 'Nicht erfolgreich'} );            
});


 
 //export this router to use in our index.js
module.exports = router;