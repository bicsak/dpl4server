const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

//index on o, weekBegin
const eventSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },       
    //w: { type: Schema.Types.ObjectId, ref: 'Week' },  
    weekBegin: Date,
    sec: String, // if this event is relevant for scheduler, this is the section whoose scheduler should read it
    /* if <> '', show this event also for scheduler of this section*/
    profiles: [ {type: Schema.Types.ObjectId, ref: 'Profile'} ], // for these profiles interesting
    /* show this event only for these profiles */
    public: Boolean, /* office may see this event also (dpl is public) */
    entity: {
        type: String,
        enum: ['comment', 'dpl', 'dienst', 'week', 'fw', 'dw', 'survey', 'season', 'period']
        //default: 'dpl'
    },
    action: {
        type: String,
        enum: ['new', 'del', 'edit']
        //default: 'inactive'
    },
    extra: String,
    user: { type: Schema.Types.ObjectId, ref: 'Profile'} // the user who caused the event                         
}, {    timestamps: { createdAt: 'created_at' } 
    /*toJSON: {
        transform: function(doc, ret, opt) {
            for ( let i = 0; i < doc.comments.length; i++ ) {
                ret.comments[i].timestamp = doc.comments[i].timestamp.getTime();                
            }
            
            return ret;
        }
    } */
});

module.exports = mongoose.model('Event', eventSchema);