const PDFDocument = require('pdfkit');
const fs = require('fs');

export default class PDFCreator{
    
    constructor(orch, wpl) {
        this.parseRawData(orch, wpl);
    }
    
    parseRawData(orch, wpl) {
        //TODO
        // get timezone, orchestra full, abbr etc.
    }

    parseDpl(dpl, sec) {

    }

    createPDF(filename, dpl, sec, opt /* changes for the future red markings*/) {
        // TODO
        this.parseDpl(dpl, sec);
        // Create a document
        const doc = new PDFDocument();

        // Pipe its output somewhere, like to a file or HTTP response
        // See below for browser usage
        doc.pipe(fs.createWriteStream(path.join(__dirname, '..', 'output') + `/${filename}`));

        // Add some text with annotations
        doc/*.addPage()*/.fillColor('blue')
        .text('Here is a link to ODP!', 100, 100)
        /* Write rotated text with pdfKit:
        doc.save(); 
        doc.rotate(90).text('rotated text', ...); 
        doc.restore();
         
        OR:
        doc.rotate(angle, { origin: [x, y]});
        doc.test( 'TEST', x, y);
        doc.rotate(angle * (-1), {origin: [x, y]});        
        */
        .underline(100, 100, 160, 27, { color: '#0000FF' })
        .link(100, 100, 160, 27, 'http://odp.bicsak.net/');

        // Finalize PDF file
        doc.end();
    }
}

//module.exports = PDFCreator;