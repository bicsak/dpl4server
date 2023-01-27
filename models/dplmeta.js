const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const dplMetaSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },       
    dpl: { type: Schema.Types.ObjectId, ref: 'Dpl' },            
    dplPeriod: { type: Schema.Types.ObjectId, ref: 'Period' },            
    periodMembers: [ {        
        prof: { type: Schema.Types.ObjectId, ref: 'Profile' },            
        row: Number,
        canWish: Boolean
    } ],
    comments: [ {
        message: String,
        prof: { type: Schema.Types.ObjectId, ref: 'Profile' }, // _id of user profile
        // Deprecated, no more stored: email: [ Boolean ],
        feedback: [ {type: Number, min: -1, max: 2} ], // reactions of the section to the comment 
        // -1: not asked, 0: ?, 1: ok, 2: not agree
        timestamp: Date,
        deleted: Date, // not required if undefined, message is not deleted, otherwise ts of deleting
        row: Number // row index of member in group if comment is written by scheduler, -1
        /* Schedulers that are part of the group can choose which profile they use for commenting */
    } ]
});

module.exports = mongoose.model('DplMeta', dplMetaSchema);