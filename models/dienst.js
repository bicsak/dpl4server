const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

// Extended Reference model for dienst subdocuments in week docs
// for typeahead and OA1, 2,... counting
// compund index on o+name+begin
const dienstExtRefSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },        
    season: { type: Schema.Types.ObjectId, ref: 'Season' },
    w: { type: Schema.Types.ObjectId, ref: 'Week' },
    prod: { type: Schema.Types.ObjectId, ref: 'Production' },
    name: String,
    begin: Date,
    col: { type: Number, min: 0, max: 13 }, // to which column this dienst belongs to; calculated depending on begin's time
    category: { type: Number, min: 0, max: 2 },
    subtype: { type: Number, min: 0, max: 6 },
    suffix: String, // only for non-standard rehearsal types (like BM, Aufnahme KHP etc.)
    weight: { type: Number, min: 0, max: 3 },
    instrumentation: { type: Map, of: Number },
    seq: Number, // <1: not calculated, if <0, show abs(seq), otherwise >= 1
    total: Number, // total of performances/rehearsals this kind in the season    
    comment: String, // manager's comment on this dienst; same as in week collection
    duration: Number, // or undefined for auto duration calculation    
    location: { // or undefined for auto location detection
        full: String, //{ type: String }, 
        abbr: String //{ type: String }
    },
}, { collection: 'dienst',
    toJSON: {
        transform: function(doc, ret, opt) {
            if (ret.begin) ret.begin = ret.begin.getTime();

            return ret;
        }
    }
}
);

module.exports = mongoose.model('DienstExtRef', dienstExtRefSchema);