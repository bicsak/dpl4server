const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const periodSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },    
    next: { type: Schema.Types.ObjectId, ref: 'Period' },    
    nextPBegin: Date,    
    isOpenEnd: Boolean,    
    s: String, // section
    begin: Date,
    comment: String, // general comment for this dp 'XY Elternzeitvertretung, NN in Ruhestand gegengen etc.'
    members: [ 
        {
            prof: { type: Schema.Types.ObjectId, ref: 'Profile' }, // _id of user
            initial: String,
            row: Number,
            start: Number,
            factor: Number,
            canComment: Boolean, // this member can write comments in this period
            canWish: Boolean, // this member can save dw/fw in this period
            comment: String // 'Zeitvertrag von ... bis...'
        } 
    ], 
    //weeks: [ Schema.Types.ObjectId ]        
}, { 
    //optimisticConcurrency: true,
    toJSON: {
        transform: function(doc, ret, opt) {
            ret.begin = ret.begin.getTime();
            if (ret.nextPBegin) ret.nextPBegin = ret.nextPBegin.getTime();

            return ret;
        }
    }
 });

module.exports = mongoose.model('Period', periodSchema);