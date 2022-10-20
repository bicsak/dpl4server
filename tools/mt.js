/**************************
 * Data Migration Tool DPL3 -> DPL4
 * MySQL -> MongoDB
 **************************/
 if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const util = require( 'util' );
const bcrypt = require('bcryptjs');
const mysql = require( 'mysql' );
const { MongoClient } = require( 'mongodb' );

const mongoose = require('mongoose');

//const mongoUri = "mongodb://myUserAdmin:csakMalajDB@127.0.0.1:27017";
const mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.js8ztlf.mongodb.net/test`;
const mongoDBName = "odp_test" /* "odp_production" */;
//const mongoDBName = /*"odp_test"*/ "odp_production";

const client = new MongoClient(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


var mysqlConfig = {
    host:  "localhost" ,
    user:  "root" ,
    password:  "probauzem" ,
    database:  "dpl3"   
};  

function makeDb( config ) {
  const connection = mysql.createConnection( config );
  return {
    query( sql, args ) {
      return util.promisify( connection.query )
        .call( connection, sql, args );
    },
    close() {
      return util.promisify( connection.end ).call( connection );
    }
  };
}

const mysqlDb = makeDb( mysqlConfig );

async function run(hc) {
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

      const Orchestra = require('../models/orchestra');
      const User = require('../models/user');
      const Profile = require('../models/profile');
      const Season = require('../models/season');
      const Week = require('../models/week');
      const Dpl = require('../models/dpl');
      const DplMeta = require('../models/dplmeta');
      const DienstExtRef = require('../models/dienst');
      const Period = require('../models/period');
      const Production = require('../models/production');      
      
      let pad = function(num) { return ('00'+num).slice(-2) };      
      const subtypeMap = {
        "-6" : 0, // OA
        "-5" : 1, // OS
        "-4" : 2, // BO
        "-3" : 3, // VBO
        "-2" : 4, // HP
        "-1" : 5, // GP
        "0" : 0, // Sonstige
        "1" : 0, // Vorst.
        "2" : 1, // Premiere
        "3" : 2, // Wiederaufnahme
        "4" : 3 // Konzert
      };   
      
      let hswConfig = {        
        code: "HSW",
        fullName: "Hessisches Staatsorchester Wiesbaden",
        location: "Wiesbaden",
        timezone: "Europe/Berlin",
        venues: [ 
          { full: "OPR", abbr: "OPR" }, 
          { full: "Großes Haus", abbr: "GH" },
          { full: "Kurhaus", abbr: "KH" }
        ],
        sections: { 
          sec0: { abbr: "Fl", name: "Flöte", maxFW: 1, active: true },
          sec1: { abbr: "Ob", name: "Oboe", maxFW: 1, active: false },
          sec2: { abbr: "Kl", name: "Klarinette", maxFW: 1, active: false },                    
          sec3: { abbr: "Fg", name: "Fagott", maxFW: 1, active: true },
          sec4: { abbr: "Hr", name: "Horn", maxFW: 1, active: false },                    
          sec5: { abbr: "Tp", name: "Trompete", maxFW: 1, active: false },          
          sec6: { abbr: "Pos", name: "Posaune", maxFW: 1, active: false },                    
          sec7: { abbr: "Tb", name: "Tuba", maxFW: 1, active: false },
          sec8: { abbr: "1. Vl", name: "1. Violine", maxFW: 1, active: false },          
          sec9: { abbr: "2. Vl.", name: "2. Violine", maxFW: 1, active: false },          
          sec10: { abbr: "Va", name: "Bratsche", maxFW: 1, active: false },                    
          sec11: { abbr: "Vc", name: "Cello", maxFW: 1, active: false },                    
          sec12: { abbr: "Kb", name: "Kontrabass", maxFW: 1, active: false }                    
        },
        categories: [ 
          {
              subtypes: ["OA", "OS", "BO", "vBO", "HP", "GP", "..."],             
              suffixes: ["OA", "OS", "BO", "vBO", "HP", "GP", ""],             
              locations: [0, 0, 1, 1, 1, 1, 0], 
              durations: [150, 150, 180, 220, 180, 180, 150]
          },
          {
            subtypes: ["Vorst.", "WA", "Prem.", "Konz."], 
            suffixes: ["", "WA", "Premiere", ""],
            locations: [1, 1, 1, 2],
            durations: [180, 180, 180, 150]
          },
          {
            subtypes: ["Sonst."],
            suffixes: [""],
            locations: [0],
            durations: [150]
          } ]
      };

      let testorchConfig = {        
        code: "TOW",
        fullName: "Test Orchester Wiesbaden",
        location: "Wiesbaden",
        timezone: "Europe/Berlin",
        venues: [ 
          { full: "OPR", abbr: "OPR" }, 
          { full: "Großes Haus", abbr: "GH" },
          { full: "Kurhaus", abbr: "KH" }
        ],
        sections: { 
          sec0: { abbr: "Fl", name: "Flöte", maxFW: 1, active: true },
          sec1: { abbr: "Ob", name: "Oboe", maxFW: 1, active: false },
          sec2: { abbr: "Kl", name: "Klarinette", maxFW: 1, active: false },                    
          sec3: { abbr: "Fg", name: "Fagott", maxFW: 1, active: true },
          sec4: { abbr: "Hr", name: "Horn", maxFW: 1, active: false },                    
          sec5: { abbr: "Tp", name: "Trompete", maxFW: 1, active: false },          
          sec6: { abbr: "Pos", name: "Posaune", maxFW: 1, active: false },                    
          sec7: { abbr: "Tb", name: "Tuba", maxFW: 1, active: false },
          sec8: { abbr: "1. Vl", name: "1. Violine", maxFW: 1, active: false },          
          sec9: { abbr: "2. Vl.", name: "2. Violine", maxFW: 1, active: false },          
          sec10: { abbr: "Va", name: "Bratsche", maxFW: 1, active: false },                    
          sec11: { abbr: "Vc", name: "Cello", maxFW: 1, active: false },                    
          sec12: { abbr: "Kb", name: "Kontrabass", maxFW: 1, active: false }                    
        },
        categories: [ 
          {
              subtypes: ["OA", "OS", "BO", "vBO", "HP", "GP", "..."],             
              suffixes: ["OA", "OS", "BO", "vBO", "HP", "GP", ""],             
              locations: [0, 0, 1, 1, 1, 1, 0], 
              durations: [150, 150, 180, 220, 180, 180, 150]
          },
          {
            subtypes: ["Vorst.", "WA", "Prem.", "Konz."], 
            suffixes: ["", "WA", "Premiere", ""],
            locations: [1, 1, 1, 2],
            durations: [180, 180, 180, 150]
          },
          {
            subtypes: ["Sonst."],
            suffixes: [""],
            locations: [0],
            durations: [150]
          } ],
          writeLock: false
      };

      let collections = [
        'orchestras', 'seasons', 'users', 
        'profiles', 'periods', 'weeks', 'dpls', 
        'dplmetas', 'dienst', 'productions'];

      collections.forEach(coll => mongoose.connection.db.dropCollection(coll, function(err, result) {
        if (err) console.log(`No existing ${coll} collection`);
        if (result) console.log(`Collection ${coll} deleted`);         
        }) );
      let transformData = async function(orchConfig) {
        //************** ORCHESTRA ****************/            
        console.log(`+++Orchestra: ${orchConfig.code}+++`);
        const hsw = new Orchestra( orchConfig );
        await hsw.save();      

        //***************** SEASONS ************       
        let seasons = [];
        let seasonRows = await mysqlDb.query(
          `SELECT first_day AS begin, DATE_ADD(last_day, INTERVAL 1 DAY) AS end, comment, label        
          FROM fl3_season`);       
        for ( let currentSeason of seasonRows ) {
          let season = new Season( {
            ...currentSeason,          
            o: hsw._id          
          });
          seasons.push({id: season._id, begin: season.begin, end: season.end});
          await season.save();
        }
        
        //*********** USERS && PROFILES ******************           
        let n = {
          comment: false,
          dplNew: false,
          dplFinal: false,
          dplChanged: false,
          dplRejected: false,        
          surveyComplete: false,
          surveyFailed: false
        };            

        let userManager = await User.findOneAndUpdate(
          { email: 'bicsak@gmx.net' },
          { $set: { 
            pw: hc,
            fn: 'Ilya',
            sn: 'Yossifov',
            birthday: new Date('1970-01-01T00:00:00.000Z')
          } },
          { upsert: true, new: true } 
        );
        
        let profileManager = new Profile( {
          o: hsw._id,
          role: 'office',        
          manager: true,        
          section: 'all',
          
          user: userManager._id,        

          email: 'bicsak@gmx.net',
          notifications: n,        

          userFn: 'Ilya',
          userSn: 'Jossifov',
          userBirthday: new Date('1970-01-01T00:00:00.000Z'),
        } );
        await profileManager.save();
        userManager.profiles.push( {
          _id: profileManager._id,
          o: hsw._id,
          role: 'office',
          manager: true,
          section: 'all'
        });
        await userManager.save();


        //let flUsersDictionary = []; let fgUsersDictionary = [];
        let flUsersDictionary = {}; let fgUsersDictionary = {};
        let sec = "sec0";                         

        let userRows = await mysqlDb.query(
          `SELECT id_user,login_name,pw,first_name,surname,usergroup,email,birthday 
          FROM fl3_user`);       
        for ( let currentUser of userRows ) {        
          const newUser = await User.findOneAndUpdate(
            { email: currentUser.email },
            { $set: { 
              pw: hc,
              fn: currentUser.first_name,
              sn: currentUser.surname,
              birthday: currentUser.birthday 
            } },
            { upsert: true, new: true } 
          );
          
          let r = ''; let s = sec;
          switch (currentUser.usergroup) {
            case 10: r = 'office'; s = 'all'; break;
            case 20: r = 'friend'; break;
            default: r = 'musician';
          }

          let newProfile = new Profile( {
            o: hsw._id,
            role: r,
            section: s,
            manager: false,

            user: newUser._id,

            userFn: currentUser.first_name,
            userSn: currentUser.surname,
            userBirthday: currentUser.birthday
          });
          await newProfile.save();

          newUser.profiles.push( {
            _id: newProfile._id,
            o: hsw._id,
            role: r,
            manager: false,
            section: s
          });
          await newUser.save();


          if ( currentUser.usergroup == 100 ) { // scheduler 
            /* Insert extra profile into profile colelction */
            let profile = new Profile( {
              o: hsw._id,
              role: 'scheduler',
              section: sec,
              manager: false,
    
              user: newUser._id,
    
              userFn: currentUser.first_name,
              userSn: currentUser.surname,
              userBirthday: currentUser.birthday
            });
            await profile.save();

            newUser.profiles.push( {
              _id: profile._id,
              o: hsw._id,
              role: 'scheduler',
              manager: false,
              section: sec
            });
            await newUser.save();
          }

          flUsersDictionary[currentUser.id_user] = newProfile._id;
        }
        
        sec = "sec3"; 
        userRows = await mysqlDb.query(
          `SELECT id_user,login_name,pw,first_name,surname,usergroup,email,birthday 
          FROM fg3_user WHERE usergroup>20`); // for fg only friends, members and scheduler
        for ( let currentUser of userRows ) {
                  
          const newUser = await User.findOneAndUpdate(
            { email: currentUser.email },
            { $set: { 
              pw: hc,
              fn: currentUser.first_name,
              sn: currentUser.surname,
              birthday: currentUser.birthday 
            } },
            { upsert: true, new: true } 
          );
          
          let r = 'friend';
          if ( currentUser.usergroup != 20 ) r = 'musician';        

          let newProfile = new Profile( {
            o: hsw._id,
            role: r,
            section: sec,
            manager: false,

            user: newUser._id,

            userFn: currentUser.first_name,
            userSn: currentUser.surname,
            userBirthday: currentUser.birthday
          });
          await newProfile.save();

          newUser.profiles.push( {
            _id: newProfile._id,
            o: hsw._id,
            role: r,
            manager: false,
            section: sec
          });
          await newUser.save();


          if ( currentUser.usergroup == 100 ) { // scheduler 
            /* Insert extra profile into profile colelction */
            let profile = new Profile( {
              o: hsw._id,
              role: 'scheduler',
              section: sec,
              manager: false,
    
              user: newUser._id,
    
              userFn: currentUser.first_name,
              userSn: currentUser.surname,
              userBirthday: currentUser.birthday
            });
            await profile.save();

            newUser.profiles.push( {
              _id: profile._id,
              o: hsw._id,
              role: 'scheduler',
              manager: false,
              section: sec
            });
            await newUser.save();
          }

          fgUsersDictionary[currentUser.id_user] = newProfile._id;          
        }

        //console.log(flUsersDictionary);
        //console.log(fgUsersDictionary);


        /************ PERIODS *********** */      
        let newFlPeriods = {};      
        let result = await mysqlDb.query(
          `SELECT P.first_day AS begin,dplrow,dplcode AS initial,dzstart AS offset,id_user 
          FROM fl3_period P INNER JOIN fl3_member M 
          ON P.first_day=M.first_day`);
        for ( p of result ) {        
          if ( !newFlPeriods[p.begin.toISOString()] ) newFlPeriods[p.begin.toISOString()] = {          
              o: hsw._id,
              s: "sec0",
              begin: p.begin,   
              members: []                         
          };        
          
          newFlPeriods[p.begin.toISOString()].members.push( {
            prof: flUsersDictionary[p.id_user],
            initial: p.initial,
            row: p.dplrow,
            start: p.offset,
            factor: 1
          } );        
        }
        Object.entries(newFlPeriods).forEach(async ([key, value]) => {
          let newPeriod = new Period( value );
          newFlPeriods[key].newId = newPeriod._id;
          await newPeriod.save();        
        });

        let newFgPeriods = {};      
        result = await mysqlDb.query(
          `SELECT P.first_day AS begin,dplrow,dplcode AS initial,dzstart AS offset,id_user 
          FROM fg3_period P INNER JOIN fg3_member M 
          ON P.first_day=M.first_day`);
          
        for ( p of result ) {        
          if ( !newFgPeriods[p.begin.toISOString()] ) newFgPeriods[p.begin.toISOString()] = {          
              o: hsw._id,
              s: "sec3",
              begin: p.begin,   
              members: []                         
          };

          newFgPeriods[p.begin.toISOString()].members.push( {
            prof: fgUsersDictionary[p.id_user],
            initial: p.initial,
            row: p.dplrow,
            start: p.offset,
            factor: 1
          } );        
        }
        Object.entries(newFgPeriods).forEach(async ([key, value]) => {
          let newPeriod = new Period( value );
          newFgPeriods[key].newId = newPeriod._id;
          await newPeriod.save();        
        });

        /************** WEEKS ********* */         
        let weeks = [];   
        for ( let season of seasons ) {            
          let seasonEnd = new Date(season.end);
          let weekBegin = new Date(season.begin);        
          while (weekBegin.getTime() < seasonEnd.getTime()) {
            let newWeek = new Week( {
              o: hsw._id,
              begin: weekBegin,
              editable: true,
              season: season.id
            } );
            await newWeek.save();
            weeks.push( { 
              id: newWeek._id, 
              begin: weekBegin.toISOString(), 
              fl_id: -1, 
              fg_id: -1,
              season: season.id
            } );          
            weekBegin.setDate(weekBegin.getDate() + 7);
          }
        }

        console.log(`${weeks.length} weeks detected`);
        
        /*************** DPL *********** */           
        let productions = {};
        for ( let week of weeks ) {
          //console.log(`Processing ${count++}. out of ${weeks.length} week...`);
          let weekBegin = new Date(week.begin);        
          let monday = `${weekBegin.getFullYear()}-${pad(weekBegin.getMonth()+1)}-${pad(weekBegin.getDate())}`;        

          let result = await mysqlDb.query(
            `SELECT remark,status,id_week,period FROM fl3_week WHERE monday='${monday}'`);
          if ( result.length ) {
            week.fl_id = result[0].id_week; 
            week.fl_p = result[0].period.toISOString();       

            let corrections = await mysqlDb.query(
              `SELECT dplrow,val FROM fl3_dzcorrection WHERE id_week='${week.fl_id}'`);
            let newCorr = [0, 0, 0, 0];
            for ( let c of corrections ) {
              newCorr[c.dplrow] = c.val;
            }          

            let dpl = new Dpl( {
              o: hsw._id,
              s: 'sec0',
              remark: result[0].remark,
              weekBegin: weekBegin,
              weekEditable: true,
              closed: result[0].status==1,
              correction: newCorr,
              delta: Array(newFlPeriods[week.fl_p].members.length).fill(0),
              start: Array(newFlPeriods[week.fl_p].members.length).fill(0),
              w: week.id,
              p: newFlPeriods[week.fl_p].newId
            } );
            await dpl.save(); 
            week.fl_newid = dpl._id;         
            await Week.findByIdAndUpdate(week.id, {
              $set: {
                "dpls.sec0": {closed:dpl.closed, dplRef: dpl._id}} 
              });                                 

            let meta = new DplMeta( {
              o: hsw._id,
              dpl: dpl._id,
              comments: []
            } );
            let comments = await mysqlDb.query(
              `SELECT message,id_user,email,posted FROM fl3_comment WHERE id_week='${week.fl_id}'`);
            for ( let i = 0; i < comments.length; i++) {                        
              meta.comments.push( {
                message: comments[i].message,
                u: flUsersDictionary[comments[i].id_user],   
                reactions: [-1, -1, -1, -1],
                deleted: false,
                timestamp: comments[i].posted
              } );
            }
            await meta.save();
          }

          result = await mysqlDb.query(            
            `SELECT remark,status,id_week,period FROM fg3_week WHERE monday='${monday}'`);
          if ( result.length ) {
            week.fg_id = result[0].id_week;  
            week.fg_p = result[0].period.toISOString();             

            let corrections = await mysqlDb.query(
              `SELECT dplrow,val FROM fg3_dzcorrection WHERE id_week='${week.fl_id}'`);
            let newCorr = [0, 0, 0, 0];
            for ( let c of corrections ) {
              newCorr[c.dplrow] = c.val;
            }          

            let dpl = new Dpl( {
              o: hsw._id,
              s: 'sec3',
              remark: result[0].remark,
              weekBegin: weekBegin,
              weekEditable: true,
              closed: result[0].status==1,
              correction: newCorr,
              delta: Array(newFgPeriods[week.fg_p].members.length).fill(0),
              start: Array(newFgPeriods[week.fg_p].members.length).fill(0),            
              w: week.id,
              p: newFgPeriods[week.fg_p].newId
            } );
            await dpl.save();
            week.fg_newid = dpl._id;         
            await Week.findByIdAndUpdate(week.id, {
              $set: {
                "dpls.sec3": {closed:dpl.closed, dplRef: dpl._id}
                } 
              });
            
            let meta = new DplMeta( {
              o: hsw._id,
              dpl: dpl._id,
              comments: []
            } );
            let comments = await mysqlDb.query(
              `SELECT message,id_user,email,posted FROM fg3_comment WHERE id_week='${week.fl_id}'`);
            for ( let i = 0; i < comments.length; i++) {                        
              meta.comments.push( {
                message: comments[i].message,
                prof: fgUsersDictionary[comments[i].id_user], 
                reactions: [-1, -1, -1, -1],             
                deleted: false,
                timestamp: comments[i].posted
              } );
            }
            await meta.save();
          } 
                          
          /**
           * localhost:7777/dpl3
           * 2020-01-01
           */
          //Emulating full outer join in mysql:        
          let sql = `SELECT fl.*, 
          fg.instrumentation AS fg_instr,fg.id_dienst AS fg_id,fg.comment AS fg_comm,fg.helpers AS fg_extern,
          1 AS flutetable, fls.label 
          FROM fl3_dienst fl LEFT JOIN fg3_dienst fg         
          ON fl.start=fg.start AND fl.production=fg.production AND fl.subtype=fg.subtype
          INNER JOIN fl3_week flw ON fl.id_week=flw.id_week
          INNER JOIN fl3_season fls ON fls.id_season=flw.id_season
          WHERE fl.production IS NOT NULL AND fl.start BETWEEN '${monday}' AND DATE_ADD('${monday}', INTERVAL 1 WEEK)
          UNION
          SELECT fg.*,
          NULL AS fg_instr, NULL AS fg_id, NULL AS fg_comm,NULL AS fg_extern,0 AS flutetable, fgs.label
          FROM fl3_dienst fl RIGHT JOIN fg3_dienst fg 
          ON fl.start=fg.start AND fl.production=fg.production AND fl.subtype=fg.subtype
          INNER JOIN fg3_week fgw ON fg.id_week=fgw.id_week
          INNER JOIN fg3_season fgs ON fgs.id_season=fgw.id_season
          WHERE fl.id_dienst IS NULL AND fg.production IS NOT NULL 
          AND fg.start BETWEEN '${monday}' AND DATE_ADD('${monday}', INTERVAL 1 WEEK)`;        
          result = await mysqlDb.query(sql);
          let dienste = []; let dienstOldIds = [];

          let flSeatings = []; let fgSeatings = [];
          let flAbsent = [];
          let fgAbsent = [];
          for ( let i = 0; i < 7; i++) {
            flAbsent[i] = {am: [0,0,0,0], pm: [0,0,0,0]};
            fgAbsent[i] = {am: [0,0,0,0], pm: [0,0,0,0]};
          }
          let absentArrayField;

          for ( let i = 0; i < result.length; i++) {
            let dienst_id = new mongoose.Types.ObjectId();

            let instr = { /*sec0: 0, sec3: 0 */}; 
            for ( let sInd = 0; sInd <= 12; sInd++ ) {
              instr["sec" + sInd] = 0;
            }
            let cat = 2; 
            let tmp = { 
              day: result[i].day,            
              fl_did: -1,
              fg_did: -1 
            };
            if ( !result[i].flutetable ) {
              instr.sec3 = result[i].instrumentation;
              tmp.fg_did = result[i].id_dienst;
              tmp.fg_comm = result[i].comment; 
              tmp.fg_extern = result[i].helpers;
            } else {
              instr.sec0 = result[i].instrumentation;
              tmp.fl_did = result[i].id_dienst;
              tmp.fl_comm = result[i].comment; 
              tmp.fl_extern = result[i].helpers;
              if ( result[i].fg_id ) {
                instr.sec3 = result[i].fg_instr;
                tmp.fg_did = result[i].fg_id;
                tmp.fg_comm = result[i].fg_comm; 
                tmp.fg_extern = result[i].fg_extern;
              }
            }
            if ( result[i].subtype < 0 ) cat = 0;
            else if ( result[i].subtype > 0 ) cat = 1;
            
            let prod = {}; 
            let prodName = result[i].production; 
            let dur = 180;
                      
            if ( cat === 2 ) { prod = { id: null }; } else {

              if ( result[i].production.match( /siko|konzert/gi ) ) 
                prodName = result[i].production + result[i].label;          

              if ( productions[prodName] ) {
                prod = productions[prodName];
                if ( result[i].start.getTime() < prod.first.getTime() ) {              
                  await Production.updateOne({ o: hsw._id, name: prodName }, {
                    firstDienst: dienst_id
                  });
                  productions[prodName].first = result[i].start;
                }
                if ( result[i].start.getTime() > prod.last.getTime() ) {              
                  await Production.updateOne({ o: hsw._id, name: prodName }, {
                    lastDienst: dienst_id
                  });              
                  productions[prodName].last = result[i].start;
                }
              } else {            
                let durationRows = await mysqlDb.query(
                  `SELECT duration FROM fl3_duration WHERE name='${result[i].production}'`);                   
                if ( durationRows.length ) dur = durationRows[0].duration;  

                let prodInstr = {};
                for ( const key in instr ) {
                  prodInstr[key] = { count: instr[key], extra: '' };
                }              
                
                let prodDoc = new Production( {
                  o: hsw._id,
                  name: prodName,
                  comment: "Automatically generated from DPL3 by mt",
                  lastDienst: dienst_id,
                  firstDienst: dienst_id,
                  duration: dur,
                  instrumentation: prodInstr
                });
                await prodDoc.save();            
                productions[prodName] = {
                  id: prodDoc._id,
                  last: result[i].start,
                  first: result[i].start
                };
                prod = productions[prodName];       
              }
            } 
            
            let d = {
              _id: dienst_id,
              name: result[i].production,
              begin: result[i].start,
              prod: prod.id,
              category: cat,
              subtype: subtypeMap[ result[i].subtype ],
              weight: result[i].weight,            
              duration: result[i].duration,

              //location: result[i].location, 
              //TODO if necessary (everything is now set to auto)

              instrumentation: instr,
              seq: 0,
              total: 0            
            };

            dienste.push( d );          
            dienstOldIds.push( tmp );

            let dienstExtRef = new DienstExtRef( {            
              _id: d._id,
              o: hsw._id,            
              season: week.season,
              w: week.id,
              name: d.name,
              begin: d.begin,
              prod: d.prod,
              category: d.category,
              subtype: d.subtype,
              weight: d.weight,
              instrumentation: d.instrumentation,
              seq: 0,
              total: 0
            });
            await dienstExtRef.save();

            let index = dienstOldIds.length - 1;

            if ( dienstOldIds[index].fl_did != -1 ) {            
              if ( d.begin.getHours() < 12 ) absentArrayField = flAbsent[dienstOldIds[index].day].am; 
              else absentArrayField = flAbsent[dienstOldIds[index].day].pm;
              let seating = []; 
              let sps = await mysqlDb.query(
                `SELECT dplrow,code FROM fl3_seatingplan 
                WHERE id_dienst='${dienstOldIds[index].fl_did}'
                ORDER BY dplrow`);
              for ( let [ind,c]  of sps.entries() ) {              
                switch (c.code) {
                  case 0: seating.push(0); break;
                  case 64: 
                  case 65: 
                  case 66: 
                  case 67: seating.push(2); break;
                  case 1: seating.push(16); break;
                  case 2: seating.push(1); break;
                  case 3: let tmp = sps.findIndex( v => v.code == 2 );  seating.push(64+tmp); break;
                  case 4: seating.push(32); break;
                  case 5: seating.push(16); absentArrayField[ind] = 1; break; //K
                  case 6: seating.push(0); absentArrayField[ind] = 4; break; // FW
                  case 7: seating.push(0); absentArrayField[ind] = 2; break; // ~
                  case 8: seating.push(0); absentArrayField[ind] = 3; // U
                }              
              }            
              flSeatings.push( {
                d: d._id, 
                ext: dienstOldIds[index].fl_extern, 
                sp: seating,              
                comment: dienstOldIds[index].fl_comm,
                dienstBegin: d.begin,
                dienstWeight: d.weight,
                dienstInstr: d.instrumentation.sec0
              } );
            } else { 
              flSeatings.push( {
                d: d._id, 
                ext: 0, 
                sp: [0, 0, 0, 0],              
                dienstBegin: d.begin,
                dienstWeight: d.weight,
                dienstInstr: 0
              } );
            }     
            if ( dienstOldIds[index].fg_did != -1) {            
              if ( d.begin.getHours() < 12 ) absentArrayField = fgAbsent[dienstOldIds[index].day].am; 
              else absentArrayField = fgAbsent[dienstOldIds[index].day].pm;                        
              let seating = [];                     
              let sps = await mysqlDb.query(
                `SELECT dplrow,code FROM fg3_seatingplan 
                WHERE id_dienst='${dienstOldIds[index].fg_did}'
                ORDER BY dplrow`);
              for ( let [ind, c] of sps.entries() ) {              
                switch (c.code) {
                  case 0: seating.push(0); break;
                  case 64: 
                  case 65: 
                  case 66: 
                  case 67: seating.push(2); break;
                  case 1: seating.push(16); break;
                  case 2: seating.push(1); break;
                  case 3: let tmp = sps.indexOf(2); seating.push(64+tmp); break;
                  case 4: seating.push(32); break;
                  case 5: seating.push(16); absentArrayField[ind] = 1; break; //K
                  case 6: seating.push(0); absentArrayField[ind] = 4; break; // FW
                  case 7: seating.push(0); absentArrayField[ind] = 2; break; // ~
                  case 8: seating.push(0); absentArrayField[ind] = 3; // U
                }              
              }
              fgSeatings.push( {
                d: d._id, 
                ext: dienstOldIds[index].fg_extern, 
                sp: seating,
                comment: dienstOldIds[index].fg_comm,
                dienstBegin: d.begin,
                dienstWeight: d.weight,
                dienstInstr: d.instrumentation.sec3
              } );            
            } else { 
              fgSeatings.push( {
                d: d._id, 
                ext: 0, 
                sp: [0, 0, 0, 0],              
                dienstBegin: d.begin,
                dienstWeight: d.weight,
                dienstInstr: 0
              } );
            }              
          }
          await Week.findByIdAndUpdate(week.id, { $set: {"dienst": dienste} });            
          //console.log(productions);

          if ( week.fl_id != -1 ) {
            await Dpl.findByIdAndUpdate(week.fl_newid, { 
              $set: {"seatings": flSeatings, "absent": flAbsent} 
            });
            let currDpl = await Dpl.findById(week.fl_newid);          
            await currDpl.calcDelta(); 
            await currDpl.save();
          }
          if ( week.fg_id != -1 ) {
            await Dpl.findByIdAndUpdate(week.fg_newid, { 
              $set: {"seatings": fgSeatings, "absent": fgAbsent} });                        
            let currDpl = await Dpl.findById(week.fg_newid);
            await currDpl.calcDelta(); 
            await currDpl.save();                    
          }
        }  
      
        for ( let flP in newFlPeriods ) {
          let dpls = await Dpl.find( { p: newFlPeriods[flP].newId } ).sort( 'weekBegin' );
          let grSize = newFlPeriods[flP].members.length;        
          let end = Array(grSize).fill(0);
          for ( let dpl of dpls ) {
            dpl.start = end;
            await dpl.save();
            end = end.map ( (num, idx) => num + dpl.end[idx]  );          
          }        
        }

        for ( let fgP in newFgPeriods ) {
          let dpls = await Dpl.find( { p: newFgPeriods[fgP].newId } ).sort( 'weekBegin' );
          let grSize = newFgPeriods[fgP].members.length;        
          let end = Array(grSize).fill(0);
          for ( let dpl of dpls ) {
            dpl.start = end;
            await dpl.save();
            end = end.map ( (num, idx) => num + dpl.end[idx]  );          
          }        
        }
                    
        
        /***************************************
         * Fill seqnr, total for all dienst (BO1, 2, 3/6...)
         *****************************************/       
        for ( let s of seasons ) {
          //console.log(`Working on season ${s.begin}-${s.end}...`);
  
          aggregatedDienst = await Week.aggregate( [        
            { "$match": { 
              // 'begin': {'$lt' : new Date()} }  
              season: s.id 
              }  },
            { "$unwind": { 'path': '$dienst'} },
            { "$match": { 
              'dienst.category': { '$ne': 2 }, // no special dienste
              'dienst.total': { '$ne': -1 } }  // no excluded dienste
            },
            { "$group": { 
              "_id": "$dienst.prod",
              "dienste": {
                '$push': {
                  begin: "$dienst.begin", 
                  cat: "$dienst.category", 
                  subtype: "$dienst.subtype", 
                  seq: "$dienst.seq", 
                  total: "$dienst.total",
                  did: "$dienst._id"
                }
              }             
            } },          
            { "$sort": {'dienst.begin': 1} }        
          ]);
  
          for ( let p of aggregatedDienst ) {
            //console.log( `Working on production ${p._id}...` );
            let max = {
              r: [0, 0, 0, 0, 0, 0], // rehearsals
              p: 0 // performance
            };           
            for ( let [index, d] of p.dienste.entries() ) {
              if ( d.cat == 0 ) {                          
                let rehearsalType = d.subtype;
                if ( d.subtype == 3 ) /* vBO */ {
                  rehearsalType = 2;
                }
                d.seq = ++max.r[rehearsalType];                             
              } else {        
                d.seq = ++max.p;                          
              }
            }
  
            for ( let d of p.dienste ) {
              let rehearsalType = d.subtype;
              if ( d.subtype == 3 ) rehearsalType = 2;
              await Week.findOneAndUpdate(
                {'dienst._id': d.did},
                { 'dienst.$.seq': d.seq, 
                  'dienst.$.total': d.cat == 0 ? max.r[rehearsalType] : max.p //d.total
                }
              );                        
              await DienstExtRef.updateOne(
                { _id: d.did },
                { 'seq': d.seq, 
                'total': d.cat == 0 ? max.r[rehearsalType] : max.p //d.total
                }
              );
            } 
          } 
          
        }  
      }

      await transformData(hswConfig);
      await transformData(testorchConfig);
       //Creating indexes for the collections

       await client.connect();
       const database = client.db(mongoDBName);       
              
       await database.collection("orchestras").createIndex( { code: 1 }, { unique: true } );
       await database.collection("users").createIndex( { email: 1 }, { unique: true } );
       await database.collection("profiles").createIndex( { 
         user: 1, o: 1, role: 1, section: 1 
        }, { unique: true } );
       await database.collection("periods").createIndex( { o: 1, s: 1, begin: 1 }, { unique: true });
       await database.collection("dplmetas").createIndex( { o: 1, dpl: 1 }, { unique: true });       
       await database.collection("seasons").createIndex( { o: 1, begin: 1 }, { unique: true });
       await database.collection("weeks").createIndex( { o: 1, begin: 1 }, { unique: true });
       await database.collection("dpls").createIndex( { o: 1, s:1, weekBegin: 1 }, { unique: true });
       await database.collection("dienst").createIndex( { o: 1, begin: 1 });
       await database.collection("productions").createIndex( { o: 1, name: 1 });        
    }      
    catch ( err ) {
      console.log(err);
      // handle the error
    } 
    finally {
      await mysqlDb.close();      
      await mongoose.connection.close();            
      await client.close();
    }
}

// creating a hash for pw "probauzem"
bcrypt.hash("probauzem", 10, (err, hash) => {
  if (err) {
    console.log("bcrypt error");
  } else {    
    run(hash).catch(console.dir);
  }
});

