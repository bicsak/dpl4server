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
        let splitted = req.body.username.split('/', 2);        
        if ( splitted.length < 2 ) {
            splitted.push(splitted[0]);
            splitted[0] = 'HSW';
        } else splitted[0] = splitted[0].toUpperCase();
        //console.log(splitted);
        let orchestra = await Orchestra.findOne( { code: splitted[0] } );
        //console.log(orchestra);
        if ( !orchestra ) {
            return res.status(401).send( {
                msg: 'No orchestra found!'
            } );
        }  
        
        User.getAuthenticated(orchestra.id, splitted[1], req.body.password, function(err, user, reason) {
            if (err) throw err;
        
            // login was successful if we have a user
            if (user && reason !== User.failedLogin.MAX_ATTEMPTS) {
                // handle login success
                console.log('login success');
                const token = jwt.sign( {
                    un: user.un,
                    uid: user.id,
                    r: user.role,
                    m: user.manager,
                    sch: user.scheduler,
                    o: user.o,
                    s: user.s
                }, process.env.JWT_PASS, { expiresIn: '1h' } );
                
                return res.status(200).send({                    
                    token,
                    user: user,
                    orchestra: orchestra
                });
                return;
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
                    break;
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