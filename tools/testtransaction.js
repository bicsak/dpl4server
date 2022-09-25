if (process.env.NODE_ENV !== 'production') { require('dotenv').config(); } 
const mongoose = require('mongoose');
const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net/test`;
const mongoDBName = "odp_test";
const Dpl = require('../models/dpl');
const Orchestra = require('../models/orchestra');
const Week = require('../models/week');

const o = new mongoose.Types.ObjectId('632245e7eb6de7ceb1cc7c86');

// Runs the txnFunc and retries if TransientTransactionError encountered
async function runTransactionWithRetryAndOrchLock(params 
    /* txnFunc, txnName, role, o, session */) {
    let retryCount = 0;
    
    while ( retryCount < 10 ) {
        retryCount++;
        try {
            console.log(`${retryCount}. try...`);
            await params.session.startTransaction( { 
                readConcern: { level: /*"snapshot"*/ "majority" }, 
                writeConcern: { w: "majority" } 
            } );
            let orch = await Orchestra.findOneAndUpdate( {
                o: params.o,
            }, { writeLock: {
                txn: params.txnName,
                ts: new Date(),
                role: params.role,
                action: 'lock',
                uniqueId: new mongoose.Types.ObjectId()
            } }, { session: params.session } );

            //let oldOrch = await Orchestra.findById(orch._id);
            
            await params.txnFunc(params.session);  // performs transaction
            
            orch.writeLock =  {
                txn: params.txnName,
                ts: new Date(),
                role: params.role,
                action: 'release',
                uniqueId: new mongoose.Types.ObjectId()
            }; 
            await orch.save( {session: params.session} );

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
            await params.session.abortTransaction();            
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
    await commitWithRetry(params.session);       
}

// Retries commit if UnknownTransactionCommitResult encountered
async function commitWithRetry(session) {
    let retryCount = 0;

    while ( retryCount < 10 ) {
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
        /* await */ mongoose.connect(`${mongoUri}`, {
            dbName: mongoDBName,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        // Start a session
        var session =  await mongoose.connection.startSession( { 
            readPreference: { mode: "primary" } } );                
        await runTransactionWithRetryAndOrchLock({
            o: o,
            session: session,
            txnFunc: changeEditable,
            txnName: 'changeEditable',
            role: 'manager'
        });           
    } catch (err) {
        console.log(err);
        // handle the error
    } finally {    
        await session.endSession();         
        await mongoose.connection.close();                
    }
}

// Performs write operations in a transaction
async function changeEditable( session ) {              
    let weekDoc = await Week.findOneAndUpdate( { 
        o: o,
        begin: new Date('2017-08-27T22:00:00.000+00:00')
    }, {
        editable: false
    }, { session: session } );    

    await Dpl.updateMany( { 
        o: o,
        w: weekDoc._id
    }, {
        weekEditable: true
    }, { session: session } );   
} // End of transaction function

run();