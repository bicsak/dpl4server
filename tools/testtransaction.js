if (process.env.NODE_ENV !== 'production') { require('dotenv').config(); } 
const mongoose = require('mongoose');
const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net/test`;
const mongoDBName = "odp_test";
const Dpl = require('../models/dpl');
const Orchestra = require('../models/orchestra');
const Week = require('../models/week');

const o = new mongoose.Types.ObjectId('632245e7eb6de7ceb1cc7c86');

// Runs the txnFunc and retries if TransientTransactionError encountered
async function runTransactionWithRetryAndOrchLock(txnFunc, name, role, o, session) {
    let retryCount = 0;
    
    while ( retryCount < 3 ) {
        retryCount++;
        try {
            console.log(`${retryCount}. try...`);
            await session.startTransaction( { 
                readConcern: { level: /*"snapshot"*/ "majority" }, writeConcern: { w: "majority" } 
            } );
            let orch = await Orchestra.findOneAndUpdate( {
                o: o,
            }, { writeLock: {
                action: name,
                ts: new Date(),
                role: role,
                phase: 'start',
                uniqueId: new mongoose.Types.ObjectId()
            } }, { session: session } );

            //let oldOrch = await Orchestra.findById(orch._id);
            
            await txnFunc(session);  // performs transaction
            
            orch.writeLock =  {
                action: name,
                ts: new Date(),
                role: role,
                phase: 'end',
                uniqueId: new mongoose.Types.ObjectId()
            }; 
            await orch.save( {session: session} );

            /*oldOrch.writeLock = {
                action: name,
                ts: new Date(),
                role: role,
                phase: 'middle',
                uniqueId: new mongoose.Types.ObjectId()
            }; 
            if (retryCount < 2 ) await oldOrch.save( {session: session});*/
            break;
        } catch (error) {
            console.log("Caught exception during transaction, aborting.");
            console.log(error);            
            await session.abortTransaction();            
            // If transient error, retry the whole transaction
            if ( error.hasOwnProperty("errorLabels") && error.errorLabels.includes("TransientTransactionError") 
            || error instanceof mongoose.Error.VersionError ) {                
                console.log("Transient error, retrying transaction ...");
                continue;
            } else {                
                throw error;
            }
        }
    } 
    await commitWithRetry(session);       
}

// Retries commit if UnknownTransactionCommitResult encountered
async function commitWithRetry(session) {
    let retryCount = 0;

    while ( retryCount < 3 ) {
        retryCount++;
        try {
            await session.commitTransaction(); // Uses write concern set at transaction start.
            console.log("Transaction committed.");
            break;
        } catch (error) {
            // Can retry commit
            if (error.hasOwnProperty("errorLabels") && error.errorLabels.includes("UnknownTransactionCommitResult") ) {
                console.log("UnknownTransactionCommitResult, retrying commit operation ...");
                continue;
            } else {
                console.log("Error during commit ...");
                throw error;
            }
       }
    }
}

async function run() {
    try {
        mongoose.connection.on('connected', () => {
            console.log('Mongoose connected to DB Cluster');
        });
        mongoose.connection.on('error', (error) => {
            console.error(error.message);
        });
        mongoose.connection.on('disconnected', () => {
            console.log('Mongoose Disconnected');
        });
        await mongoose.connect(`${mongoUri}`, {
            dbName: mongoDBName,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        // Start a session
        var session = await mongoose.connection.startSession( { readPreference: { mode: "primary" } } );                
        await runTransactionWithRetryAndOrchLock(changeEditable, 'changeEditable', 'manager', 
        o, session);   
        
    } catch (err) {
        console.log(err);
        // handle the error
    } finally {    
        await session.endSession();         
        await mongoose.connection.close();                
    }
}

// Performs write operations in a transaction
async function changeEditable(session) {              
    let weekDoc = await Week.findOneAndUpdate( { 
        o: o,
        begin: new Date('2017-08-27T22:00:00.000+00:00')
    }, {
        editable: false
    }, { session } );    

    await Dpl.updateMany( { 
        o: o,
        w: weekDoc._id
    }, {
        weekEditable: true
    }, { session } );   
} // End of transaction function

run();