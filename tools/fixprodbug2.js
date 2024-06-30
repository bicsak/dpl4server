/*******************************************************************************
 * Bug fix tool                                                                *
 * production instrumentation for all sections, not only for flute and bassoon *
********************************************************************************/
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
  
const MongoClient = require( 'mongodb' ).MongoClient;
const ObjectID = require( 'mongodb' ).ObjectID;

const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net`;
const client = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
      
async function fixBug(config) {
    try {                    

        await client.connect();  
                
        await client.db(config.db).collection('productions').updateMany({
            'instrumentation.sec0': undefined }, {
            $set: {
                'instrumentation.sec0': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec1': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec2': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec3': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec4': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec6': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec7': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec9': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec10': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec11': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec12': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec13': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec14': {count: 0, extra: '', _id: new ObjectID()},
                'instrumentation.sec15': {count: 0, extra: '', _id: new ObjectID()},                    
            }
        });                                                        
    }      
    catch ( err ) {
        console.log(err);
        // handle the error
    } 
    finally {                
        await client.close();
    }
}

fixBug( {    
    db: "odp_production"    
    //db: "odp_test"    
} );

  
  