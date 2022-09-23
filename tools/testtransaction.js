if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
 
const mongoose = require('mongoose');

const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net/test`;
const mongoDBName = "odp_test";

const Dpl = require('../models/dpl');
const Orchestra = require('../models/orchestra');
const Week = require('../models/week');

// Runs the txnFunc and retries if TransientTransactionError encountered
async function runTransactionWithRetry(txnFunc, session) {
    // TODO: limit count retries
    while (true) {
        try {
            await txnFunc(session);  // performs transaction
            break;
        } catch (error) {
            // If transient error, retry the whole transaction
            if ( error.hasOwnProperty("errorLabels") && error.errorLabels.includes("TransientTransactionError")  ) {
                //TODO also in case of VersionError (Mongoose)
                console.log("TransientTransactionError, retrying transaction ...");
                continue;
            } else {                
                throw error;
            }
        }
    }    
}

// Retries commit if UnknownTransactionCommitResult encountered
async function commitWithRetry(session) {
    // TODO: limit count retries
    while (true) {
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
    await runTransactionWithRetry(writeOperation, session);   
    } catch (err) {
        console.log(err);
        // handle the error
    } finally {    
        await session.endSession();         
        await mongoose.connection.close();                
    }
}

run();

// Performs inserts and count in a transaction
async function writeOperation(session) {   
   await session.startTransaction( { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } } );

   try{
        let orch = await Orchestra.findOneAndUpdate( {
            o: new mongoose.Types.ObjectId('632245e7eb6de7ceb1cc7c86'),
        }, { writeLock: {
            action: 'writeOperation',
            ts: new Date(),
            role: 'manager',
            phase: 'start',
            uniqueId: new mongoose.Types.ObjectId()
        } },
        { session: session } );
        
        let weekDoc = await Week.findOneAndUpdate( { 
            o: orch._id,
            begin: new Date('2017-08-27T22:00:00.000+00:00')
        }, {
            editable: false
        }, { session } );

        console.log(weekDoc);

        await Dpl.updateMany( { 
            o: orch.o,
            w: weekDoc._id
        }, {
            weekEditable: true
        }, { session } );

      orch.writeLock =  {
        action: 'writeOperation',
        ts: new Date(),
        role: 'manager',
        phase: 'end',
        uniqueId: new mongoose.Types.ObjectId()
    };
    await orch.save( {session: session} );
   } catch (error) {
      console.log("Caught exception during transaction, aborting.");
      console.log(error);
      await session.abortTransaction();
      throw error;
   }

   await commitWithRetry(session);

} // End of transaction function