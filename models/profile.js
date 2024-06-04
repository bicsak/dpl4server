const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const profileSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },                    
    role: { type: String, enum: ['office', 'musician', 'board', 'scheduler'] }, 
    /****
     * scheduler (=Diensteinteiler) and board (=Orchestervorstand) must also have a musician profile 
     * exactly one user with office (=Orchesterbüro) profile must be manager (=Orchesterdirektor)
     * */   
    section: String, // section, not required
    manager: Boolean,
    intendedManager: Boolean, // if should be new manager
    confirmed: Boolean, // if pending request, false
    permanentMember: Boolean, // currently permanent employee (festangestellt) - only for musicians
    trial: Boolean, // only for musicians with permanentMember == true
    factor: Number, // 0 < x <= 1, 100%, 50% etc. Vollzeit/Teilzeit
    remark: String, // 'Praktikant'/'ZV bis...'/'festangestellt seit...'
    position: String, // '1. Flöte', 'Solo-Picc','Stimmführer' etc.

    user: { type: Schema.Types.ObjectId, ref: 'User' },                    

    lastVisitedHome: Date, // ts for last call for events from this profile

    email: String, // only for this profile; can be different from user's email; for notifications (PDF with new DPL etc.)
    notifications: { type: Map, of: Boolean},    

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