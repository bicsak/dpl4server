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
    category: { type: Number, min: 0, max: 2 },
    subtype: { type: Number, min: 0, max: 6 },
    suffix: String, // only for non-standard rehearsal types (like BM, Aufnahme KHP etc.)
    weight: { type: Number, min: 0, max: 3 },
    instrumentation: { type: Map, of: Number },
    seq: Number, // 0: not calculated (not shown), otherwise >= 1 - if total == -1, set manually
    total: Number // total of performances/rehearsals this kind in the season
    /* -1 for excluded dienste (ignored for the calculation) */
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