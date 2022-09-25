const mongoose = require('mongoose');
const Orchestra = require('../models/orchestra');

const maxRetry = 10;

// Runs the txnFunc and retries if TransientTransactionError encountered
/***********
 * @params Object:
 * txnFunc: the function to call
 * txnFuncParams: Object to call txnFunc with
 * txnName: the name of the operation
 * role: 
 * o: the orchestra to lock
 * session: session object
 */
exports.runTransactionWithRetryAndOrchLock = async function ( params ) {
    let retryCount = 0;
    
    while ( retryCount < maxRetry ) {
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
            
            await params.txnFunc(params.session, params.txnFuncParams);  // performs transaction
            
            orch.writeLock =  {
                txn: params.txnName,
                ts: new Date(),
                role: params.role,
                action: 'release',
                uniqueId: new mongoose.Types.ObjectId()
            }; 
            await orch.save( {session: params.session} );
            
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
 
    while ( retryCount < maxRetry ) {
        retryCount++;
        try {
            await session.commitTransaction(); // Uses write concern set at transaction start.
            console.log(`Transaction committed.`);
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
 