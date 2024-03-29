const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const seatingSchema = new Schema({
    d: Schema.Types.ObjectId, // _id of dienst subdoc in week
    ext: Number, // count helpers extern
    sp: [ Number ], // seating plan; n x
    /**
     * 0: free
     * 1: X
     * 4: * (stand-by)
     * 16: P/V/S
     * 32: A (externe Aushilfe, gezählt)
     * 64, 65, ...: P1/V1/... 64+x
     */
    comment: String, // scheduler's comment
    //suggestions: [ Number ], // -1 for empty field, x in [0..n-1] for + sign by member in row nr. x
    available: [ Boolean ],

    dienstBegin: Date,
    dienstWeight: { type: Number, min: 0, max: 3 },
    dienstInstr: Number // for this section only
}, {
    toJSON: {
        transform: function(doc, ret, opt) {
            if (ret.dienstBegin) ret.dienstBegin = ret.dienstBegin.getTime();

            return ret;
        }
    }
});

const surveySchema = new Schema({
    comment: String, // scheduler's general remark for this survey
    feedbacks: [ {
        row: Number,
        member: { type: Schema.Types.ObjectId, ref: 'Profile' },
        vote: { type: String, enum: ['inactive', 'pending', 'yes', 'no'], default: 'pending' },
        timestamp: Date,
        comment: String // only if answered with no
    } ]
}, {
    toJSON: {
        transform: function(doc, ret, opt) {
            ret.feedbacks.forEach(fb => fb.timestamp = fb.timestamp?.getTime());
            return ret;
        }
    }
});

const officeSurveySchema = new Schema({
    status: {
        type: String,
        enum: ['pending', 'refused', 'confirmed'],
        default: 'pending'
    },
    timestamp: Date,
    editedBy: { type: Schema.Types.ObjectId, ref: 'Profile' }, // only, if refused or confirmed
    reason: String, // only if refused, reason for refusing
    comment: String // initial comment by scheduler
}, {
    toJSON: {
        transform: function(doc, ret, opt) {
            if (ret.timestamp) ret.timestamp = ret.timestamp.getTime();
            return ret;
        }
    }
});


// compound index on o+s+w
const dplSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },
    w: { type: Schema.Types.ObjectId, ref: 'Week' },
    p: { type: Schema.Types.ObjectId, ref: 'Period' },
    periodMembers: [ { type: Schema.Types.ObjectId, ref: 'Profile'} ],
    s: String, // section
    weekBegin: Date,
    weekEditable: Boolean,
    weekSeason: { type: Schema.Types.ObjectId, ref: 'Season' },
    closed: Boolean,
    published: Boolean,
    remark: String, // scheduler's remark
    absent: [ [ {type: Number, min: 0, max: 4} ] ], // represents 1: K (gezählt), 2: ~, 3: U and 4: - (FW) 14 x n       
    correction: [ Number ],
    delta: [ Number ],
    start: [ Number ],
    seatings: [ seatingSchema ],
    officeSurvey: officeSurveySchema, // can be undefined
    groupSurvey: surveySchema, // can be undefined

    version: Number,
    state: Date
}, { 
    collection: 'dpls', 
    optimisticConcurrency: true, 
    timestamps: true,
    toJSON: {
        transform: function(doc, ret, opt) {
            ret.weekBegin = ret.weekBegin.getTime();
            ret.state = ret.state.getTime();

            return ret;
        }
    } 
});

dplSchema.method('calcDelta', /*async*/ function () {
    //if ( !this.populated('p') ) await this.populate('p'); 
    if (!this.delta) return;
    let size = this.delta.length;
    //this.p.members.length;
    let newDelta = Array(size).fill(0);

    for ( let i = 0; i < size; i++ ) {
        newDelta[i] = this.seatings.reduce( 
            (total,spObj) => ( spObj.sp[i] >= 16 ? total + spObj.dienstWeight : total ), 0 )  /* *this.p.members[i].factor */;
    }

    this.delta = newDelta; 
    //await this.save();
});

dplSchema.virtual('end').get( function () {
   return this.delta.map( (num, idx) => this.start[idx] + num + this.correction[idx] );
});

module.exports = mongoose.model('Dpl', dplSchema);