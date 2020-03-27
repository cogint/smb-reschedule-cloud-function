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

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    agent.handleRequest(intentMap);
});


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
