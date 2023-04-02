let express = require('express');
const nodemailer = require('nodemailer');
const Email = require('email-templates');
const crypto = require('crypto');

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
            created_at: { $lt: cutOff }
        });
        
        // create user doc with status: 'pending' (default), with new confirmation code + ts (auto)
        let token = crypto.randomBytes(16).toString('hex');
        let bdString = `${req.body.bdYear}-${pad(req.body.bdMonth)}-${pad(req.body.bdDay)}`;
        let userDoc = new User({
            fn: req.body.fn,
            sn: req.body.sn,
            birthday: new Date(bdString), // will be treated as UTC
            email: req.body.email,
            pw: req.body.pw,
            confirmationCode: token,
            profiles: []
        });        
        await userDoc.save();
        
        // if user email already exists, send error code
        if ( !userDoc) {
            res.status(400).send({
                msg: 'User alerady exists'
            });
        } else {
            // on success send email with link to app route /verify-email (code: token + userId: userDoc._id)            
            console.log(`Url: ${req.get('origin')}/verify-email?id=${userDoc.id}&token=${token}`);

            let transporter = nodemailer.createTransport({                
                host: process.env.MAIL_HOST,                        
                port: process.env.MAIL_PORT,

                secure: false, // upgrade later with STARTTLS
                auth: {                          
                  user: process.env.MAIL_USER,                          
                  pass: process.env.MAIL_PASS
                },
                tls:{
                    rejectUnauthorized:false  // if on local
                }
            });

            const email = new Email({
                message: {
                  from: '"Orchesterdienstplan" no-reply@odp.bicsak.net'
                },
                // uncomment below to send emails in development/test env:
                // send: true
                transport: transporter                
              });                        

            email.send({
                template: 'signup',
                message: { to: userDoc.email },
                locals: {
                    name: userDoc.fn,
                    link: `${req.get('origin')}/verify-email?id=${userDoc.id}&token=${token}`
                }
            }).then(console.log).catch(console.error);
            //.then(res => { console.log('res.originalMessage', res.originalMessage) }).cathch...            
            res.json(null);
        }
    }


    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }

  });

  router.post('/verify-email', async (req, res, next) => {
    try {
        console.log(req.params);
        console.log(req.body);

        let cutOff = new Date();
        cutOff.setTime(cutOff.getTime()-3600*1000);
        await User.deleteMany({
            status: 'pending',
            created_at: { $lt: cutOff }
        });        

        let userDoc = User.findById(req.body.id);        
                
        if ( !userDoc || userDoc.status != 'pending' || userDoc.confirmationCode != req.body.token
        ) {
            res.status(400).send({
                msg: 'Verifying not succeeded'
            });
        } else {            
            res.json(null);
        }
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});

router.post('/forgot-password', async (req, res, next) => {
    try {
        console.log(req.params);
        console.log(req.body); //contains email

        //TODO
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});

router.post('/validate-reset-token', async (req, res, next) => {
    try {
        console.log(req.params);
        console.log(req.body); // conatains reset token

        //TODO
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});

router.post('/reset-password', async (req, res, next) => {
    try {
        console.log(req.params);
        console.log(req.body); //contains new pw and reset token (validate again!)

       //TODO
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});


//export this router to use in our index.js
module.exports = router;