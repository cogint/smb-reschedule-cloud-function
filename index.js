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

// Ranges used for Sheets interface
const COMPANY_NAME_CELL = 'setup!B7';
const BUSINESS_NUMBER_CELL = 'setup!B5';
const TRANSFER_NUMBER_CELL = 'setup!B1';
const DISPOSITION_COL = 'phone numbers!D';
const DIALER_RANGE = 'phone numbers!A:D';

let jwt = false;

async function getJwt() {
    if (jwt !== false)
        return jwt;

    console.log("Getting JWT");
    const credentials = require("./credentials.json");
    return await new google.auth.JWT(
        credentials.client_email, null, credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/calendar']
    );
}

let dispositionSet = false;

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    // Agent vars
    let customer_name;
    let company_name;
    let business_number;
    let phone_number;
    let calling_number;
    let called_number;
    let call_direction;

    // Use responses from the GUI and substitute variable names as needed
    function useGuiResponses() {
        request.body.queryResult.fulfillmentMessages.forEach(message => {
            let msg = message.text.text[0];
            msg = msg.replace(/\$company_name/i, company_name);
            msg = msg.replace(/\$customer_name/i, customer_name);
            msg = msg.replace(/\$phone_number/i, phone_number);
            msg = msg.replace(/\$business_number/i, business_number);

            agent.add(msg);
            console.log("useGuiResponses: " + msg);
        })
    }

    // Meant for inbound text
    async function welcome(agent) {

        return await sheets.getCell(COMPANY_NAME_CELL)
            .then(data => {
                company_name = data;
                console.log(data);
                agent.add(`Hi. Thanks for contacting ${company_name}!`);
                agent.add(`We are back open. Would you like to schedule an appointment?`);
                agent.setContext({name: 'promptdata', lifespan: 99, parameters: {company_name: company_name}});
            });
    }

    // meant for inbound Phone calls
    async function welcomePhone(agent) {
        console.log("Call from Drachtio");
        //console.log(request.body);

        customer_name = agent.parameters.customer_name;
        calling_number = agent.parameters.calling_number;

        let parameters = agent.parameters;


        return await sheets.getCell(COMPANY_NAME_CELL)
            .then(data => {
                company_name = data;
                console.log(`company_name: ${data}`);
                agent.add(`<speak><break time="1"/>Thanks for calling ${company_name}!</speak>`);

                if (customer_name.length > 0)
                    agent.add(`<speak>It looks like I am speaking to ${customer_name.split(" ")[0]} ?<break time="500ms"/></speak>`);

                agent.add(`<speak><p><s>We are back open.</s> <s>Would you like to schedule an appointment?</s></speak>`);

                parameters.company_name = company_name;
                agent.setContext({name: 'promptdata', lifespan: 99, parameters: parameters});
            });

    }

    // For outbound phone calls
    async function introduction(agent) {

        // ToDo: get from a parameter once Drachtio sends that
        call_direction = "outbound";
        customer_name = agent.parameters.customer_name;
        called_number = agent.parameters.called_number;

        console.log("starting parameters: ", agent.parameters);

        // ToDo: have dractio pull the company name
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
                            business_number: business_number,
                            called_number: called_number,
                            call_direction: call_direction
                        }
                    });
                }
            )
            .catch(err => console.error(err));

    }

    async function transfer(agent) {

        return getCell(TRANSFER_NUMBER_CELL)
            .then(data => {
                phone_number = data;
                console.log(data);
                agent.setContext({name: 'transferdata', lifespan: 99, parameters: {phone_number: phone_number}});
            });

    }

    function contactLater(agent) {

        let promptData = agent.getContext('promptdata');
        company_name = promptData.parameters.company_name;
        business_number = promptData.parameters.business_number;
        called_number = promptData.parameters.called_number;

        const responseSet1 = [
            `No problem. I just wanted to let you know ${company_name} is open again.`,
            `Sorry, we just wanted to let you know ${company_name} is open.`
        ];

        const responseSet2 = [
            `Feel free to call or text ${business_number} to reschedule.`,
            `Call or text ${business_number} anytime to reschedule.`
        ];

        const responseSet3 = [
            "Have a good day. Bye.",
            "Thanks for your help. Good bye!"
        ];


        agent.add(responseSet1.sample());
        agent.add(responseSet2.sample());
        agent.add(responseSet3.sample());

        // ToDo: I can't figure out why this won't write to the sheet
        disposition(called_number, "try later")
            .catch(err => console.log("disposition error: ", err));


    }

    function schedule(agent) {
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

        let promptData = agent.getContext('promptdata');


        // ToDo: it would be nice to have the typing in the background during the calendar lookup
        const max = 5;
        const min = 2;
        const duration = Math.random() * (max - min) + min;

        let jwt;

        return getJwt()
            .then(token => {
                jwt = token;
                cal.createCalendarEvent(jwt, dateTimeStart, dateTimeEnd, "TADHack - " + customer_name);
            })
            .then(() => {
                agent.add(`<speak><audio repeatDur="${duration} s" src= "https://actions.google.com/sounds/v1/office/keyboard_typing_fast_close.ogg"><desc>keyboard typing</desc></audio></speak>`);
                agent.add(`Got it. I have your appointment scheduled on ${appointmentDateString} at ${appointmentTimeString}. See you soon. Good-bye.`);
            })
            .then(() => disposition(jwt, promptData.parameters.called_number, `Scheduled for  ${appointmentDateString} ${appointmentTimeString}`))
            .catch((err) => {
                console.log("Appointment rejected: ", err);
                agent.add(`<speak><audio repeatDur="${duration} s" src= "https://actions.google.com/sounds/v1/office/keyboard_typing_fast_close.ogg"><desc>keyboard typing</desc></audio></speak>`);
                agent.add([
                    `<speak>Sorry, we're booked on ${appointmentDateString} at ${appointmentTimeString}. <break time="500ms"/> Are there any other times that would work?</speak>`,
                    `<speak>Unfortunately ${appointmentTimeString} on ${appointmentDateString} is not free. <break time="400ms"/> Are there other times on ${appointmentDateString} that work for you?</speak>`,
                    `<speak>It looks like ${appointmentDateString} at ${appointmentTimeString} is taken. <break time="600ms"/> How about another time?</speak>`
                ].sample());
            });
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();

    // debugging and tests
    // intentMap.set('TESTING: write to cell', testWrite);

    // Initiation intents
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Welcome (phone)', welcomePhone);
    intentMap.set('Introduction', introduction);

    // no scheduling now
    intentMap.set('contact later', contactLater);
    intentMap.set('contact not there', contactLater);
    intentMap.set('not ready to schedule', contactLater);
    intentMap.set('contact not ready', contactLater);
    intentMap.set('inbound no schedule', contactLater);


    // schedule
    intentMap.set('contact ready', schedule);
    intentMap.set('ready to schedule', schedule);
    intentMap.set('schedule', makeAppointment);


    //intentMap.set('transfer', transfer);
    agent.handleRequest(intentMap);
});


Array.prototype.sample = function () {
    return this[Math.floor(Math.random() * this.length)];
};

async function disposition(jwt, phone_num, message) {

    console.log(`Setting disposition for ${phone_num}: ${message}`);

    if (dispositionSet)
        return;

    return await sheets.getRange(DIALER_RANGE)
        .then(data => {
            let index = data.findIndex(row => (row[0].replace('+', '') === phone_num.replace('+', '')));
            return  (index !== -1) ? index : Promise.reject('no matching phone number');
        })
        .then((index)=>
            sheets.writeData(jwt, DISPOSITION_COL + (index + 1), message))
        .then(()=>{
            dispositionSet = true;
            console.log(`Set disposition for ${phone_num}: ${message}`);
        })
        .catch(err => console.log("disposition error", err));
}
