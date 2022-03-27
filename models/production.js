const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const productionSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' }, 
    name: String, 
    comment: String, // Musikalische Leitung, Regisseur, Konzertprogramm etc.    
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