const Orchestra = require('../models/orchestra');
var app = require('../server');

const { setTimeout } = require('timers/promises');

const maxRetry = 5;
const retryDelay = 200;

exports.writeOperation = async function ( orch, txnFunc, params ) {        
    /**************
     * @params
     * orch: the orchestra to lock
     * txnFunc: the function to call in a transaction
     * params: params for txnFunc
     */    
    let retryCount = 0;
    let orchDoc;
    let session = app.get('session');

    // 1st step: try to lock the orchestra
    while ( !orchDoc && retryCount < maxRetry ) {
        console.log('Try to get write lock for orchestra...');
        orchDoc = await Orchestra.findOneAndUpdate( {
            o: orch,
            writeLock: false
        }, { writeLock: true }, { returnDocument: 'after', session: session } );     
        if ( !orchDoc ) {
            await setTimeout(retryDelay + Math.random() * 100);
            retryCount++;            
        }
    }
    if ( !orchDoc ) return {
        statusCode: 423, message: 'Could not get orchestra lock for write operation'
    }; // could not get write Lock, exit

    //2nd step: start transaction and run txnFnc
    let result;
    try {
        result = await runTransactionWithRetryAndOrchLock( txnFunc, params, session );
    }
    catch ( err ) {
        console.log(err);
        result = {
            statusCode: 500,
            message: err
        }
    } 
    finally {
        orchDoc.writeLock = false;
        await orchDoc.save();
        console.log('Write lock for orchestra released');
    }   

    return result;    
}

// Runs the txnFunc and retries if TransientTransactionError encountered
/***********
 * @params 
 * txnFunc the function to run within a transaction
 * params params for txnFunc
 * session: session object within to run the transaction
 */
runTransactionWithRetryAndOrchLock = async function ( txnFunc, params, session  ) {
    let retryCount = 0;
    
    while ( retryCount < maxRetry ) {
        retryCount++;
        try {
            console.log('Try transaction...');
            await session.startTransaction( { 
                readConcern: { level: /*"snapshot"*/ "majority" }, 
                writeConcern: { w: "majority" } 
            } );
            
            var result = await txnFunc(session, params);  // performs transaction                                                
            break;
        } catch (error) {
            console.log("Caught exception during transaction, aborting.");
            console.log(error);            
            await session.abortTransaction();            
            // If transient error, retry the whole transaction
            if ( error.hasOwnProperty("errorLabels") && error.errorLabels.includes("TransientTransactionError") 
            && retryCount < maxRetry
            /* || error instanceof mongoose.Error.VersionError*/ ) {                
                console.log("Transient error, retrying transaction ...");
                continue;
            } else {                
                throw error;
            }
        }
    } 
    await commitWithRetry(session);       
    return result;
 }
 
 // Retries commit if UnknownTransactionCommitResult encountered
 async function commitWithRetry(session) {
    let retryCount = 0;
 
    while ( retryCount < maxRetry ) {
        retryCount++;
        try {
            console.log('Commiting transaction...');
            await session.commitTransaction(); // Uses write concern set at transaction start.
            console.log(`Transaction committed.`);
            break;
        } catch (error) {
            // Can retry commit
            if (error.hasOwnProperty("errorLabels") && error.errorLabels.includes("UnknownTransactionCommitResult") 
            && retryCount < maxRetry ) {
                console.log("UnknownTransactionCommitResult, retrying commit operation ...");
                continue;
            } else {
                console.log("Error during commit ...");
                throw error;
            }
       }
    }
 }
 