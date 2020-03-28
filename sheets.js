const {google} = require('googleapis');

// ToDo: make a proper module with constructor here
const sheetId = '16rs2cUv5yL-N0eUt1BjTqr2xDaO8nyORE-Cq1ZBaylA';
const key = 'AIzaSyCiDSamuSwwaQgy5l9uHXrq72wh0VvSCbo';

exports.getCell = async function (range) {
    const sheets = google.sheets({version: 'v4'});
    let params =
        {
            spreadsheetId: sheetId,
            range: range,
            key: key,
        };
    // ToDo: error checking
    return (await sheets.spreadsheets.values.get(params)).data.values[0][0];
};

exports.getRange = async function (range) {
    const sheets = google.sheets({version: 'v4'});
    let params =
        {
            spreadsheetId: sheetId,
            range: range,
            key: key,
        };
    // ToDo: error checking
    return (await sheets.spreadsheets.values.get(params)).data.values;
};

exports.writeData = async function (jwt, cell, value) {
    const sheets = google.sheets({version: 'v4'});

    const request = {
        // The ID of the spreadsheet to update.
        key: key,
        auth: jwt,
        spreadsheetId: sheetId,
        range: cell,
        valueInputOption: 'RAW',
        resource: {
            range: cell,
            majorDimension: 'ROWS',
            values: [[value]]
        },
    };

    return (await sheets.spreadsheets.values.update(request)).data;
};
