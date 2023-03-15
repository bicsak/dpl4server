const mongoose = require( 'mongoose' );
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
//    SALT_WORK_FACTOR = 10,

// these values can be whatever you want - we're defaulting to a
// max of 5 attempts, resulting in a 2 hour lock
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000;

const reasons = {
    NOT_FOUND: 0,
    PASSWORD_INCORRECT: 1,
    MAX_ATTEMPTS: 2
};

const userSchema = new Schema({        
    fn: String, // first name
    sn: String, // surname
    birthday: Date,

    //un: String,    //username
    email: String, // this is the username; also used to contact person if pw forgotten
    pw: String,    //password

    loginAttempts: { type: Number, required: true, default: 0 },
    lockUntil: { type: Number },    
    
    confirmed: Boolean,
    confirmationToken: String, 
    // confirmation token used when user created account

    profiles: [
        {
            //_id = _id of doc in profiles collection
            o: { type: Schema.Types.ObjectId, ref: 'Orchestra'  },
            role: { type: String, enum: ['office', 'musician', 'board', 'scheduler'] },
            manager: { type: Boolean },
            section: { type: String },
            permanentMember: Boolean, // currently permanent employee (festangestellt) - only for musicians
            trial: Boolean, // only for musicians with permanentMember == true
            factor: Number, // 0 < x <= 1, 100%, 50% etc. Vollzeit/Teilzeit
            remark: String, // 'Praktikant'/'ZV bis...'/'festangestellt seit...'
            position: String, // '1. Flöte', 'Solo-Picc','Stimmführer' etc.
        }
    ]
   
}, {
    toJSON: {
        transform: 
        function(doc, ret, opt) {            
            delete ret['pw'];
            delete ret['loginAttempts'];
            delete ret['lockUntil'];
            delete ret['confirmationToken'];
            ret.birthday = ret.birthday.getTime();
            
            return ret;
        }
    } 
});

// expose enum on the model
userSchema.statics.failedLogin = /*{
    NOT_FOUND: reasons.NOT_FOUND,
    PASSWORD_INCORRECT: reasons.PASSWORD_INCORRECT,
    MAX_ATTEMPTS: reasons.MAX_ATTEMPTS
}*/ reasons;


userSchema.virtual('isLocked').get(function() {
    // check for a future lockUntil timestamp
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.methods.comparePassword = function(candidatePassword, cb) { 
    bcrypt.compare(candidatePassword, this.pw, function(err, isMatch) { 
        if (err) return cb(err); cb(null, isMatch); });
};

userSchema.methods.incLoginAttempts = function(cb) { 
    // if we have a previous lock that has expired, restart at 1 
    if (this.lockUntil && this.lockUntil < Date.now()) { 
        return this.updateOne({ 
            $set: { loginAttempts: 1 }, 
            $unset: { lockUntil: 1 } 
        }, cb); 
    } // otherwise we're incrementing 
    let updates = { $inc: { loginAttempts: 1 } }; 
    // lock the account if we've reached max attempts and it's not locked already 
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) { 
        updates.$set = { 
            lockUntil: Date.now() + LOCK_TIME 
        }; 
    } 
    return this.updateOne(updates, cb); 
};

userSchema.statics.getAuthenticated = function(username, password, cb) { 
    this.findOne({ email: username, confirmed: true }, function(err, user) { 
        if (err) return cb(err);
        // make sure the user exists
        if (!user) {
            return cb(null, null, reasons.NOT_FOUND);
        }

        // check if the account is currently locked
        if (user.isLocked) {
            // just increment login attempts if account is already locked
            return user.incLoginAttempts(function(err) {
                if (err) return cb(err);
                return cb(null, user, reasons.MAX_ATTEMPTS);
            });
        }

        // test for a matching password
        user.comparePassword(password, function(err, isMatch) {
            if (err) return cb(err);

            // check if the password was a match
            if (isMatch) {
                // if there's no lock or failed attempts, just return the user
                if (!user.loginAttempts && !user.lockUntil) return cb(null, user);
                // reset attempts and lock info
                var updates = {
                    $set: { loginAttempts: 0 },
                    $unset: { lockUntil: 1 }
                };
                return user.updateOne(updates, function(err) {
                    if (err) return cb(err);
                    return cb(null, user);
                });
            }

            // password is incorrect, so increment login attempts before responding
            user.incLoginAttempts(function(err) {
                if (err) return cb(err);
                return cb(null, null, reasons.PASSWORD_INCORRECT);
            });
        });
    }).populate(/*{
        path: 'profiles.o',
        match: {
            'profiles.activeMember': true
        }
    }*/ 'profiles.o' );
};

module.exports = mongoose.model('User', userSchema);

// sample usage:
/*
User.getAuthenticated('jmar777', 'Password123', function(err, user, reason) {
    if (err) throw err;

    // login was successful if we have a user
    if (user) {
        // handle login success
        console.log('login success');
        return;
    }

    // otherwise we can determine why we failed
    let reasons = User.failedLogin;
    switch (reason) {
        case reasons.NOT_FOUND:
        case reasons.PASSWORD_INCORRECT:
            // note: these cases are usually treated the same - don't tell
            // the user *why* the login failed, only that it did
            break;
        case reasons.MAX_ATTEMPTS:
            // send email or otherwise notify user that account is
            // temporarily locked
            break;
    }
});*/
