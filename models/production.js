const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const productionSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' }, 
    name: String,   
    comment: String, // conductor etc.
    begin: Date, // valid from this date
    duration: Number    
});
  
module.exports = mongoose.model('Production', productionSchema);