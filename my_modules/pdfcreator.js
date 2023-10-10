const PDFDocument = require('pdfkit');
const fs = require('fs');

export default class PDFCreator{
    constructor(orch, wpl, dpl) {
        this.parseRawData(orch, wpl, dpl);
    }
    
    parseRawData(orch, wpl, dpl) {
        //TODO

    }

    createPDF(filename) {
        // TODO
        // Create a document
        const doc = new PDFDocument();

        // Pipe its output somewhere, like to a file or HTTP response
        // See below for browser usage
        doc.pipe(fs.createWriteStream(path.join(__dirname, '..', 'output') + `/${filename}`));

        // Add some text with annotations
        doc/*.addPage()*/.fillColor('blue')
        .text('Here is a link to ODP!', 100, 100)
        .underline(100, 100, 160, 27, { color: '#0000FF' })
        .link(100, 100, 160, 27, 'http://odp.bicsak.net/');

        // Finalize PDF file
        doc.end();
    }
}

//module.exports = PDFCreator;