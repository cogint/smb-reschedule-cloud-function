// Module modified from:
// https://cloud.google.com/dialogflow/docs/tutorials/build-an-agent/create-fulfillment-using-webhook

const {google} = require('googleapis');
const calendar = google.calendar('v3');

const calendarId = 'cwh.consulting_7493utfsak43l161agid9p5d50@group.calendar.google.com';
const key = 'AIzaSyCiDSamuSwwaQgy5l9uHXrq72wh0VvSCbo';

// ToDo: make these parameters
const timeZone = 'America/New_York';
const timeZoneOffset = '-04:00';

exports.createCalendarEvent = function (jwt, dateTimeStart, dateTimeEnd, title) {
    console.log("createCalendarEvent request from JWT: " + jwt.email);

    return new Promise((resolve, reject) => {
        calendar.events.list({  // List all events in the specified time period
            auth: jwt,
            //key: key,
            calendarId: calendarId,
            timeMin: dateTimeStart.toISOString(),
            timeMax: dateTimeEnd.toISOString()
        }, (err, calendarResponse) => {
            // Check if there exists any event on the calendar given the specified the time period
            if (err || calendarResponse.data.items.length > 0) {
                console.info("calendar error", err);
                reject(err || new Error('Requested time conflicts with another appointment'));
            } else {
                // Create an event for the requested time period
                calendar.events.insert({
                        auth: jwt,
                        calendarId: calendarId,
                        resource: {
                            summary: title,
                            start: {dateTime: dateTimeStart},
                            end: {dateTime: dateTimeEnd}
                        }
                    }, (err, event) => {
                        err ? reject(err) : resolve(event);
                    }
                );
            }
        });
    });
};

// A helper function that adds the integer value of 'hoursToAdd' to the Date instance 'dateObj' and returns a new Data instance.
function addHours(dateObj, hoursToAdd) {
    return new Date(new Date(dateObj).setHours(dateObj.getHours() + hoursToAdd));
}
exports.addHours = addHours;

// A helper function that receives Dialogflow's 'date' and 'time' parameters and creates a Date instance.
exports.convertParametersDate = function (date, time) {
    // ToDo: temp hack to fix AM/PM mix-ups

    // 0 - 7 should be PM
    // 20-23 should be AM
    // in the middle we should ask, but that is a To Do
    let t = new Date(time);
    t = addHours(t, -4);    //Timezone ofset on hours
    let h = t.getHours();
    if (h >= 0 && h <=7)
        t = addHours(t, 12);
    else if (h >= 20 && h<=23)
        t = addHours(t, -12);

    //let newDate = new Date(Date.parse(date.split('T')[0] + 'T' + time.split('T')[1].split('-')[0] + timeZoneOffset));

    let newDate = new Date(Date.parse(date.split('T')[0] + 'T' + t.toISOString().split('T')[1].split('.')[0] + timeZoneOffset));
    //console.log(newDate);
    return newDate

};

// A helper function that converts the Date instance 'dateObj' into a string that represents this time in English.
exports.getLocaleTimeString = function (dateObj) {
    return dateObj.toLocaleTimeString('en-US', {hour: 'numeric', hour12: true, timeZone: timeZone});
};

// A helper function that converts the Date instance 'dateObj' into a string that represents this date in English.
exports.getLocaleDateString = function (dateObj) {
    return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: timeZone
    });
};

exports.listEvents = function(jwt, dateTimeStart, dateTimeEnd) {
    const calendar = google.calendar({version: 'v3', jwt});

    const maxResults = 12;
    let params = {
        auth: jwt,
        //key: key,
        calendarId: calendarId,
        timeMin: dateTimeStart || (new Date()).toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
    };

    if (dateTimeEnd)
        params.timeMax = dateTimeEnd;


    calendar.events.list(params, (err, res) => {

        if (err) return console.log('The API returned an error: ' + err);
        const events = res.data.items;
        if (events.length) {
            console.log(`Upcoming ${maxResults} events:`);
            events.map((event, i) => {
                const start = event.start.dateTime || event.start.date;
                console.log(`${start} - ${event.summary}`);
            });
        } else {
            console.log('No upcoming events found.');
        }
    });
};
