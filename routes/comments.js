let express = require('express');
let router = express.Router();

const { writeOperation } = require('../my_modules/orch-lock');

const Orchestra = require('../models/orchestra');
const Dpl = require('../models/dpl');
const DplMeta = require('../models/dplmeta');

/***********
 * Handles following cases
 * 
 * for members of the group or scheduler
 * TODO delete comment DEL (only by author or scheduler)
 * TODO create comment POST
 * TODO edit dpl (seatings with extern, scheduler's comment, absent and seating array) POST
 * TODO react to a comment (only members)
 */

// orchestra and section data comes from req.authData.o, req.authData.s
router.get('/:dplId', async function(req, res) {
    //TODO check if scheduler's profile or 
    // member and req.authData.p profile is in members' array for this dpl's period
    let meta = await DplMeta.findOne({
        o: req.authData.o,
        dpl: req.params.dplId
    });
    //console.log(meta);
    console.log( meta.toJSON().comments );
    res.json( meta.toJSON().comments );
 });

 router.delete('/:dplId/:commentId', async function(req, res) {
    //TODO check if scheduler's profile or 
    // member and req.authData.p profile is in members' array for this dpl's period
    /*let meta = await DplMeta.findOne({
        o: req.authData.o,
        dpl: req.params.dplId
    });*/
    //console.log(meta);
    console.log( `Deleting ${req.params.dplId}/${req.params.commentId} TODO...` );
    //res.json( meta.toJSON().comments );
 });

 router.post('/:dplId', async function(req, res) {
    //TODO check if scheduler's profile or 
    // member and req.authData.p profile is in members' array for this dpl's period
    /*let meta = await DplMeta.findOne({
        o: req.authData.o,
        dpl: req.params.dplId
    });*/
    //console.log(meta);
    console.log( `Creating new comment ${req.params.dplId} ${req.body.message} TODO...` );
    //res.json( meta.toJSON().comments );
 });


//export this router to use in our index.js
module.exports = router;