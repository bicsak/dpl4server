if (process.env.NODE_ENV !== 'production') {
   require('dotenv').config();
}

var express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
//var { MongoClient } = require( 'mongodb' );

//const mongoUri = "mongodb://myUserAdmin:csakMalajDB@127.0.0.1:27017";
const mongoUri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@127.0.0.1:27017`;
const mongoDBName = process.env.DB_NAME;

const weeks = require('./routes/weeks.js');      
const seasons = require('./routes/seasons.js');      
const users = require('./routes/users.js');      
const login = require('./routes/login.js');      

let app = express();
app.use(express.json());
app.use(cors());
/*
const client = new MongoClient("mongodb://myUserAdmin:csakMalajDB@127.0.0.1:27017", {
   useNewUrlParser: true,
   useUnifiedTopology: true,
});*/

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
      //app.set('conn', mongoose.connection);

      app.use(express.static('./public'));            
      app.use('/api/weeks', weeks);      
      app.use('/api/users', users);
      app.use('/api/seasons', seasons);
      app.use('/api/login', login);

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
      //await mongoose.connection.close();                  
   }
}

run().catch(console.dir);
