const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const dplMetaSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },       
    dpl: { type: Schema.Types.ObjectId, ref: 'Dpl' },        
    //TODO log: {},
    comments: [ {
        message: String,
        prof: { type: Schema.Types.ObjectId, ref: 'Profile' }, // _id of user
        // Deprecated, no more stored: email: [ Boolean ],
        reactions: [ {type: Number, min: -1, max: 2} ], // reactions of the section to the comment 
        // -1: not asked, 0: ?, 1: ok, 2: not agree
        timestamp: Date,
        deleted: Boolean
    } ]
});

module.exports = mongoose.model('DplMeta', dplMetaSchema);