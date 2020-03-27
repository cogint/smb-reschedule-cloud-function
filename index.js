/* jshint esversion: 8 */
// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {google} = require('googleapis');

// For sheet intregration
const key = 'AIzaSyCiDSamuSwwaQgy5l9uHXrq72wh0VvSCbo';
const sheetId = '16rs2cUv5yL-N0eUt1BjTqr2xDaO8nyORE-Cq1ZBaylA';

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    async function welcome(agent) {

        return await getData('bot!B1')
            .then(data=>{
                const company_name = data[0][0];
                console.log(data);
                agent.add(`Welcome to ${company_name}!`);
                agent.setContext({ name: 'promptdata', lifespan: 99, parameters: { company_name: company_name }});
            });

    }

    async function introduction(agent) {

        return await getData('bot!B1')
            .then(data=>{
                const company_name = data[0][0];
                console.log(data);
                agent.add(`Welcome to ${company_name}!`);
                agent.setContext({ name: 'promptdata', lifespan: 99, parameters: { company_name: company_name }});
            });

    }

    async function transfer(agent) {

        return await getData('setup!B1')
            .then(data=>{
                const phone_number = data[0][0];
                console.log(data);
                agent.setContext({ name: 'transferdata', lifespan: 99, parameters: { phone_number: phone_number }});
            });

    }


    async  function testWrite(agent){
        return await
            getJwt()
            .then(
                (jwt)=> writeData(jwt,'write!C2', Date.now() ))
            .then(res=>console.log(JSON.stringify(res)))
            .catch(err=>console.error(err));
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Introduction', introduction);
    intentMap.set('TESTING: write to cell', testWrite);
    intentMap.set('transfer', transfer);
    agent.handleRequest(intentMap);
});

async function getJwt() {
    const credentials = require("./credentials.json");
    return await new google.auth.JWT(
        credentials.client_email, null, credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
}

async function getData(range) {
    const sheets = google.sheets({version: 'v4'});
    let params =
        {
            spreadsheetId: sheetId,
            range: range,
            key: key,
        };
    return (await sheets.spreadsheets.values.get(params)).data.values;
}

async function writeData(auth, cell, value){
    const sheets = google.sheets({version: 'v4'});

    const request = {
        // The ID of the spreadsheet to update.
        key: key,
        auth: auth,
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
}
