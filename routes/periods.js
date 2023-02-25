let express = require('express');
let router = express.Router();
const Period = require('../models/period');
const Dpl = require('../models/dpl');

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

 /*
 router.post('/', function(req, res){
    res.send('POST route on periods');
 });*/
 
 //export this router to use in our index.js
 module.exports = router;