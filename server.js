if (process.env.NODE_ENV !== 'production') {
   require('dotenv').config();
}

var express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const verifyToken = require('./middleware/verifytoken');
const checkDplPermission = require('./middleware/check-dpl-permission');
const checkPeriodPermission = require('./middleware/check-period-permission');
//var { MongoClient } = require( 'mongodb' );
//const mongoUri = "mongodb://myUserAdmin:csakMalajDB@127.0.0.1:27017";
//const mongoUri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@127.0.0.1:27017`;
//const mongoUri = `mongodb://Malaj:27017,Malaj:27018,Malaj:27019?replicaSet=rs`;
const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net/test`;
const mongoDBName = process.env.DB_NAME;

var app = module.exports = express();

const weeks = require('./routes/weeks.js');      
const dpls = require('./routes/dpls.js');      
const comments = require('./routes/comments.js');      
const seasons = require('./routes/seasons.js');      
const profiles = require('./routes/profiles.js');      
const periods = require('./routes/periods.js');      
const productions = require('./routes/productions.js');      
const settings = require('./routes/settings.js');      
const dienste = require('./routes/dienste.js');      
const users = require('./routes/users.js');      
const next = require('./routes/next.js');      
const calendar = require('./routes/calendar.js');      
const events = require('./routes/events.js');      
const pending = require('./routes/pending.js');      
const orchestra = require('./routes/orchestra.js');      
const login = require('./routes/login.js');      
const accounts = require('./routes/accounts.js');      

const Orchestra = require('./models/orchestra');

app.use(express.json());
app.use(cors());

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
      const session = await mongoose.connection.startSession( { readPreference: { mode: "primary" } } );                       
      //app.set('conn', mongoose.connection);
      app.set('session', session);
      // release all orchestra write locks on startup
      await Orchestra.updateMany({}, { writeLock: false }, { session: session });      

      app.use(express.static('./public'));            
      
      app.use('/api/weeks', verifyToken, weeks);                  
      app.use('/api/dpls', verifyToken, checkDplPermission, dpls);                  
      app.use('/api/comments', verifyToken, comments);                  
      app.use('/api/users', verifyToken, users);            
      app.use('/api/seasons', verifyToken, seasons);            
      app.use('/api/profiles', verifyToken, profiles);            
      app.use('/api/periods', verifyToken, checkPeriodPermission, periods);            
      app.use('/api/productions', verifyToken, productions);    
      app.use('/api/settings', verifyToken, settings);                    
      app.use('/api/dienste', verifyToken, dienste);            
      app.use('/api/next', verifyToken, next);            
      app.use('/api/calendar', calendar);            
      app.use('/api/events', verifyToken, events);            
      app.use('/api/pending', verifyToken, pending);            
      app.use('/api/orchestra', verifyToken, orchestra);            
      app.use('/api/login', login);

      app.use('/api/accounts', accounts);


      /* final catch-all route to index.html defined last */
      app.get('/*', (req, res) => {
         //console.log(__dirname + '/public/index.html');
         res.sendFile(__dirname + '/public/index.html');
      });
 
      app.listen(3000);
      console.log("Application is running...");
   }
   catch (err) {
      console.log(err);
   }
   finally {      
      //session.endSession();
      //await mongoose.connection.close();                        
   }
}


run().catch(console.dir);
