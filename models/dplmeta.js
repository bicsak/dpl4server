const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const dplMetaSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },       
    dpl: { type: Schema.Types.ObjectId, ref: 'Dpl' },            
    dplPeriod: { type: Schema.Types.ObjectId, ref: 'Period' },            
    weekBegin: Date,
    periodMembers: [ {        
        prof: { type: Schema.Types.ObjectId, ref: 'Profile' },            
        row: Number,
        canComment: Boolean
    } ],
    comments: [ {
        message: String,
        prof: { type: Schema.Types.ObjectId, ref: 'Profile' }, // _id of user profile doc
        user: { type: Schema.Types.ObjectId, ref: 'User' }, // _id of user doc        
        userFn: String, // data from users collection, not updated, only at the moment when comment was created
        userSn: String,
        feedback: [ {type: Number, min: 0, max: 10} ], // reactions of the section to the comment 
        // 0: not yet answered, 1: smile, 2: ok, 3: not agree etc.
        timestamp: Date,
        deleted: Boolean, 
        row: Number // row index of member in group if comment is written by scheduler, -1
        /* Schedulers that are part of the group can choose which profile they use for commenting */
    } ]
}, {     
    toJSON: {
        transform: function(doc, ret, opt) {
            for ( let i = 0; i < doc.comments.length; i++ ) {
                ret.comments[i].timestamp = doc.comments[i].timestamp.getTime();                
            }
            
            return ret;
        }
    } 
});

module.exports = mongoose.model('DplMeta', dplMetaSchema);