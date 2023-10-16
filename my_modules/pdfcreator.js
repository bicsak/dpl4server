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
        this.remarkWeek = wpl.remark;        
        this.remarksDienst = [];

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
            let dienst = {
                id: wpl.dienst[i]._id,
                name: dienstLabel,
                category: category, // italic if category == 2                
                begin: lxBegin, // for deciding, if am or pm
                position: {},
                commentManager: wpl.dienst[i].comment,
                nBegin: begin.getTime()
            };            
            this.dienste.push( dienst );
        }          
        this.dienste.sort( (a, b) => a.nBegin - b.nBegin );        
        this.columns = []; this.tableWidth = 0;
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
            this.tableWidth += Math.max(1, this.columns[i].length);
        }
    }

    parseDpl(dpl, sectionName, members) {
        /* sp, ext, (comment), dienstWeight, (dienstBegin) from seating for each dienst*/ 
        this.sectionName = sectionName; // 'Flöte'
        this.tsVersion = DateTime.fromMillis(dpl.state.getTime(), {zone: this.timezone});
        this.members = members;
        this.remarkDpl = dpl.remark;
        
        for ( let i = 0; i < dpl.seatings.length; i++ ) {
            let dInd = this.dienste.findIndex( d => d.id.toString() == dpl.seatings[i].d.toString() );            
            this.dienste[dInd].sp = dpl.seatings[i].sp;
            this.dienste[dInd].ext = dpl.seatings[i].ext;
            this.dienste[dInd].commentScheduler = dpl.seatings[i].comment;
        }
        let remarkDienstCount = 0;
        for ( let i = 0; i < this.dienste.length; i++ ) {            
            if ( this.dienste[i].commentManager || this.dienste[i].commentScheduler ) {
                remarkDienstCount++;
                this.dienste[i].remarkIndex = remarkDienstCount;
                this.remarksDienst.push(i);
            }
        }        
    }

    createPDF( opt /* changes for the future red markings*/) {        
        const pageWidth = 841.89; // in PS points; 72 points per inch
        const pageHeight = 595.28; // A4, 297x210 mm
        const margin = 36; // half inch
        const tableFontSize = 12;
        const fontSizeSub = 8;
        const wCell = 35;
        const tableRowHeight = tableFontSize * 1.7;
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
        let heightRotatedHeaders = maxLabelLength * Math.sqrt(0.75);

        // Pipe its output somewhere, like to a file or HTTP response        
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
                
        doc.addPage({layout: 'landscape', size: 'A4', margin: margin})
        .fillAndStroke("black", "#000").lineWidth(1);        
       
        let maxSurnameWidth = doc.widthOfString('Aushilfe(n)');
        for ( let i = 0; i < this.members.length; i++ ) {
            let w = doc.widthOfString(`${i+1} ${this.members[i].sn}`);
            maxSurnameWidth = Math.max(maxSurnameWidth, w);            
        }   
        maxSurnameWidth += tableFontSize;

        let aX = margin + maxSurnameWidth; 
        let aY = margin+heightRotatedHeaders+20;
        
        doc.font('Times-Bold').text(`KW ${this.days[0].toFormat('W')}`, 
            aX - maxSurnameWidth, aY+1.5*tableRowHeight, {
                width: maxSurnameWidth,
                height: tableRowHeight*2,
                align: 'center',
                baseline: 'top'                
        });                        
        doc.font('Times-Roman');
        for ( let i = 0; i < this.members.length; i++ ) {         
            doc.text(`${i+1} ${this.members[i].sn}`, aX - maxSurnameWidth, aY+(i+3.25)*tableRowHeight);
            doc.moveTo(aX - maxSurnameWidth, aY+(i+4)*tableRowHeight).lineTo(aX + this.tableWidth * wCell, aY+(i+4)*tableRowHeight).stroke();
        }
        doc.font('Times-Italic').text(`Aushilfe(n)`, aX - maxSurnameWidth, aY + (this.members.length+3.25)*tableRowHeight).font('Times-Roman');

        let colCount = 0;  
        doc.moveTo(aX+colCount*wCell, aY+2*tableRowHeight).lineTo(aX+colCount*wCell, aY+(3+this.members.length)*tableRowHeight).stroke();      
        for ( let i = 0; i < 14; i++) {
            for ( let j = 0; j < this.columns[i].length; j++ ) {                
                if ( this.dienste[this.columns[i][j]].remarkIndex ) {
                    doc.fontSize(fontSizeSub).text(`(${this.dienste[this.columns[i][j]].remarkIndex})`, aX + colCount * wCell, aY+(this.members.length + 4.25)*tableRowHeight, {
                        width: wCell,
                        align: 'center'
                    }).fontSize(tableFontSize);
                }
                for ( let m = 0; m < this.members.length; m++ ) {
                    if ( this.dienste[this.columns[i][j]].sp[m] > 0) {
                        doc.text('DD', aX + colCount * wCell, aY+(m + 4.25)*tableRowHeight, {
                            width: wCell,
                            align: 'center'
                        });
                    }
                }
                if ( this.dienste[this.columns[i][j]].ext ) {
                    doc.text(`+${this.dienste[this.columns[i][j]].ext}`, aX + colCount * wCell, aY+(this.members.length + 3.25)*tableRowHeight, {
                        width: wCell,
                        align: 'center'
                    });
                }
                colCount++;
            }
            if ( !this.columns[i].length ) colCount++;
            // PM, draw grey background for cells
            if ( i % 2 ) {
                doc.fillColor('grey', 0.2).rect(aX+(colCount-Math.max(1, this.columns[i].length))*wCell, aY+3*tableRowHeight, Math.max(1, this.columns[i].length)*wCell, (this.members.length+1)*tableRowHeight).fill().fillColor("black", 1);
                doc.moveTo(aX+colCount*wCell, aY+2*tableRowHeight).lineTo(aX+colCount*wCell, aY+(3+this.members.length)*tableRowHeight).stroke();
            }
        }        
        doc.fontSize(tableFontSize);

        doc.save(); 
        doc.rotate(-60, { origin: [aX, aY]}).font('Times-Roman');         
        
        let dx = wCell/2; /* sinus 30 grad  == 0.5 */ 
        let dy = Math.sqrt(0.75)*wCell;  // sinus 60 grad == sqrt 0.75        
        
        for ( let i = 0; i < 14; i++) {
            for ( let j = 0; j < this.columns[i].length; j++ ) {                
                let text = this.dienste[this.columns[i][j]].name;
                let currHeaderLength = doc.widthOfString(text);
                if ( this.dienste[this.columns[i][j]].category == 2 ) doc.font('Times-Italic');
                else doc.font('Times-Roman');
                doc.fillAndStroke("black", "#000").text(text, aX+tableFontSize/2, aY+wCell/2).translate(dx, dy);
                doc.fillAndStroke("grey", "#999").moveTo(aX-tableFontSize+4, aY+4).lineTo(aX + currHeaderLength, aY+4).stroke();                                
            }
            if ( !this.columns[i].length ) {        
                let currHeaderLength = doc.widthOfString('frei');
                doc.fillAndStroke("grey", "#999").text(`frei`, aX+tableFontSize/2, aY+wCell/2).fillAndStroke("black", "#000").translate(dx, dy);            
                doc.fillAndStroke("grey", "#999").moveTo(aX-tableFontSize+4, aY+4).lineTo(aX + currHeaderLength, aY+4).stroke();
            }
        }
        doc.restore();

        doc.fillAndStroke("black", "#000");
        colCount = 0;
        for ( let i = 0; i < 14; i++) {
            for ( let j = 0; j < this.columns[i].length; j++ ) {  
                doc.moveTo(aX + colCount * wCell, aY+3*tableRowHeight).lineTo(aX + colCount * wCell, aY + (this.members.length+4)*tableRowHeight).stroke();                                
                colCount++;
            }
            if ( !this.columns[i].length ) {
                doc.moveTo(aX + colCount * wCell, aY+3*tableRowHeight).lineTo(aX + colCount * wCell, aY + (this.members.length+4)*tableRowHeight).stroke();                                
                colCount++;
            }
        }
        
        let tX = 0;        
        for ( let i = 0; i < 7; i++ ) {
            let colSpan = Math.max(1, this.columns[i*2].length)+Math.max(1, this.columns[i*2+1].length);
            doc.rect(aX + tX, aY+tableFontSize, colSpan*wCell, tableRowHeight*2).stroke(); //x, y, w, h            
            doc.font('Times-Bold').text(Info.weekdays('long')[i], aX + tX, aY+tableRowHeight, {
                width: colSpan*wCell,
                height: wCell,
                align: 'center'                
            });                        
            //doc.rect(aX + tX, aY+20, colSpan*20, 20).stroke(); //x, y, w, h            
            doc.font('Times-Roman').text(this.days[i].toFormat('dd.MM'), aX + tX, aY+tableRowHeight+tableFontSize, {
                width: colSpan*wCell,
                height: wCell,
                align: 'center'                
            });                        
            tX += colSpan*wCell;
        }            
        
        // 2nd Page: Remarks (Manager, Scheduler, for each dienst manager/scheduler)       
        if ( this.remarkWeek || this.remarkWeek || this.remarksDienst.length ) {
            doc.addPage({layout: 'landscape', size: 'A4', margin: margin}).fillAndStroke("black", "#000").lineWidth(1);
            doc.text('Bemerkungen zum Dienstplan', margin, margin + wCell);
            if (this.remarkWeek) {
                doc.font('Times-Bold').text(this.remarkWeek);
            }
            if (this.remarkDpl) {
                doc.font('Times-Roman').text(this.remarkDpl);
            }
            if (this.remarksDienst.length) {
                for ( let i = 0; i < this.remarksDienst.length; i++ ) {
                    doc.font('Times-Roman').fontSize(fontSizeSub).text(i+1 + ' ', {continued: true});
                    doc.fontSize(tableFontSize);
                    if ( this.dienste[this.remarksDienst[i]].commentManager ) doc.font('Times-Bold').text(this.dienste[this.remarksDienst[i]].commentManager, {continued: true});
                    if ( this.dienste[this.remarksDienst[i]].commentScheduler ) doc.font('Times-Roman').text(this.dienste[this.remarksDienst[i]].commentScheduler, {continued: true});
                    doc.text(' ', {continued: false});
                }
            }
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