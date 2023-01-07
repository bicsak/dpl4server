let express = require('express');
let router = express.Router();

const { writeOperation } = require('../my_modules/orch-lock');
const { createWeekDataRaw } = require('../my_modules/week-data-raw');

const Orchestra = require('../models/orchestra');
const Dpl = require('../models/dpl');

/***********
 * Handles following cases
 * 
 * only for scheduler:
 * TODO delete dpl DEL
 * TODO create dpl POST
 * TODO edit dpl (seatings with extern, scheduler's comment, absent and seating array) POST
 * edit dpl's remark by scheduler PATCH
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
      'weekSeason': mongoose.Types.ObjectId(seasonId) } }, 
      { '$unwind': { 'path': '$absent' } }, 
      { '$unwind': { 'path': '$absent', 'includeArrayIndex': 'member' } }, 
      { '$match': { 'member': memberIndex, 'absent': 4 } }, 
      { '$count': 'countFw' }
   ] );   
   return result[0].countFw;
}

// Freiwunsch, Dienstwunsch eintragen/löschen
async function editFwDw( session, params ) {
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
      closed: false
   } ).session(session).populate('p').populate('weekSeason');   
     
   if ( !affectedDpl ) return { 
      success: false, 
      reason: 'Dienstplan abgeschlossen'
   };
      
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
      let dt = DateTime.fromMillis(
         affectedDpl.seatings[seatingIndex].dienstBegin.getTime(), 
         { zone: tz } );            
      let ind = dt.weekday - 1;
      let pmOffset = dt.hour >= 12 ? 1 : 0;                      
      if ( seatingIndex < 0 || 
         affectedDpl.seatings[seatingIndex].sp[params.mi] != 0 || 
         affectedDpl.absent[ind * 2 + pmOffset][params.mi] != 0 ) returnVal = { 
         success: false, reason: 'Eintragen nicht möglich'
      }; else {
         affectedDpl.seatings[seatingIndex].available[params.mi] = !params.erase;
         await affectedDpl.save();
         returnVal = { success: true };
      }      
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
         maxFw: params.erase ? undefined : numberOfWeeks * maxFW
      };      
   }
   return returnVal; 
} // End of transaction function

router.patch('/:mts', async function(req, res) {
   /*jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
      if (err ) { 
         res.sendStatus(401); 
         return; 
      }      */
      console.log(req.authData);
      if ( req.body.path === '/remark' ) {
         if (req.authData.r !== 'scheduler' ) { 
            res.sendStatus(401); 
            return; 
         }

         if ( req.body.op === 'replace' ) {            
            await Dpl.findOneAndUpdate( { 
               o: req.authData.o,
               weekBegin: new Date(req.params.mts * 1000),
               s: req.authData.s
            }, {
               remark: req.body.value
            });
            res.json( { remark: req.body.value } ); 
            return;
         } else if (req.body.op === 'remove' ) {            
            await Dpl.findOneAndUpdate( { 
               o: req.authData.o,
               weekBegin: new Date(req.params.mts * 1000),
               s: req.authData.s
            }, {
               remark: null
            });
            res.sendStatus( 204 ); 
            return;
         }
      } else if (req.body.op == 'delwish' || req.body.op == 'newwish') {
         if ( err || req.authData.r !== 'musician' ) { 
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
                     did: req.body.did, mi: req.body.mi                     
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
                     col: req.body.col, mi: req.body.mi                                          
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
                     did: req.body.did, mi: req.body.mi                                          
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
                     col: req.body.col, mi: req.body.mi                                          
                  });                        
      
               res.json( result ); //TODO push-notifications
               return;
            }
         }         
      }
   //});
});

/********
 * Edit seatings (incl. absent) for this dpl by scheduler
 */
router.post('/:mts', async function(req, res) {
   //TODO section: req.authData.s
    console.log(req.body);
    //jwt.verify(req.token, process.env.JWT_PASS, async function (err,authData) {
       if (req.authData.r !== 'scheduler' ) { res.sendStatus(401); return; }      
       /*let result = await writeOperation( authData.o, editDienst, {
          ...req.body, 
          o: authData.o, 
          mts: req.params.mts, 
          did: req.params.did, 
       });      
       console.log(`Dienst successfully updated: ${result}`);      
       */
       // return new week plan            
       let resp = await createWeekDataRaw(req.params.mts, req.authData);
       res.json( resp );            
    //});
 });
 
 //export this router to use in our index.js
module.exports = router;