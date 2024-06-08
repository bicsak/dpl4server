/*****************************************************************************
 * Bug fix tool                                                              *
******************************************************************************/
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
  
const { MongoClient } = require( 'mongodb' );

const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net`;
const client = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
      
async function fixBug(config) {
    try {                    

        const problemProductions = [
            'Grand Macabre', 'Salon Strozzi', 'Fantasio', 
            '1. Siko', 'Mitten im Klang'];

        await client.connect();  
        
        for ( let i = 0; i < problemProductions.length; i++ ) {
            await client.db(config.db).collection('productions').updateMany({name: problemProductions[i]}, {
                $set: {
                    weight: 1
                }
            });
            await client.db(config.db).collection('dienst').updateMany({name: problemProductions[i]}, {
                $set: {
                    weight: 1
                }
            });
            await client.db(config.db).collection('weeks').updateMany(
                { 'dienst.name': problemProductions[i] }, 
                { $set: { 'dienst.$[elem].weight': 1 } },
                { "arrayFilters": [{ "elem.name": problemProductions[i] }], "multi": true }
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
    db: "odp_production",    
} );

  
  