/*******************************************************************************
 * Bug fix tool                                                                *
 * dienst instrumentation for all sections, not only for flute and bassoon.    *
 * Dienst that have been created from early prod template before bug fix       *
********************************************************************************/
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
  
const MongoClient = require( 'mongodb' ).MongoClient;

const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net`;
const client = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
      
async function fixBug(config) {
    try {                    

        await client.connect();  

        for ( let i = 0; i < 16; i++ ) {            
            let setObj = {}; let filterObj = {};
            setObj['seatings.$[elem].available'] = [false, false, false, false];
            filterObj['elem.available'] = [];
            /*await client.db(config.db).collection('productions').updateMany(
                {}, 
                { $set: { 'dienst.$[elem].instrumentation.sec0': 0 } },
                { arrayFilters: [ { 'elem.instrumentation.sec0': {$exists: false} } ] }
            );*/                                                        
            await client.db(config.db).collection('dpls').updateMany(
                {}, 
                { $set: setObj },
                { arrayFilters: [ filterObj ] }
            );

        }
        
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
    //db: "odp_production"    
    db: "odp_test"    
} );

  
  