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
        for ( let i = 0; i < 7; i++ ) {
            this.days.push(dtMonday.plus({day: i}));            
        }        
        
        this.dienste = [];
        for ( let i = 0; i < wpl.dienst.length; i++ ) {
            let { category, subtype, seq, total, begin }  = wpl.dienst[i];            
            let lxBegin = DateTime.fromMillis(begin.getTime(), {zone: this.timezone});
            let dienstLabel = lxBegin.toFormat('HH:mm') + ' ' + wpl.dienst[i].name;
            if ( category == 1 ) dienstLabel = dienstLabel.toUpperCase();
            if ( orch.categories[category].suffixes[subtype] != '' ) dienstLabel += ' ' + orch.categories[category].suffixes[subtype];
            if ( category == 0 && subtype == 6) dienstLabel += wpl.dienst[i].suffix;
            if ( category == 0 && total > 1 ) dienstLabel += ' ' + seq;
            this.dienste.push( {
                id: wpl.dienst[i]._id,
                name: dienstLabel,
                category: category, // italic if category == 2                
                begin: lxBegin, // for deciding, if am or pm
                nBegin: begin.getTime()
            } );
        }        
        this.dienste.sort( (a, b) => a.nBegin - b.nbegin );
    }

    parseDpl(dpl, sectionName) {
        /* sp, ext, (comment), dienstWeight, (dienstBegin) from seating for each dienst*/ 
        this.sectionName = sectionName; // 'Flöte'
        this.tsVersion = DateTime.fromMillis(dpl.state.getTime(), {zone: this.timezone});
    }

    createPDF( opt /* changes for the future red markings*/) {        
        const pageWidth = 841.89; // in PS points; 72 points per inch
        const pageHeight = 595.28; // A4, 297x210 mm
        const margin = 36; // half inch
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
            let w = doc.widthOfString(this.orchFull);
            let h = doc.heightOfString(this.orchFull);

            doc.text(`Dienstplan ${this.sectionName}`).moveUp()
            .text(`Stand: ${this.tsVersion.toFormat('dd.MM.yyyy hh:mm')}`, {align: 'right'}).moveUp()
            .text(`Vom ${this.days[0].toFormat('dd.MM.yyyy')} bis ${this.days[6].toFormat('dd.MM.yyyy')} (KW ${this.days[0].toFormat('W')})`, {align: 'center'});
            doc.moveTo(margin, margin + h).lineTo(pageWidth - margin, margin + h);            
            
            doc.moveTo(margin, pageHeight - margin - h*1.5).lineTo(pageWidth - margin, pageHeight - margin - h*1.5);
            doc.text(this.orchFull, pageWidth/2 - w/2, pageHeight-margin-h);

        });
        // Add some text with annotations
        doc.addPage({layout: 'landscape', size: 'A4', margin: margin})/*.fillColor('blue')*/.lineWidth(2).fillAndStroke("black", "#000")
        .text(this.orchFull, 100, 300);
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
        doc.save(); 
        doc.rotate(-60, { origin: [100, 200]}); 
        
        let hText = 20; let dx = hText/2; let dy = Math.sqrt(0.75)*hText;
        for ( let i = 0; i < this.dienste.length; i++) {                    
            doc.text(`${this.dienste[i].name}`, 100, 200).moveUp().translate(dx, dy);
        }
        doc.restore();
        doc.text('start', 100, 400);
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