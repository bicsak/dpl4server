const mongoose = require( 'mongoose' );
const { Schema } = mongoose;

//index on o, w
const notificationSchema = new Schema({
    o: { type: Schema.Types.ObjectId, ref: 'Orchestra' },       
    w: { type: Schema.Types.ObjectId, ref: 'Week' },  
    p: { type: Schema.Types.ObjectId, ref: 'Period' },
    event: {
        type: String,
        enum: ['reactComment', 'newComment', 'delComment', 'fw', 'dw', 'newDpl']
        //default: 'inactive'
    }           
    /*dplPeriod: { type: Schema.Types.ObjectId, ref: 'Period' },            
    weekBegin: Date,
    periodMembers: [ {        
        prof: { type: Schema.Types.ObjectId, ref: 'Profile' },            
        row: Number,
        canComment: Boolean
    } ]*/    
}, {    timestamps: { createdAt: 'created_at' } 
    /*toJSON: {
        transform: function(doc, ret, opt) {
            for ( let i = 0; i < doc.comments.length; i++ ) {
                ret.comments[i].timestamp = doc.comments[i].timestamp.getTime();                
            }
            
            return ret;
        }
    } */
});

module.exports = mongoose.model('Notification', notificationSchema);