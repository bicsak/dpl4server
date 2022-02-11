const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const seatingSchema = new Schema({
    d: Schema.Types.ObjectId, // _id of dienst subdoc in week
    ext: Number, // count helpers extern
    sp: [ Number ], // seating plan; n x
    /**
     * 0: free
     * 1: X
     * 8: * (stand-by)
     * 16: P/V/S
     * 32: A (externe Aushilfe, gezählt)
     * 64, 65, ...: P1/V1/... 64+x
     */
    comment: String, // scheduler's comment
    suggestions: [ Number ], // -1 for empty field, x in [0..n-1] for + sign by member in row nr. x

    dienstBegin: Date,
    dienstWeight: { type: Number, min: 0, max: 3 },
    dienstInstr: Number // for this section only
});

const surveySchema = new Schema({
    comment: String //TODO etc. etc.
    //TODO group survey    
});


// compound index on o+s+w
const dplSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },
    w: { type: Schema.Types.ObjectId, ref: 'Week' },
    p: { type: Schema.Types.ObjectId, ref: 'Period' },
    s: String, // section
    weekBegin: Date,
    weekEditable: Boolean,
    closed: Boolean,
    remark: String, // scheduler's remark
    absent: [ {
        am: [ {type: Number, min: 0, max: 4} ],
        pm: [ {type: Number, min: 0, max: 4} ]
    } ], // represents 1: K (gezählt), 2: ~, 3: U and 4: - (FW) 7 x n
    correction: [ Number ],
    delta: [ Number ],
    start: [ Number ],
    seatings: [ seatingSchema ],
    officeSurvey: {
        status: {
            type: String,
            enum: ['inactive', 'pending', 'refused', 'confirmed'],
            default: 'inactive'
        },
        timestamp: Date,
        comment: String 
    },
    groupSurvey: surveySchema  // TODO   
}, { collection: 'dpls', optimisticConcurrency: true, timestamps: true });

dplSchema.method('calcDelta', async function () {
    if ( !this.populated('p') ) await this.populate('p'); 
    let size = this.p.members.length;
    let newDelta = Array(size).fill(0);

    for ( let i = 0; i < size; i++ ) {
        newDelta[i] = this.seatings.reduce( 
            (total,spObj) => ( spObj.sp[i] >= 16 ? total + spObj.dienstWeight : total ), 0 ) 
            * this.p.members[i].factor;
    }

    this.delta = newDelta;    
});

dplSchema.virtual('end').get( function () {
   return this.delta.map( (num, idx) => num + this.correction[idx] );
});

module.exports = mongoose.model('Dpl', dplSchema);