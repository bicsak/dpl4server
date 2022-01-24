const mongoose = require('mongoose');
const { Schema } = mongoose;

const orchestraSchema = new Schema({
    code: String,   // "HSW"
    fullName: String,   // "Hessisches Staatstheater Wiesbaden"
    location: String,   // "Wiesbaden"
    timezone: String,   // "GMT + 1..."
    venues: [String],   // ["OPR", "Großes Haus", "Kurhaus"]
    sections: [ 
        { 
            key: String,    // "sec0"
            code: String, // "Fl"
            name: String,   // "Flöte"
            maxFW: Number   // default: 1 max allowed FW's per week for this section    
        } 
    ],
    categories: [ 
        {
            subtypes: [String], /* ["OA", "OS", "BO", "VBO", "HP", "GP"], 
            ["Vorst.", "WA", "Prem.", "Konz."], ["Sonst."] */
            suffixes: [String], /* ["OA", "OS", "BO", "VBO", "HP", "GP"], 
            ["", "WA", "Premiere", ""], [""] */
            locations: [Number], // [0, 0, 1, 1, 1, 1], [1, 1, 1, 2], [0]
            durations: [Number] // [150, 150, 180, 220, 180, 180], [180, 180, 180, 180], [150]
        }
    ]    
});

module.exports = mongoose.model('Orchestra', orchestraSchema);