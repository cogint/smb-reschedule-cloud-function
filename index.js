/* jshint esversion: 8 */
// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const {getCell, writeData} = require('./sheets.js');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const COMPANY_NAME_CELL = 'bot!B1';
const BUSINESS_NUMBER_CELL = 'setup!B5';

let jwt = false;
async function getJwt() {
    const credentials = require("./credentials.json");
    return await new google.auth.JWT(
        credentials.client_email, null, credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/calendar']
    );
}


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    // populate the JWT as needed
    if(!jwt)
        jwt = getJwt();

    // Agent vars
    let customer_name = 'David';
    let company_name = "";
    let business_number = "";
    let phone_number = "";

    // Use responses from the GUI and substitute variable names as needed
    function useGuiResponses(){
        request.body.queryResult.fulfillmentMessages.forEach(message=>{
            let msg = message.text.text[0];
            msg = msg.replace("${company_name}", company_name);
            msg = msg.replace("${customer_name}", customer_name);
            msg = msg.replace("${phone_number}", phone_number);
            msg = msg.replace("${business_number}", business_number);


            agent.add(msg);
            console.log(msg);
        })

    }


    async function welcome(agent) {

        return await getCell(COMPANY_NAME_CELL)
            .then(data => {
                const company_name = data;
                console.log(data);
                agent.add(`Welcome to ${company_name}!`);
                agent.setContext({name: 'promptdata', lifespan: 99, parameters: {company_name: company_name}});
            });

    }

    async function introduction(agent) {

        // ToDo: get from a parameter once Drachtio sends that

        return await getCell('bot!B1')
            .then(data => {
                //ToDo: error checking
                company_name = data;
                useGuiResponses();

                //agent.setContext({ name: 'promptdata', lifespan: 99, parameters: { company_name: company_name, customer_name: customer_name}});

                //console.log(JSON.stringify(request.body.queryResult.fulfillmentMessages));

                // ToDo: find a better way to do this

                /*
                agent.add([
                    `Hi, I am an automated assistant calling on behalf of ${company_name} to reschedule your appointment.`,
                    `Hello. I am an automated assistant for a  ${company_name}. I am calling to reschedule your appointment that was cancelled.`,
                    `Hi. I am calling about your appointment with a ${company_name} that was cancelled. I am a virtual assistant here to help reschedule that.`
                ]);
                agent.add([
                    `Is this ${customer_name}?`,
                    `Can I speak to ${customer_name}?`,
                    `Am I talking to ${customer_name}?`
                ])
                */
            })
            .then(() => getCell(BUSINESS_NUMBER_CELL))
            .then(data => {
                    business_number = data;
                    agent.setContext({
                        name: 'promptdata',
                        lifespan: 99,
                        parameters: {
                            company_name: company_name,
                            customer_name: customer_name,
                            business_number: business_number
                        }
                    });
                }
            )
            .catch(err=>console.error(err));

    }

    async function transfer(agent) {

        return await getCell('setup!B1')
            .then(data => {
                phone_number = data;
                console.log(data);
                agent.setContext({name: 'transferdata', lifespan: 99, parameters: {phone_number: phone_number}});
            });

    }

    function contactLater(agent){

        const responseSet1 = [
            "No problem. I just wanted to let you know #promptdata.company_name is open again.",
            "Sorry, we just wanted to let you know #promptdata.company_name is open."
        ];

        const responseSet2 = [
            "Feel free to call or text #promptdata.business_number to reschedule.",
            "Call or text #promptdata.business_number anytime to reschedule."
        ];

        const responseSet3 = [
            "Have a good day. Bye.",
            "Thanks for your help. Good bye!"
        ];

        agent.add(responseSet1.sample());
        agent.add(responseSet2.sample());
        agent.add(responseSet3.sample());


    }


    async function testWrite(agent) {
        await writeData('write!C2', Date.now())
                .then(res => console.log(JSON.stringify(res)))
                .catch(err => console.error(err));
    }

    function schedule(agent){
        // ToDo:
        agent.add("ok, let's get you scheduled")
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();

    // debugging and tests
    intentMap.set('TESTING: write to cell', testWrite);

    // Initiation intents
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Introduction', introduction);

    // no scheduling now
    intentMap.set('contact later', contactLater);
    intentMap.set('contact not there', contactLater);
    intentMap.set('not ready to schedule', contactLater);
    intentMap.set('contact not ready', contactLater);

    // schedule
    intentMap.set('contact ready', schedule);
    intentMap.set('ready to schedule', schedule);


    //intentMap.set('transfer', transfer);
    agent.handleRequest(intentMap);
});


Array.prototype.sample = function(){
    return this[Math.floor(Math.random()*this.length)];
};

