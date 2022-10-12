const mongoose = require('mongoose');
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
    //const session = await mongoose.connection.startSession( { readPreference: { mode: "primary" } } );
    let retryCount = 0;
    let orch;
    let session = app.get('session');

    // 1st step: try to lock the orchestra
    while ( !orch && retryCount < maxRetry ) {
        console.log('Try to get write lock for orchestra...');
        orch = await Orchestra.findOneAndUpdate( {
            o: lockOptions.orch,
            writeLock: false
        }, { writeLock: true }, { session /*: session */ } );     
        if ( !orch ) {
            await setTimeout(retryDelay + Math.random() * 100);
            retryCount++;            
        }
    }
    if ( !orch ) return false; // could not get write Lock, exit

    //2nd step: start transaction and run txnFnc
    try {
        var result = await runTransactionWithRetryAndOrchLock( txnFunc, params, session );
    }
    catch ( err ) {
        console.log(err);
    } 
    finally {
        orch.writeLock = false;
        await orch.save();
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
 