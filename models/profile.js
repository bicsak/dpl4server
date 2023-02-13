const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const profileSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },                    
    role: { type: String, enum: ['office', 'musician', 'friend', 'scheduler'] },    
    section: String, // section, not required
    manager: Boolean,
    confirmed: Boolean, // if pending request, false

    user: { type: Schema.Types.ObjectId, ref: 'User' },                    

    email: String, // only for this profile; can be different from user's email; for notifications (PDF with new DPL etc.)
    notifications: { type: Map, of: Boolean},
    /*possible notification keys:         
                enum: [
                    'comment', 
                    'dplNew', 
                    'dplFinal', 
                    'dplChanged', 
                    'dplRejected', 
                    'surveyFailed', 
                    'surveyComplete'
                ]         
    */
    // activePeriods: [ { type: Schema.Types.ObjectId, ref: 'Period' } ]

    userFn: String,
    userSn: String,
    userBirthday: Date
}, {
    toJSON: {
        transform: 
        function(doc, ret, opt) {            
            ret.userBirthday = ret.userBirthday.getTime();
            return ret;
        }
    } 
});

module.exports = mongoose.model('Profile', profileSchema);