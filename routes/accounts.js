let express = require('express');
const nodemailer = require('nodemailer');
const Email = require('email-templates');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('node:path');

const User = require('../models/user');

const pad = i => i < 10 ? `0${i}` : `${i}`;
const transporter = nodemailer.createTransport({                
    host: process.env.MAIL_HOST,                        
    port: process.env.MAIL_PORT,

    secure: false, // upgrade later with STARTTLS
    auth: {                          
      user: process.env.MAIL_USER,                          
      pass: process.env.MAIL_PASS
    },
    tls:{
        rejectUnauthorized:false  // if on local
    },
    dkim: {
       domainName: "odp.bicsak.net",
       keySelector: "default",
       privateKey: "-----BEGIN PRIVATE KEY-----\nMIICXAIBAAKBgQC40ANDOghp0pyEFI3I3QoP/bAE76is2reGGXCNGYZCOHT2kr8EP9plD5TcJVKSC5+3CieGJUFalNnZDUmBXweDdC7V4ACvand1IOlTogCs4Ncmkp85QcFySusKsRjp6BsRd97l8Bv/s8XsVR13TI5L62umB7A19l262pFn3C6nUwIDAQABAoGAKEN5Un4kMxnla4km0qoFdTJp1Ml50B7eeOK1+Kek7mxqXwXdg8l9hSL95XBkKtlJdJFLxxf6wwdG5tjUONFBS2z7QXbsmgbfurW7by5jnDi+9F4aHCw12Yq4MD1jqV90agFC8h49yKlUePtW1YbUH+LaG06CFAk4Xrv1CgmEqyECQQDy7iROD73LIUBe2tcaiawo5ZTMvez17DsXj2op0Sddt2TEvVedPudkxNWfYv+cXlKwRhCIWBwSlKiXxrffbEc5AkEAwsFrtnsOmy5yDSS9HXNMYBpbf7HZ5ivSB/kRfjWsUtjWOw6Pxctvmy9gp78dHRALwLkbRxeCN54KeTr2lZ126wJANANpIo2cRXHJJoYUqEnx4o/FXFEN+1mpDVJXmLx/gUFTAgzIRZLCWIEMfCPmNsS7T6Kwx4CWAiRyNI0HsX6tgQJAaAJUPAhMLKQJVOuh8/B3gXuSEggxjrMoYAmsRfL0LOqQvslwDvouiHos7GksazD+ldZFsxni+UD15viOaCjIMQJBALFZSKMgT0L6U+COa3QuVAgcUFfVMiTyY4SOCmyXFBCcE4TZgmjsf7AdGtH/wjrq5mow/LTgUAuDSbtTxunNLi4=\n-----END RSA PRIVATE KEY-----"
     }
});

const email = new Email({
    message: {
      from: '"Orchesterdienstplan" admin@odp.bicsak.net'
    },
    // uncomment below to send emails in development/test env:
    // send: true
    transport: transporter                
  });     

let router = express.Router();


async function deleteOldPendingRequests() {
    let cutOff = new Date();
        cutOff.setTime(cutOff.getTime()-3600*1000);
        await User.deleteMany({
            status: 'pending',
            created_at: { $lt: cutOff }
        });       
}

