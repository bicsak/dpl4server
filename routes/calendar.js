let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');
const ics = require('ics');

const Orchestra = require('../models/orchestra');
const Week = require('../models/week');
/*const DienstExtRef = require('../models/dienst'); */

const Profile = require('../models/profile');
/* const { DateTime } = require("luxon"); */

router.get('/', async function(req, res) {   
  // req.query.profId, req.query.type == 'all'|'dienst'|'no-dienst'
    
    try {
      let session = app.get('session');
      let prof = req.query.profId;      
      let profDoc = await Profile.findById(prof).session(session);
      if ( profDoc.role != 'musician' ) {
        res.status(500).send('Calendar feed not allowed');
       return;
      }
      let orch = profDoc.o;
      let orchDoc = await Orchestra.findById(orch).session(session);
      if ( !orchDoc.calendar ) {
        res.status(500).send('Calendar feed not allowed');
       return;
      }

      let d = new Date();
      d.setDate(d.getDate() - 21); // date 3 weeks ago
      let result = await Week.aggregate(
      [
        {
          '$match': {
            'o': mongoose.Types.ObjectId(orch), 
            'begin': {
              '$gte': d 
            }
          }
        }, {
          '$unwind': {
            'path': '$dienst'
          }
        }, {
          '$addFields': {
            'dienst.wId': '$_id', 
            'dienst.weekRemark': '$remark',
            'dienst.weekBegin': '$begin',
            'dienst.weekEditable': '$editable'
          }
        }, {
          '$replaceRoot': {
            'newRoot': '$dienst'
          }
        }, /*{
          '$match': {
            'begin': {
              '$gte': new Date() // ?? do we need it?
            }
          }
        }, */{
          '$lookup': {
            'from': 'productions', 
            'localField': 'prod', 
            'foreignField': '_id', 
            'as': 'prod', 
            'pipeline': [
              {
                '$project': {
                  'duration': 1
                }
              }
            ]
          }
        }, {
          '$addFields': {
            'prodDuration': {
              '$getField': {
                'field': 'duration', 
                'input': {
                  '$arrayElemAt': [
                    '$prod', 0
                  ]
                }
              }
            }
          }
        }, {
          '$lookup': {
            'from': 'dpls', 
            'localField': 'wId', 
            'foreignField': 'w', 
            'as': 'dpl', 
            'let': {
              'dienstid': '$_id'
            }, 
            'pipeline': [
              {
                '$match': {
                  's': 'sec5', 
                  'periodMembers': mongoose.Types.ObjectId(prof)
                }
              }, {
                '$unwind': {
                  'path': '$seatings'
                }
              }, {
                '$addFields': {
                  'seating_did': '$seatings.d', 
                  'dienst_did': '$$dienstid'
                }
              }, {
                '$match': {
                  '$expr': {
                    '$eq': [
                      '$seating_did', '$dienst_did'
                    ]
                  }
                }
              }, {
                '$addFields': {
                  'memberInd': {
                    '$indexOfArray': [
                      '$periodMembers', mongoose.Types.ObjectId(prof)
                    ]
                  }
                }
              }
            ]
          }
        }, {
          '$lookup': {
            'from': 'periods', 
            'localField': 'dpl.0.p', 
            'foreignField': '_id', 
            'as': 'period'
          }
        }, {
          '$addFields': {
            'dpl': {
              '$arrayElemAt': [
                '$dpl', 0
              ]
            }, 
            'period': {
              '$arrayElemAt': [
                '$period', 0
              ]
            }
          }
        }, {
          '$project': {
            'name': 1, 
            'col': 1, 
            'begin': 1, 
            'category': 1, 
            // 'comment': 1, // by manager only for this dienst
            'subtype': 1, 
            'weight': 1, 
            'duration': 1, 
            'location': 1, 
            'instrumentation': 1, 
            'suffix': 1,
            'seq': 1, 
            'total': 1, 
            'prodDuration': 1, 
            // 'weekRemark': 1, // by manager for the whole week
            // 'weekEditable': 1,
            'weekBegin': 1,
            'dpl.seatings': 1, //.comment: by scheduler only for this dienst
            'dpl.closed': 1, 
            'dpl.published': 1, 
            //'dpl.remark': 1, // by scheduler for the whole week
            'dpl.memberInd': 1, 
            'dpl.absent': 1, 
            'period.members': 1
          }
        }
      ]
      ).session(session);
    //console.log('Aggregation result:', result);   
    
    let events = [];
    //let url = req.get('host'); // origin
    let url = "https://odp.bicsak.net"; // TODO
    console.log(url);
    console.log(req.query.type);
    console.log('Origin', req.headers);
    for ( let i = 0; i < result.length; i++ ) {
      let dienst = result[i];
      let dpl = result[i].dpl;
      let hasDienst =  dpl &&
       (dpl.seatings.sp[dpl.memberInd] == 16 || dpl.seatings.sp[dpl.memberInd] == 1) && 
       dpl.absent[dienst.col][dpl.memberInd] == 0;
      if ( req.query.type == 'all' ||
        req.query.type == 'dienst' && hasDienst ||
        req.query.type == 'no-dienst' && !hasDienst ) {
        let duration = dienst.duration ? dienst.duration : dienst.prodDuration;                 
        let name = dienst.name;
        let suffix = orchDoc.categories[dienst.category].suffixes[dienst.subtype];
        if (suffix) name += " " + suffix;        
        if ( dienst.category == 0 && dienst.subtype == 6 ) name += " " + dienst.suffix;
        if ( dienst.category == 1 ) name = name.toUpperCase();
        if ( orchDoc.categories[dienst.category].numbers[dienst.subtype] ) {
          // add numbering
          if ( dienst.seq < 1 ) name += '#';
          name += Math.abs(dienst.seq);
          if ( orchDoc.lastPerformance && dienst.category == 2 && dienst.seq == dienst.total ) name += ' z.l.M.';
        }
        let description = "";
        if ( !dpl ) description = "Kein DPL vorhanden";
        else {
          if ( dpl.published && dpl.officeSurvey && dpl.officeSurvey.status != 'confirmed') description = "Endgültiger DPL unter Genehmigung";
          else if ( dpl.published ) description = "Dienstplan offiziell und verbindlich";
          else if ( dpl.closed ) description = "Bearbeitung vom DPL abgeschlossen";
          else description = "Bearbeitung vom DPL offen";
          
          // 'aktuelle Einteilung, Aushilfen:'
          description += "\\n\\nAktuelle Einteilung: ";
          let currentSeating = "";
          for ( let j = 0; j < dienst.period.members.length; j++) {
            if (dpl.seatings.sp[j] == 16 || dpl.seatings.sp[j] == 1)
            currentSeating += (currentSeating ? "," : "")+dienst.period.members[j].initial;
          }
          if ( currentSeating ) description += currentSeating; else description += "-";
          if (dpl.seatings.ext) description += ' +'+dpl.seatings.ext;

          let currentAbsence = "";
          for ( let j = 0; j < dienst.period.members.length; j++) {
            if ( dpl.absent[dienst.col][j] ) {
              currentAbsence += (currentAbsence ? "," : "")+dienst.period.members[j].initial;
              if ( dpl.absent[dienst.col][j] == 4 ) currentAbsence += '(FW)';
            }
          }
          if ( currentAbsence ) description += `\\n\\nAbwesenheiten: ${currentAbsence}`;
        }
        let event = {
          productId: 'ODP',
          start: [dienst.begin.getUTCFullYear(), dienst.begin.getUTCMonth()+1, dienst.begin.getUTCDate(), dienst.begin.getUTCHours(), dienst.begin.getUTCMinutes()], 
          startInputType: 'utc',
          duration: { minutes: duration },
          title: name,
          description: description, 
          location: dienst.location.full,
          url: `${url}/musician/week/?mts=${dienst.weekBegin.getTime()}`,
          status: dpl?.published ? 'CONFIRMED' : 'TENTATIVE'           
        };
        //console.log(event);
        events.push(event);
      }      
    }
    //console.log(events);
    const { error, value } = ics.createEvents(events);
     /*[
       {
         title: 'Lunch',
         start: [2023, 11, 15, 12, 15],
         duration: { minutes: 45 }
       },
       {
         title: 'Dinner',
         start: [2023, 11, 15, 12, 15],
         duration: { hours: 1, minutes: 30 }
       }
     ]*/     
     if (error) {
      console.log(error);
      return;
    }
    
    //console.log(value);
    res.set({
      'Content-Type': 'text/calendar',        
      'Content-Disposition': `attachment; filename=odp_dienste.ics`,
    });
    res.send(value);

    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
       return;
    }          
      
 });

 
//export this router to use in our index.js
module.exports = router;