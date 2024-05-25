/*****************************************************************************
 * Backup Tool Prod DB -> Test DB                                            *
 * copy all collections from source db (prod environment) to test db         *
 * reset all pw's and email adresses                                         *
******************************************************************************/
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
  
const bcrypt = require('bcryptjs');  
const { MongoClient } = require( 'mongodb' );

const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net/test`;
const client = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
      
async function copyCollections(config) {
    try {                    

        let dbCollections = [
            'orchestras', 'seasons', 'users', 
            'profiles', 'periods', 'weeks', 'dpls', 
            'dplmetas', 'dienst', 'productions', 'events'];

        await client.connect();               
        
        let copyData = async function(collections) {   

            // copy collections             
             await collections.forEach(async coll => {
                const currColl = client.db(config.sourceDb).collection(config.sourcePref+coll);                
                
                //await client.db(config.destDb).collection(config.destPref+coll).drop();

                const pipeline = [
                    {  $match: {} }, {
                        $out: {                        
                            db: config.destDb,
                            coll: config.destPref+coll                        
                        }
                    } 
                ];
                
                // Execute the aggregation
                console.log(`Copying collection ${config.sourcePref+coll} from Db ${config.sourceDb} to ${config.destPref+coll} in ${config.destDb}...`);
                await currColl.aggregate(pipeline).toArray();       
             });            

            if ( config.newPw ) {
                // reset pw                
                await client.db(config.destDb).collection(config.destPref+'users').updateMany({}, {
                    $set: {
                        pw: config.newPw
                    }
                });                
            }
            if ( config.newEmail ) {
                //reset email                
                await client.db(config.destDb).collection(config.destPref+'profiles').updateMany({}, {
                    $set: {
                        email: config.newEmail
                    }
                });                
            }
        }
        await copyData(dbCollections);
        
        //Creating indexes on the new collections        
        const destDatabase = client.db(config.destDb);       
            
        await destDatabase.collection(config.destPref+"orchestras").createIndex( { code: 1 }, { unique: true } );
        await destDatabase.collection(config.destPref+"orchestras").createIndex( { fullName: 1 }, { unique: true } );
        await destDatabase.collection(config.destPref+"users").createIndex( { email: 1 }, { unique: true } );
        await destDatabase.collection(config.destPref+"profiles").createIndex( { user: 1, o: 1, role: 1, section: 1 }, { unique: true } );
        await destDatabase.collection(config.destPref+"periods").createIndex( { o: 1, s: 1, begin: 1 }, { unique: true });
        await destDatabase.collection(config.destPref+"dplmetas").createIndex( { o: 1, dpl: 1 }, { unique: true });       
        await destDatabase.collection(config.destPref+"seasons").createIndex( { o: 1, begin: 1 }, { unique: true });
        await destDatabase.collection(config.destPref+"seasons").createIndex( { o: 1, label: 1 }, { unique: true });
        await destDatabase.collection(config.destPref+"weeks").createIndex( { o: 1, begin: 1 }, { unique: true });
        await destDatabase.collection(config.destPref+"dpls").createIndex( { o: 1, s:1, weekBegin: 1 }, { unique: true });
        await destDatabase.collection(config.destPref+"dienst").createIndex( { o: 1, begin: 1 });
        await destDatabase.collection(config.destPref+"productions").createIndex( { o: 1, name: 1 });        
        await destDatabase.collection(config.destPref+"events").createIndex( { o: 1, weekBegin: 1 });
        
    }      
    catch ( err ) {
        console.log(err);
        // handle the error
    } 
    finally {                
        await client.close();
    }
}




// creating a hash for pw
bcrypt.hash("testbetrieb", 10, async (err, hash) => {
    if (err) {
        console.log("bcrypt error");
    } else {    
        await copyCollections( {
            newPw: hash, 
            newEmail: "bicsak@gmx.net", 
            sourceDb: "odp_production",
            destDb: "odp_test",
            sourcePref: "",
            destPref: "backup_"
        } ).catch(console.dir);
    }
});
  
  