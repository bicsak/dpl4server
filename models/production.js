const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const productionSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' }, 
    name: String, 
    comment: String, // Musikalische Leitung, Regisseur, Konzertprogramm etc. 
    extra: String, // optional, extra instruments (Celesta, Harp, Alt-Saxofon etc.)   
    instrumentation: {
        type: Map,
        of: new Schema(
        {             
            count: Number, // 4
            extra: String // "3. auch Picc." / "E.H" etc.
        })
    }, // template instrumentation. Dienst-Besetzung kann abweichen!
    // TODO weight: Number, // template weight. only for generating new "dienst". Each Dienst can separately overwrite weight
    firstDienst: { type: Schema.Types.ObjectId, ref: 'DienstExtRef' },
    lastDienst: { type: Schema.Types.ObjectId, ref: 'DienstExtRef' },    
    duration: Number // optional, only if duration is specified for this prod
});

productionSchema.virtual('dienste', {
    ref: 'DienstExtRef',
    localField: '_id',
    foreignField: 'prod'
});
   
module.exports = mongoose.model('Production', productionSchema);