router.post('/sign-up', async (req, res, next) => {
    try {        
        // delete all docs from users coll where status: 'pending' and created_at is older than 1 hour        
        await deleteOldPendingRequests();

        // create user doc with status: 'pending' (default), with new confirmation code + ts (auto)
        let token = crypto.randomBytes(16).toString('hex');
        let bdString = `${req.body.bdYear}-${pad(req.body.bdMonth)}-${pad(req.body.bdDay)}`;
        let userDoc = new User({
            fn: req.body.fn,
            sn: req.body.sn,
            birthday: new Date(bdString), // will be treated as UTC
            email: req.body.email,             
            confirmationCode: token,
            profiles: []
        });        
        bcrypt.hash(req.body.pw, 10, async (err, hash) => {
            if (err) {
              console.log("bcrypt error");
              userDoc = null;
            } else {                    
                userDoc.pw = hash;                              
                await userDoc.save();
            }
        });                    
                
        // if user email already exists, send error code
        if ( !userDoc) {
            res.status(400).send({
                msg: 'User already exists or other error'
            });
        } else {
            // on success send email with link to app route /verify-email (code: token + userId: userDoc._id)                                   
            email.send({
                template: 'signup',
                message: { 
                    to: userDoc.email,
                    attachments: [{
                        filename: 'favicon-32x32.png',
                        path: path.join(__dirname, '..') + '/favicon-32x32.png',
                        cid: 'logo' //same cid value as in the html img src
                    }]
                 },
                locals: {
                    name: userDoc.fn,
                    link: `${req.get('origin')}/accounts/verifyemail?id=${userDoc.id}&token=${token}`
                }
            })/*.then(console.log)*/.catch(console.error);
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
        await deleteOldPendingRequests();

        let userDoc = await User.findById(req.body.id);                        
        if ( !userDoc || userDoc.status != 'pending' || userDoc.confirmationCode != req.body.token
        ) {
            res.status(400).send({
                msg: 'Verifying not succeeded'
            });
        } else {      
            userDoc.status = 'active';
            await userDoc.save();
            res.json(null);
        }
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});

async function removeOldResetTokens() {
    let cutOff = new Date();
        cutOff.setTime(cutOff.getTime()-3600*1000);
        await User.updateMany({
            "resetPwTokenIssued": {
                $lt: cutOff
            }
        }, {
            $unset: {
                "resetPwToken": 1,
                "resetPwTokenIssued": 1
            }
        });    
}

router.post('/forgot-password', async (req, res, next) => {
    try {
        await removeOldResetTokens() ;

        let userDoc = await User.findOne({
            email: req.body.email
        });      

        let token = crypto.randomBytes(16).toString('hex');
        
        userDoc.resetPwToken = token;
        userDoc.resetPwTokenIssued = new Date();
        await userDoc.save();
        
        // send email with link to app/resetpw?userId&token                           
        email.send({
            template: 'forgotpw',
            message: { 
                to: userDoc.email,
                attachments: [{
                    filename: 'favicon-32x32.png',
                    path: path.join(__dirname, '..') + '/favicon-32x32.png',
                    cid: 'logo' //same cid value as in the html img src
                }]
             },
            locals: {
                name: userDoc.fn,
                link: `${req.get('origin')}/accounts/resetpw?id=${userDoc.id}&token=${token}`
            }
        })/*.then(console.log)*/.catch(console.error);
        //.then(res => { console.log('res.originalMessage', res.originalMessage) }).cathch...            
        res.json(null);
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});


router.post('/validate-reset-token', async (req, res, next) => {
    try {        
        await removeOldResetTokens();

        let userDoc = await User.findById(req.body.id);     
        let now = new Date();

        if ( userDoc.resetPwToken == req.body.token && userDoc.resetPwTokenIssued > now.getTime() - 3600*1000) {
            res.json(null);
        }  else return res.status(400).send({
            msg: 'Token konnte nicht validiert werden'
        });
        
    }
    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});

router.post('/reset-password', async (req, res, next) => {
    try {              
       await removeOldResetTokens();

       let userDoc = await User.findById(req.body.id);     
       let now = new Date();

       if ( userDoc.resetPwToken == req.body.token && userDoc.resetPwTokenIssued > now.getTime() - 3600*1000) {
           userDoc.resetPwToken = undefined;
           userDoc.resetPwTokenIssued = undefined;

           const hashedPassword = await new Promise( (resolve, reject) => {
               bcrypt.hash(req.body.password, 10, function(err, hash) {
                 if (err) reject(err);
                 resolve(hash);
               });
           });            
           userDoc.pw = hashedPassword;
                         
           await userDoc.save();
       }        
       res.json(null);       
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }
});


//export this router to use in our index.js
module.exports = router;