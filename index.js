/* jshint esversion: 8 */
// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const sheets = require('./sheets.js');
const cal = require('./calendar');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const COMPANY_NAME_CELL = 'bot!B1';
const BUSINESS_NUMBER_CELL = 'setup!B5';
const TRANSFER_NUMBER_CELL = 'setup!B1';

let jwt = false;
async function getJwt() {
    if(jwt !== false)
        return jwt;

    console.log("Getting JWT");
    const credentials = require("./credentials.json");
    return await new google.auth.JWT(
        credentials.client_email, null, credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/calendar']
    );
}

exports.dialogflowFirebaseFulfillment =  functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    /*
    // populate the JWT as needed
    if(jwt===false){
        getJwt()
            .then(token=>{
                jwt = token;
                console.log("JWT: ", token)
            });
    }*/

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

    // Meant for inbound text
    async function welcome(agent) {

        return await sheets.getCell(COMPANY_NAME_CELL)
            .then(data => {
                const company_name = data;
                console.log(data);
                agent.add(`Hi. Thanks for contacting ${company_name}!`);
                agent.add(`We are back open. Would you like to schedule an appointment?`);
                agent.setContext({name: 'promptdata', lifespan: 99, parameters: {company_name: company_name}});
            });
    }

    // meant for inbound Phone calls
    async function welcomePhone(agent){
        console.log("Call from Drachtio");
        //console.log(request.body);

        const customer_name = agent.parameters.customer_name;
        const calling_number = agent.parameters.calling_number;

        return await sheets.getCell(COMPANY_NAME_CELL)
            .then(data => {
                const company_name = data;
                console.log(`company_name: ${data}`);
                agent.add(`<speak><break time="1">Thanks for calling ${company_name}!</speak>`);

                if (customer_name.length > 0)
                    agent.add(`<speak>It looks like I am speaking to ${customer_name.split(" ")[0]} ?<break time="500ms"></speak>`);

                agent.add(`<speak><p><s>We are back open.</s> <s>Would you like to schedule an appointment?</s></speak>`);
                agent.setContext({name: 'promptdata', lifespan: 99, parameters: {company_name: company_name}});
            });

    }

    // For outbound phone calls
    async function introduction(agent) {

        // ToDo: get from a parameter once Drachtio sends that
        const customer_name = agent.parameters.customer_name;


        return await sheets.getCell(COMPANY_NAME_CELL)
            .then(data => {
                //ToDo: error checking
                company_name = data;
                useGuiResponses();
            })
            .then(() => sheets.getCell(BUSINESS_NUMBER_CELL))
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

        return getCell(TRANSFER_NUMBER_CELL)
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

    // ToDo: remove - no longer needed?
    async function testWrite(agent) {
        await writeData(jwt, 'write!C2', Date.now())
                .then(res => console.log(JSON.stringify(res)))
                .catch(err => console.error(err));
    }

    function schedule(agent){
        // ToDo: add some availability logic here
        //console.log(cal.listEvents(jwt, new Date())); // ToDo: testing
        agent.add("ok, let's get you scheduled. What date and time would you like?")
    }

    function makeAppointment(agent) {
        // Use the Dialogflow's date and time parameters to create Javascript Date instances, 'dateTimeStart' and 'dateTimeEnd',
        // which are used to specify the appointment's time.
        const appointmentDuration = 1;// Define the length of the appointment to be one hour.
        const dateTimeStart = cal.convertParametersDate(agent.parameters.date, agent.parameters.time);
        const dateTimeEnd = cal.addHours(dateTimeStart, appointmentDuration);
        const appointmentTimeString = cal.getLocaleTimeString(dateTimeStart);
        const appointmentDateString = cal.getLocaleDateString(dateTimeStart);
        // Check the availability of the time slot and set up an appointment if the time slot is available on the calendar
        return getJwt()
            .then(jwt=>cal.createCalendarEvent(jwt, dateTimeStart, dateTimeEnd))
            .then(() => {
            agent.add(`Got it. I have your appointment scheduled on ${appointmentDateString} at ${appointmentTimeString}. See you soon. Good-bye.`);
        }).catch((err) => {
            console.log("Apointment rejected: ", err);
            agent.add(`Sorry, we're booked on ${appointmentDateString} at ${appointmentTimeString}. Is there anything else I can do for you?`);
        });
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
    intentMap.set('Welcome (phone)', welcomePhone);
    intentMap.set('Introduction', introduction);

    // no scheduling now
    intentMap.set('contact later', contactLater);
    intentMap.set('contact not there', contactLater);
    intentMap.set('not ready to schedule', contactLater);
    intentMap.set('contact not ready', contactLater);

    // schedule
    intentMap.set('contact ready', schedule);
    intentMap.set('ready to schedule', schedule);
    intentMap.set('schedule', makeAppointment);


    //intentMap.set('transfer', transfer);
    agent.handleRequest(intentMap);
});


Array.prototype.sample = function(){
    return this[Math.floor(Math.random()*this.length)];
};

