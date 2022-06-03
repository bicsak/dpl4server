let express = require('express');
//const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const User = require('../models/user');
const Orchestra = require('../models/orchestra');

let router = express.Router();

router.post('/', async (req, res, next) => {
    try {
        //console.log(`${req.body.username}, ${req.body.password}`);
        
        User.getAuthenticated(req.body.username, req.body.password, function(err, user, reason) {
            if (err) throw err;
        
            // login was successful if we have a user
            if (user && reason !== User.failedLogin.MAX_ATTEMPTS) {
                // handle login success
                console.log('login success');

                user.token = jwt.sign({
                    user: user._id                    
                }, process.env.JWT_PASS, { expiresIn: '1h' } );
                user.populate('profiles.o');

                user.profiles.forEach( (currVal, ind, arr) => {
                    arr[ind].token = jwt.sign({
                        user: user._id,
                        pid: currVal._id,
                        r: currVal.role,
                        m: currVal.manager,
                        o: currVal.o._id,
                        s: currVal.section
                    }, process.env.JWT_PASS, { expiresIn: '1h' } );
                });
                
                return res.status(200).send(/*{                    
                    token,
                    user: user,
                    orchestra: orchestra
                }*/ user);                
            }
        
            // otherwise we can determine why we failed
            let reasons = User.failedLogin;
            switch (reason) {
                case reasons.NOT_FOUND:
                case reasons.PASSWORD_INCORRECT:
                    // note: these cases are usually treated the same - don't tell
                    // the user *why* the login failed, only that it did
                    console.log('Wrong PW or user not found');
                    return res.status(401).send({
                        msg: 'Username or password is incorrect!'
                    });                    
                case reasons.MAX_ATTEMPTS:
                    // send email or otherwise notify user that account is
                    // temporarily locked
                    console.log('max attempts');
                    
                    let transporter = nodemailer.createTransport({
                        /*sendmail: true,
                        newline: 'unix',
                        path: '/usr/sbin/sendmail',                        */

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
                    let message = {
                        from: '"Orchesterdienstplan" no-reply@odp.bicsak.net',
                        to: user.email,
                        subject: "ODP Benutzeraccount vorübergehend gesperrt",
                        text: `Hallo ${user.fn}, 
                        Die Anzahl maximale Loginversuche wurde erreicht. 
                        Dein Bunutzerkonto wurde vorübergehend gesperrt. 
                        Bitte versuche es wenige Stunden später erneut!`,
                        html: `<p>Hallo ${user.fn}, </p>
                         <p>Die Anzahl maximale Loginversuche wurde erreicht. 
                         Dein Bunutzerkonto wurde vorübergehend gesperrt. 
                         Bitte versuche es wenige Stunden später erneut!</p>`
                    };
                    transporter.sendMail(message);                    

                    return res.status(401).send({
                        msg: 'Login failed! max attempts'
                    });
                    break;
            }
        });
    }

    catch (err) {
        return res.status(400).send({
            msg: err
        });
    }

  });


//export this router to use in our index.js
module.exports = router;