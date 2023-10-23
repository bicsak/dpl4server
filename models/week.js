const mongoose = require('mongoose');
const { DateTime, Interval } = require("luxon");

const { Schema } = mongoose;

const dienstSchema = new Schema({    
    name: String,
    begin: Date,
    col: { type: Number, min: 0, max: 13 }, // to which column this dienst belongs to; calculated upn beginning time
    prod: { type: Schema.Types.ObjectId, ref: 'Production' },
    category: { type: Number, min: 0, max: 2 },
    subtype: { type: Number, min: 0, max: 6 },
    suffix: String,
    weight: { type: Number, min: 0, max: 3 },
    duration: Number, // or undefined for auto duration calculation    
    location: { // or undefined for auto location detection
        full: String, //{ type: String }, 
        abbr: String //{ type: String }
    },
    instrumentation: { type: Map, of: Number },
    comment: String, // by manager (for example: Kleiderordnung, Anspielprobe etc.)
    seq: Number, // -1 for exluded, 0: not calculated, 1..n
    total: Number // total of performances/rehearsals this kind in the season
}, {
    toJSON: {
        transform: function(doc, ret, opt) {
            ret.begin = ret.begin.getTime();

            return ret;

        }
    }
});

const weekSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },
    season: { type: Schema.Types.ObjectId, ref: 'Season' },
    begin: Date,
    editable: Boolean,
    remark: String, // orch.manager's comment
    dpls: { 
        type: Map,
        of: new Schema( // undefined, if dpl for the section does not exist yet
            {
                closed: Boolean, 
                published: Boolean,
                dplRef: {
                    type: Schema.Types.ObjectId,
                    ref: 'Dpl'
                },
                officeSurvey: {
                    type: String,
                    enum: ['pending', 'refused', 'confirmed'],
                    default: 'pending'
                } 
            } )        
        },
    dienst: [ dienstSchema ],    
}, { 
    optimisticConcurrency: true, 
    timestamps: true,
    toJSON: {
        transform: function(doc, ret, opt) {            
            if (ret.begin) ret.begin = ret.begin.getTime();

            return ret;
        }
    }
 });

weekSchema.virtual('dw').get(async function() {
    //season and o must be populated!
    if ( !this.populated('season') ) await this.populate('season');
    if ( !this.populated('o') ) await this.populate('o');        
    return Interval.fromDateTimes(
        DateTime.fromJSDate(this.season.begin, { zone: this.o.timezone } ), 
        DateTime.fromJSDate(this.begin , { zone: this.o.timezone } )
        ).length('weeks') + 1;    
});

weekSchema.virtual('dwTotal').get(async function() {
    //season and o must be populated!
    if ( !this.populated('season') ) await this.populate('season');
    if ( !this.populated('o') ) await this.populate('o');        
    return Interval.fromDateTimes(
        DateTime.fromJSDate(this.season.begin, { zone: this.o.timezone } ), 
        DateTime.fromJSDate(this.season.end , { zone: this.o.timezone } )
        ).length('weeks');    
});

weekSchema.virtual('cw').get(async function() {    
    // field o has to be populated!
    if ( !this.populated('o') ) await this.populate('o');

    return DateTime.fromJSDate(this.begin , { zone: this.o.timezone } ).weekNumber;
});

module.exports = mongoose.model('Week', weekSchema);