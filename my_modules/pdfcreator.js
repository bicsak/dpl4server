const path = require('node:path');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { DateTime, Info } = require('luxon');

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
                position: {},
                nBegin: begin.getTime()
            } );
        }          
        this.dienste.sort( (a, b) => a.nBegin - b.nBegin );        
        this.columns = [];
        for ( let i = 0; i < 14; i++ ) {
            this.columns[i] = [];
            let dayIndex = Math.floor(i/2);
            let pmShift = i % 2;
            this.dienste.forEach( (d, index, dArr) => {
                if ( d.begin.day == this.days[dayIndex].day && (!pmShift && d.begin.hour < 12 || pmShift && d.begin.hour >= 12) ) {
                    this.columns[i].push(index);
                    dArr.position = { 
                        col: i,
                        dInd: this.columns[i].length - 1,
                        pmShift: pmShift
                    };
                }
            });
        }
    }

    parseDpl(dpl, sectionName, members) {
        /* sp, ext, (comment), dienstWeight, (dienstBegin) from seating for each dienst*/ 
        this.sectionName = sectionName; // 'Flöte'
        this.tsVersion = DateTime.fromMillis(dpl.state.getTime(), {zone: this.timezone});
        this.members = members;
    }

    createPDF( opt /* changes for the future red markings*/) {        
        const pageWidth = 841.89; // in PS points; 72 points per inch
        const pageHeight = 595.28; // A4, 297x210 mm
        const margin = 36; // half inch
        const tableFontSize = 12;
        const hCell = 30; 
        let filename = 'dploutput.pdf'; // TODO unique arbitrary name        
        // Create a document
        const doc = new PDFDocument({
            autoFirstPage: false,
            layout: 'landscape',
            size: 'A4'
        });
        doc.font('Times-Roman', tableFontSize);
        let maxLabelLength = 0;
        for ( let i = 0; i < this.dienste.length; i++ ) {
            
            maxLabelLength = Math.max(maxLabelLength, doc.widthOfString(this.dienste[i].name));
            console.log(maxLabelLength);
        }
        let heightRotatedHeaders = /*maxLabelLength / 2*/ maxLabelLength * Math.sqrt(0.75);

        // Pipe its output somewhere, like to a file or HTTP response
        // See below for browser usage
        doc.pipe(fs.createWriteStream(path.join(__dirname, '..', 'output') + `/${filename}`));
        doc.on('pageAdded', () => {                        
            let w = doc.widthOfString(this.orchFull);
            let h = doc.heightOfString(this.orchFull);

            // TODO for client-side rendered PDF: Dienstplan 'Entwurf'
            doc.text(`Dienstplan ${this.sectionName}`).moveUp()
            .text(`Stand: ${this.tsVersion.toFormat('dd.MM.yyyy hh:mm')}`, {align: 'right'}).moveUp()
            .text(`Vom ${this.days[0].toFormat('dd.MM.yyyy')} bis ${this.days[6].toFormat('dd.MM.yyyy')} (KW ${this.days[0].toFormat('W')})`, {align: 'center'});
            doc.moveTo(margin, margin + h).lineTo(pageWidth - margin, margin + h);            
            
            doc.moveTo(margin, pageHeight - margin - h*1.5).lineTo(pageWidth - margin, pageHeight - margin - h*1.5);
            doc.text(this.orchFull, pageWidth/2 - w/2, pageHeight-margin-h);

        });
        // Add some text with annotations
        doc.addPage({layout: 'landscape', size: 'A4', margin: margin})/*.fillColor('blue')*/
        .lineWidth(2).fillAndStroke("black", "#000").lineWidth(1);
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
       
        let maxSurnameWidth = doc.widthOfString('Aushilfe');
        for ( let i = 0; i < this.members.length; i++ ) {
            let w = doc.widthOfString(`${i+1} ${this.members[i].sn}`);
            maxSurnameWidth = Math.max(maxSurnameWidth, w);            
        }        

        let aX = margin + maxSurnameWidth; 
        let aY = margin+heightRotatedHeaders+20;

        doc.rect(aX - maxSurnameWidth, aY+tableFontSize, maxSurnameWidth, hCell*2).stroke(); //x, y, w, h            
        doc.font('Times-Bold').text(`KW ${this.days[0].toFormat('W')}`, 
        aX - maxSurnameWidth, aY+hCell, {
                width: maxSurnameWidth,
                height: hCell*2,
                align: 'center',
                baseline: 'top'                
        });                        
        doc.font('Times-Roman');
        for ( let i = 0; i < this.members.length; i++ ) {         
            doc.text(`${i+1} ${this.members[i].sn}`, aX - maxSurnameWidth, aY+i*tableFontSize+3*hCell);
        }
        doc.font('Times-Italic').text(`Aushilfe`, aX - maxSurnameWidth, aY + hCell*3+this.members.length*tableFontSize);

        doc.save(); 
        doc.rotate(-60, { origin: [aX, aY]}).font('Times-Roman');         
        
        let dx = hCell/2; /* sinus 30 grad  == 0.5 */ 
        let dy = Math.sqrt(0.75)*hCell;  // sinus 60 grad == sqrt 0.75        
        
        for ( let i = 0; i < 14; i++) {
            for ( let j = 0; j < this.columns[i].length; j++ ) {                
                let text = this.dienste[this.columns[i][j]].name;
                let currHeaderLength = doc.widthOfString(text);
                if ( this.dienste[this.columns[i][j]].category == 2 ) doc.font('Times-Italic');
                else doc.font('Times-Roman');
                doc.fillAndStroke("black", "#000").text(text, aX, aY+hCell/2).translate(dx, dy);
                doc.fillAndStroke("grey", "#999").moveTo(aX-tableFontSize+4, aY+4).lineTo(aX + currHeaderLength, aY+4).stroke();                
            }
            if ( !this.columns[i].length ) {        
                let currHeaderLength = doc.widthOfString('frei');
                doc.fillAndStroke("grey", "#999").text(`frei`, aX, aY+hCell/2).fillAndStroke("black", "#000").translate(dx, dy);            
                doc.fillAndStroke("grey", "#999").moveTo(aX-tableFontSize+4, aY+4).lineTo(aX + currHeaderLength, aY+4).stroke();
            }
        }
        doc.restore();
        
        let tX = 0;
        for ( let i = 0; i < 7; i++ ) {
            let colSpan = Math.max(1, this.columns[i*2].length)+Math.max(1, this.columns[i*2+1].length);
            doc.rect(aX + tX, aY+tableFontSize, colSpan*hCell, hCell*2).stroke(); //x, y, w, h            
            doc.font('Times-Bold').text(Info.weekdays('long')[i], aX + tX, aY+hCell, {
                width: colSpan*hCell,
                height: hCell,
                align: 'center'                
            });                        
            //doc.rect(aX + tX, aY+20, colSpan*20, 20).stroke(); //x, y, w, h            
            doc.font('Times-Roman').text(this.days[i].toFormat('dd.MM'), aX + tX, aY+hCell+tableFontSize, {
                width: colSpan*hCell,
                height: hCell,
                align: 'center'                
            });                        
            tX += colSpan*hCell;
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