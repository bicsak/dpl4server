const path = require('node:path');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { DateTime } = require('luxon');

class PDFCreator {
    outputFiles = []; // name list for generated PDF files
    
    constructor() {        
    }
    
    parseWeekData(orch, wpl) {        
        this.timezone = orch.timezone;
        this.orchFull = orch.fullName;
        this.orchCode = orch.code;

        this.days = [];
        let dtMonday = DateTime.fromMillis(wpl.begin.getTime(), { timezone: this.timezone});
        for ( let i = 0; i < 8; i++ ) {
            this.days.push(dtMonday.plus({day: i}));            
        }        
        
        this.dienste = [];
        for ( let i = 0; i < wpl.dienst.length; i++ ) {
            let { category, subtype, seq, total }  = wpl.dienst[i];            
            let dienstLabel = wpl.dienst[i].name;
            if ( category == 1 ) dienstLabel = dienstLabel.toUpperCase();
            if ( orch.categories[category].suffixes[subtype] != '' ) dienstLabel += ' ' + orch.categories[category].suffixes[subtype];
            if ( category == 0 && subtype == 6) dienstLabel += wpl.dienst[i].suffix;
            if ( category == 0 && total > 1 ) dienstLabel += ' ' + seq;
            this.dienste.push( {
                id: wpl.dienst[i]._id,
                name: dienstLabel                
            } );
        }
    }

    parseDpl(dpl, sec) {
        /* sp, ext, (comment), dienstWeight, (dienstBegin) from seating for each dienst*/ 

    }

    createPDF( opt /* changes for the future red markings*/) {
        // TODO
        let filename = 'dploutput.pdf'; // TODO unique arbitrary name        
        // Create a document
        const doc = new PDFDocument({
            autoFirstPage: false,
            layout: 'landscape',
            size: 'A4'
        });

        // Pipe its output somewhere, like to a file or HTTP response
        // See below for browser usage
        doc.pipe(fs.createWriteStream(path.join(__dirname, '..', 'output') + `/${filename}`));
        doc.on('pageAdded', () => {
            let w = doc.widthOfString('Dienstplan');
            let h = doc.heightOfString('Dienstplan');
            doc.text('Dienstplan', 421-w/2, 10);
            doc.moveTo(10, 10 + h + 10).lineTo(832, 10 + h + 10);
            w = doc.widthOfString(this.orchFull);
            h = doc.heightOfString(this.orchFull);
            doc.moveTo(10, 575 - h).lineTo(832, 575 - h);
            doc.text(this.orchFull, 421 - w/2, 585-h);

        });
        // Add some text with annotations
        doc.addPage({layout: 'landscape', size: 'A4', margin: 0})/*.fillColor('blue')*/.lineWidth(2).fillAndStroke("black", "#000")
        .text(this.orchFull, 100, 100);
        /*.underline(100, 100, 160, 27, { color: '#0000FF' })
        .link(100, 100, 160, 27, 'http://odp.bicsak.net/');*/
        /* Write rotated text with pdfKit: */ 
        //doc.save(); 
        /*doc.rotate(-60, { origin: [100, 100]}).text(this.orchCode); 
        doc.restore();*/
         /*
        OR:
        doc.rotate(angle, { origin: [x, y]});
        doc.test( 'TEST', x, y);
        doc.rotate(angle * (-1), {origin: [x, y]});        
        */       
        doc.text(`${this.days[0].toFormat('dd.MM.yyyy')}-${this.days[7].toFormat('dd.MM.yyyy')}`);        
        doc.save(); 
        doc.rotate(-60, { origin: [100, 100]}); 
        
        for ( let i = 0; i < this.dienste.length; i++) {                    
            doc.text(`${this.dienste[i].name}`)/*.moveUp()*/;
        }
        doc.restore();
        for ( let i = 0; i < this.dienste.length; i++) {
            doc.text(`${this.dienste[i].name}`);                        
        }

        // Finalize PDF file
        doc.end();
        this.outputFiles.push(filename);
        return filename;
    }

    deleteOutputFiles() {
        for ( let i = 0; i < this.outputFiles.length; i++ ) {
            //delete file this.outputFiles[i]...
            fs.unlink(path.join(__dirname, '..', 'output') + `/${this.outputFiles[i]}`,
            err => {
                if (err) return console.log(err);
                console.log('pdf file deleted successfully');
           })
        }
    }
}

module.exports = new PDFCreator();