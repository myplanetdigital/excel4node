const xmlbuilder = require('xmlbuilder');
const JSZip = require('jszip');

let addRootContentTypesXML = (promiseObj) => {
    // Required as stated in §12.2
    return new Promise ((resolve, reject) => {
        let xml = xmlbuilder.create(
            'Types',
            {
                'version': '1.0', 
                'encoding': 'UTF-8', 
                'standalone': true
            }
        )
        .att('xmlns', 'http://schemas.openxmlformats.org/package/2006/content-types');

        xml.ele('Default').att('ContentType', 'application/xml').att('Extension', 'xml');
        xml.ele('Default').att('ContentType', 'application/vnd.openxmlformats-package.relationships+xml').att('Extension', 'rels');
        xml.ele('Override').att('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml').att('PartName', '/xl/workbook.xml');
        promiseObj.wb.sheets.forEach((s, i) => {
            xml.ele('Override')
            .att('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
            .att('PartName', `/xl/worksheets/sheet${i + 1}.xml`);
        });
        xml.ele('Override').att('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml').att('PartName', '/xl/styles.xml');
        xml.ele('Override').att('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml').att('PartName', '/xl/sharedStrings.xml');

        let xmlString = xml.doc().end(promiseObj.xmlOutVars);
        promiseObj.xlsx.file('[Content_Types].xml', xmlString);
        resolve(promiseObj);
    });
};

let addRootRelsXML = (promiseObj) => {
    // Required as stated in §12.2
    return new Promise ((resolve, reject) => {
        let xml = xmlbuilder.create(
            'Relationships',
            {
                'version': '1.0', 
                'encoding': 'UTF-8', 
                'standalone': true
            }
        )
        .att('xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');

        xml
        .ele('Relationship')
        .att('Id', 'rId1')
        .att('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument')
        .att('Target', 'xl/workbook.xml');

        let xmlString = xml.doc().end(promiseObj.xmlOutVars);
        promiseObj.xlsx.folder('_rels').file('.rels', xmlString);
        resolve(promiseObj);

    });
};

let addWorkBookXML = (promiseObj) => {
    // Required as stated in §12.2
    return new Promise((resolve, reject) => {

        let xml = xmlbuilder.create(
            'workbook',
            {
                'version': '1.0', 
                'encoding': 'UTF-8', 
                'standalone': true
            }
        );
        xml.att('mc:Ignorable', 'x15');
        xml.att('xmlns', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        xml.att('xmlns:mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006');
        xml.att('xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        xml.att('xmlns:x15', 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main');

        let sheetsEle = xml.ele('sheets');
        promiseObj.wb.sheets.forEach((s, i) => {
            sheetsEle.ele('sheet')
            .att('name', s.name)
            .att('sheetId', i + 1)
            .att('r:id', `rId${i + 1}`);
        });

        let xmlString = xml.doc().end(promiseObj.xmlOutVars);
        promiseObj.xlsx.folder('xl').file('workbook.xml', xmlString);
        resolve(promiseObj);

    });
};

let addWorkBookRelsXML = (promiseObj) => {
    // Required as stated in §12.2
    return new Promise((resolve, reject) => {

        let xml = xmlbuilder.create(
            'Relationships',
            {
                'version': '1.0', 
                'encoding': 'UTF-8', 
                'standalone': true
            }
        )
        .att('xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');

        xml
        .ele('Relationship')
        .att('Id', `rId${promiseObj.wb.sheets.length + 1}`)
        .att('Target', 'sharedStrings.xml')
        .att('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings');

        xml
        .ele('Relationship')
        .att('Id', `rId${promiseObj.wb.sheets.length + 2}`)
        .att('Target', 'styles.xml')
        .att('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles');

        promiseObj.wb.sheets.forEach((s, i) => {
            xml
            .ele('Relationship')
            .att('Id', `rId${i + 1}`)
            .att('Target', `worksheets/sheet${i + 1}.xml`)
            .att('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet');
        });

        let xmlString = xml.doc().end(promiseObj.xmlOutVars);
        promiseObj.xlsx.folder('xl').folder('_rels').file('workbook.xml.rels', xmlString);
        resolve(promiseObj);

    });
};

let addWorkSheetsXML = (promiseObj) => {
    // Required as stated in §12.2
    return new Promise ((resolve, reject) => {

        let curSheet = 0;
        
        let processNextSheet = () => {
            let thisSheet = promiseObj.wb.sheets[curSheet];
            if (thisSheet) {
                curSheet++;
                thisSheet
                .generateXML()
                .then((xml) => {
                    return new Promise((resolve) =>{
                        // Add worksheet to zip
                        promiseObj.xlsx.folder('xl').folder('worksheets').file(`sheet${curSheet}.xml`, xml); 
                        
                        //promiseObj.wb.logger.debug(xml);
                        resolve();
                    });
                })
                .then(() => {
                    return thisSheet.generateRelsXML();
                })
                .then((xml) => {
                    promiseObj.wb.logger.debug('generateRelsXML called');
                    promiseObj.wb.logger.debug(xml);
                    if (xml) {
                        promiseObj.xlsx.folder('xl').folder('worksheets').folder('_rels').file(`sheet${curSheet}.xml.rels`, xml);
                    }
                })
                .then(processNextSheet)
                .catch((e) => {
                    promiseObj.wb.logger.error(e.stack);
                });
            } else {
                resolve(promiseObj);
            }
        };
        processNextSheet();

    });
};

/**
 * Generate XML for SharedStrings.xml file and add it to zip file. Called from _writeToBuffer()
 * @private
 * @memberof WorkBook
 * @param {Object} promiseObj object containing jszip instance, workbook intance and xmlvars
 * @return {Promise} Resolves with promiseObj
 */
let addSharedStringsXML = (promiseObj) => {
    // §12.3.15 Shared String Table Part
    return new Promise ((resolve, reject) => {

        let xml = xmlbuilder.create(
            'sst',
            {
                'version': '1.0', 
                'encoding': 'UTF-8', 
                'standalone': true
            }
        )
        .att('count', promiseObj.wb.sharedStrings.length)
        .att('uniqueCount', promiseObj.wb.sharedStrings.length)
        .att('xmlns', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');

        promiseObj.wb.sharedStrings.forEach((s) => {
            xml.ele('si').ele('t').txt(s);
        });

        let xmlString = xml.doc().end(promiseObj.xmlOutVars);
        promiseObj.xlsx.folder('xl').file('sharedStrings.xml', xmlString);

        resolve(promiseObj);

    });
};

let addStylesXML = (promiseObj) => {
    // §12.3.20 Styles Part
    return new Promise ((resolve, reject) => {

        let xml = xmlbuilder.create(
            'styleSheet',
            {
                'version': '1.0', 
                'encoding': 'UTF-8', 
                'standalone': true
            }
        )
        .att('mc:Ignorable', 'x14ac')
        .att('xmlns', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        .att('xmlns:mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006')
        .att('xmlns:x14ac', 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac');

        if (promiseObj.wb.styleData.numFmts.length > 0) {
            let nfXML = xml
            .ele('numFmts')
            .att('count', promiseObj.wb.styleData.numFmts.length);
            promiseObj.wb.styleData.numFmts.forEach((nf) => {
                nf.addToXMLele(nfXML);
            });
        }

        let fontXML = xml
        .ele('fonts')
        .att('count', promiseObj.wb.styleData.fonts.length);
        promiseObj.wb.styleData.fonts.forEach((f) => {
            f.addToXMLele(fontXML);
        });

        let fillXML = xml 
        .ele('fills')
        .att('count', promiseObj.wb.styleData.fills.length);
        promiseObj.wb.styleData.fills.forEach((f) => {
            let fXML = fillXML.ele('fill');
            f.addToXMLele(fXML);
        });

        let borderXML = xml 
        .ele('borders')
        .att('count', promiseObj.wb.styleData.borders.length);
        promiseObj.wb.styleData.borders.forEach((b) => {
            b.addToXMLele(borderXML);
        });


        let cellXfsXML = xml 
        .ele('cellXfs')
        .att('count', promiseObj.wb.styles.length);
        promiseObj.wb.styles.forEach((s) => {
            s.addXFtoXMLele(cellXfsXML);
        });

        if (promiseObj.wb.dxfCollection.length > 0) {
            promiseObj.wb.dxfCollection.addToXMLele(xml);
        }

        let xmlString = xml.doc().end(promiseObj.xmlOutVars);
        promiseObj.wb.logger.debug(xmlString);
        promiseObj.xlsx.folder('xl').file('styles.xml', xmlString);

        resolve(promiseObj);
    });
};

/**
 * Use JSZip to generate file to a node buffer
 * @private
 * @memberof WorkBook
 * @param {WorkBook} wb WorkBook instance
 * @return {Promise} resolves with Buffer 
 */
let writeToBuffer = (wb) => {
    return new Promise ((resolve, reject) => {

        let promiseObj = {
            wb: wb, 
            xlsx: new JSZip(),
            xmlOutVars: { pretty: true, indent: '  ', newline: '\n' }
            //xmlOutVars : {}
        };


        if (promiseObj.wb.sheets.length === 0) {
            promiseObj.wb.WorkSheet();
        }

        addRootContentTypesXML(promiseObj)
        .then(addRootRelsXML)
        .then(addWorkBookXML)
        .then(addWorkBookRelsXML)
        .then(addWorkSheetsXML)
        .then(addSharedStringsXML)
        .then(addStylesXML)
        .then(() => {
            let buffer = promiseObj.xlsx.generate({
                type: 'nodebuffer',
                compression: wb.opts.jszip.compression
            });    
            resolve(buffer);
        })
        .catch((e) => {
            wb.logger.error(e.stack);
        });

    });
};

module.exports = { writeToBuffer };