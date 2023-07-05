let express = require('express');
let router = express.Router();
const mongoose = require( 'mongoose' );
const app = require('../server');

const DienstExtRef = require('../models/dienst');
const Dpl = require('../models/dpl');

const { DateTime } = require("luxon");

router.get('/', async function(req, res) { 
  console.log(req.authData);
    try {
      let session = app.get('session');             
      
    res.status(200).json([]);       
    } catch (err) {
      console.log(err);
       res.status(500).send(err.message);
    }
 });

 
//export this router to use in our index.js
module.exports = router;