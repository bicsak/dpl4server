const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

const seasonSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },
    label: String,
    begin: Date,
    end: Date,
    comment: String
}, {
  toJSON: {
    transform: function(doc, ret, opt) {
      ret.begin = ret.begin.getTime();
      ret.end = ret.end.getTime();

      return ret;
    }
  }
});

seasonSchema.virtual('dienste', {
    ref: 'DienstExtRef',
    localField: '_id',
    foreignField: 'season'
  });
  
module.exports = mongoose.model('Season', seasonSchema);