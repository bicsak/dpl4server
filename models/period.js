const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const periodSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },    
    s: String, // section
    begin: Date,
    members: [ 
        {
            u: Schema.Types.ObjectId, // _id of user
            initial: String,
            row: Number,
            start: Number,
            factor: Number
        } 
    ], 
    //weeks: [ Schema.Types.ObjectId ]        
}, { optimisticConcurrency: true });

module.exports = mongoose.model('Period', periodSchema);