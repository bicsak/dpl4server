let express = require('express');
let router = express.Router();

const Season = require('../models/season');
const DienstExtRef = require('../models/dienst');
const Week = require('../models/week');
const Orchestra = require('../models/orchestra');
const Dpl = require('../models/dpl');
const Dplmeta = require('../models/dplmeta');

const { writeOperation } = require('../my_modules/orch-lock');

const { DateTime } = require("luxon");


router.get('/', async function(req, res) { 
    try {
       /*let response = await Season.find( { o: req.authData.o } );         
       if ( req.query.full == 'true' ) {      
          for ( let i = 0; i < response.length; i++ ){        
             response[i] = await addStat(response[i]);
          }      
       }      */
       //res.status(200).json( response );   
/*
       db.getCollection('dpls').aggregate(
        [
          {
            $match: {
              o: ObjectId('64a32e4acaf5a894577d4771'), // req.authData.o
              s: section // TODO
              weekBegin: {
                $gte: ISODate(
                  '2023-05-20T22:00:00.000Z' // TODO last monday to current date
                )
              },
              periodMembers: ObjectId( // req.authData.prof
                '64a32e4bcaf5a894577d478d'
              )
            }
          },
          {
            $addFields: {
              memberInd: {
                $indexOfArray: [
                  '$periodMembers',
                  ObjectId('64a32e4bcaf5a894577d478d') // same as above
                ]
              }
            }
          },
          { $unwind: { path: '$seatings' } },
          {
            $addFields: {
              disp: {
                $arrayElemAt: [
                  '$seatings.sp',
                  '$memberInd'
                ]
              }
            }
          },
          { $match: { disp: 16 } } // if eingeteilt, which codes?
          // last stage: project dienst id
        ],  await, session!! then find these dienst in dienst ext ref coll
        { maxTimeMS: 60000, allowDiskUse: true }
      );*/

       res.status(200).json([{
        _id: "proba",
        begin: 0, //2017-05-22T08:00:00.000Z
        name: "proba", // Lohengrin
        prod: null,
        category: 0, //rehearsal
        subtype: 0, //OA
        seq: 1, //OA1
        total: 1,
        instrumentation: { },
        weight: 1    
       }]);
    } catch (err) {
       res.status(500).send(err.message);
    }
 });

 
//export this router to use in our index.js
module.exports = router;