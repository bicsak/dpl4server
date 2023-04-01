let express = require('express');
const nodemailer = require('nodemailer');

const User = require('../models/user');

const pad = i => i < 10 ? `0${i}` : `${i}`;

let router = express.Router();

router.post('/sign-up', async (req, res, next) => {
    try {
        console.log(req.params);
        console.log(req.body);
        // delete all docs from users coll where status: 'pending' and created_at is older than 1 hour
        let cutOff = new Date();
        cutOff.setTime(cutOff.getTime()-3600*1000);
        await User.deleteMany({
            status: 'pending',
            created_at: {
                $lt: cutOff
            }
        });
        
        // create user doc with status: 'pending' (default), with new confirmation code + ts (auto)
        let token = '';
        let bdString = `${req.body.bdYear}-${pad(req.body.bdMonth)}-${pad(req.body.bdDay)}`;
        let userDoc = await new User({
            fn: req.body.fn,
            sn: req.body.sn,
            birthday: new Date(bdString), // will be treated as UTC
            email: req.body.email,
            pw: req.body.pw,
            confirmationCode: token,
            profiles: []
        });        
        
        // if user email already exists, send error code
        if ( !userDoc) {
            res.status(400).send({
                msg: 'User alerady exists'
            });
        } else {
            // on success send email with link to app route /verify-email (code: token + userId: userDoc._id)
        }
    }


    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }

  });


//export this router to use in our index.js
module.exports = router;