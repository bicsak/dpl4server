const mongoose = require('mongoose');
const { DateTime, Interval } = require("luxon");

const { Schema } = mongoose;

const dienstSchema = new Schema({    
    name: String,
    begin: Date,
    category: { type: Number, min: 0, max: 2 },
    subtype: { type: Number, min: 0, max: 5 },
    weight: { type: Number, min: 0, max: 3 },
    duration: Number, // or undefined for auto duration calculation
    location: String, // or undefined for auto location detection
    instrumentation: { type: Map, of: Number },
    comment: String, // by manager (for example: Kleiderordnung, Anspielprobe etc.)
    seq: Number, // -1 for exluded, 0: not calculated, 1..n
    total: Number // total of performances/rehearsals this kind in the season
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
                officeSurvey: {
                    type: String,
                    enum: ['inactive', 'pending', 'refused', 'confirmed'],
                    default: 'inactive'
                } 
            } )        
        },
    dienst: [ dienstSchema ],    
}, { optimisticConcurrency: true, timestamps: true });

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