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
    //TODO await DplMeta.find(...)
    /*let resp = await createWeekDataRaw(req.params.mts, req.authData);          
    res.json( resp );    */
 });

//export this router to use in our index.js
module.exports = router;