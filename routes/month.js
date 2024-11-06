let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const { DateTime } = require('luxon');
const Week = require('../models/week');
const Dpl = require('../models/dpl');
const Orchestra = require('../models/orchestra');

router.get('/', async function(req, res) {  
    //console.log('get request', req.query.year, req.query.month);
    //console.log(req.authData);

    let orch = await Orchestra.findById(req.authData.o);
    let tz = orch.timezone;
    let prof = req.authData.pid;
    //let lxBegin = DateTime.fromISO(`${req.query.year}-${req.query.month}-01T00:00:00.000`, {zone: tz})
    let lxBegin = DateTime.fromObject({ year: req.query.year, month: req.query.month, day: 1}, {zone: tz});
    let lxWeekBegin = lxBegin.minus({day: 8});
    let lxNextMonthBegin = lxBegin.plus({month: 1});        
    //console.log('lxBegin', lxBegin.toJSDate());
    //console.log('lxWeekBEgin', lxWeekBegin.toJSDate());
    //console.log('lxNextMonthBegin', lxNextMonthBegin.toJSDate());
    let dplMatchCrit = {
      s: req.authData.s, // if == 'all' (office) -> no dpl  
    };
    if (req.authData.r == 'musician') dplMatchCrit.periodMembers = mongoose.Types.ObjectId(prof) // only for musician. they should see only their own dpls
    //console.log(dplMatchCrit);

    let dienste = await Week.aggregate( [            
          {
            $match: {
              o: mongoose.Types.ObjectId(req.authData.o),
              begin: { 
                $gte: lxWeekBegin.toJSDate(),
                $lt: lxNextMonthBegin.toJSDate()
               }
            }
          },
          { $unwind: { path: '$dienst' } },
          { $match: { 'dienst.begin': {
                $gte: lxBegin.toJSDate(),
                $lt: lxNextMonthBegin.toJSDate()
              }
            }
          },
          { $addFields: { 
            'dienst.wId': '$_id',
            'dienst.weekBegin': '$begin' 
          } },
          { $replaceRoot: { newRoot: '$dienst' } },
          {
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
          },          
          
          {
            $lookup: {
              from: 'dpls',
              localField: 'wId',
              foreignField: 'w',
              as: 'dpl',
              let: { dienstid: '$_id' },
              pipeline: [
                {
                  $match: dplMatchCrit
                },
                { $unwind: { path: '$seatings' } },
                {
                  $addFields: {
                    seating_did: '$seatings.d',
                    dienst_did: '$$dienstid'
                  }
                },
                {
                  $match: {
                    $expr: {
                      $eq: [
                        '$seating_did',
                        '$dienst_did'
                      ]
                    }
                  }
                },
                {
                  $addFields: {
                    sp: '$seatings.sp',                    
                  }
                },
                {
                  $addFields: {
                    memberInd: {
                      $indexOfArray: [
                        '$periodMembers',
                        mongoose.Types.ObjectId(prof)
                      ]
                    }
                  }
                }                
              ]
            }
          },
          {
            '$lookup': {
              'from': 'periods', 
              'localField': 'dpl.0.p', 
              'foreignField': '_id', 
              'as': 'period'
            }
          },
          {
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
          },          
          {
            $project: {
              name: 1,
              col: 1,
              begin: 1,
              category: 1,
              subtype: 1,
              weight: 1,
              duration: 1,
              location: 1,
              instrumentation: 1,
              'suffix': 1,
              seq: 1,
              total: 1,
              'prodDuration': 1,
              //weekRemark: 1,
              'weekBegin': 1,                            
              'dpl.sp': 1,
              'dpl.closed': 1,
              'dpl.published': 1,
              'dpl.memberInd': 1, 
              'dpl.absent': 1,
              'period.members.initial': 1              
            }
          }
        ]
      );
      let diensteConv = dienste.map( d => {        
        let weekBegin = d.weekBegin.getTime();
        let begin = d.begin.getTime();
        return {...d, weekBegin: weekBegin, begin: begin};
      } )
      //console.log(diensteConv);
      let dpls = [];
      if ( req.authData.s != 'all' ) {
        let ts1 = lxBegin.minus({day: 7}).toJSDate();
        let ts2 = lxNextMonthBegin.toJSDate();
        console.log(ts1, ts2);
        dpls = await Dpl.find({
          o: req.authData.o,
          s: req.authData.s,          
          weekBegin: {
              $gte: ts1,
              $lt: ts2
          }          
        });
      }
      //console.log(dpls);
      res.json( {
        dienste: diensteConv,
        dpls: dpls 
      } );   
});


//export this router to use in our index.js
module.exports = router;