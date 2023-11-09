const mongoose = require('mongoose');
const { Schema } = mongoose;

const orchestraSchema = new Schema({
    code: String,   // "HSW"
    fullName: String,   // "Hessisches Staatstheater Wiesbaden"
    location: String,   // "Wiesbaden"
    timezone: String,   // "Europe/Berlin"
    maxDienst: [Number], // [10, 9, 10, 8]; 1st value max, afterwards smaller numbers, max length: 4
    calendar: Boolean, // if calendar-feed is allowed
    venues: [ {
        full: { type: String },
        abbr: { type: String }
    }],   // ["OPR", "Großes Haus", "Kurhaus"]    
    sections: { 
        type: Map,
        of: new Schema(
        {             
            abbr: String, // "Fl"
            name: String,   // "Flöte"
            maxFW: Number,   // default: 1 max allowed FW's per week for this section    
            active: Boolean
        })
    },
    categories: [ 
        {
            subtypes: [String], /* ["OA", "OS", "BO", "VBO", "HP", "GP", "?"], 
            ["Vorst.", "WA", "Prem.", "Konz."], ["Sonst."] */
            suffixes: [String], /* ["OA", "OS", "BO", "VBO", "HP", "GP", ""], 
            ["", "WA", "Premiere", ""], [""] */
            locations: [Number], // [0, 0, 1, 1, 1, 1, 0], [1, 1, 1, 2], [0]
            durations: [Number] // [150, 150, 180, 220, 180, 180, 150], [180, 180, 180, 180], [150]
        }
    ],
    writeLock: Boolean 
} );

module.exports = mongoose.model('Orchestra', orchestraSchema);