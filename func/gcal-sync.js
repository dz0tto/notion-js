const { getPagesFilter, updatePage, getPageTitleByIDnName, getPageByPropertyID, getPageByID } = require("../notion/database/database.datalayer")();

const Path = require('path');
const Nconf = require('nconf');
Nconf
    .env()
    .file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));

// Read the base64-encoded JSON key from the environment variable
const serviceAccountKeyBase64 = Nconf.get('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { Base64 } = require('js-base64');

// Decode the base64-encoded JSON key
const serviceAccountKeyJson = JSON.parse(Base64.decode(serviceAccountKeyBase64));

const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2";

const studiCalId = "9t791q97fn0ae7otqmg1bvsirg@group.calendar.google.com"

const notPlannedSessions = 
{
    property: "GCal",
    rich_text: {
        is_empty : true,
    }
}

const plannedSessions = 
{
    property: "GCal",
    rich_text: {
        is_not_empty : true,
    }
}

const plannedStatuses = ["Назначено"];

const notReadyStatuses = ["Необходимо"];

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

const timezones = {
    'EVN': 'Asia/Yerevan',
    'MSK': 'Europe/Moscow',
    'TBS': 'Asia/Tbilisi',
    'Freelance': 'Europe/Moscow'
}

async function checkAndSyncSessions () {
    try {

        const jwtClient = new JWT(
            serviceAccountKeyJson.client_email,
            null,
            serviceAccountKeyJson.private_key,
            SCOPES,
            'dzotto@levsha.eu'
        );
        
        // Authorize and impersonate a user
        await jwtClient.authorize();
    

    
        // Use the JWT client for further API calls, e.g.
        const calendar = google.calendar({ version: 'v3', auth: jwtClient });

        
        const pages = await getPagesFilter(notPlannedSessions, databaseId)
        const notPlannedPages = pages?.filter(page => {
            const statusName = page.properties.Status.status.name;
            const renamed = page.properties["Ренейм"]?.rich_text[0]?.plain_text === "Renamed";
            return plannedStatuses.includes(statusName) && renamed;
        });
        for (const page of notPlannedPages) {
            try {
                const ev = await pageToEvent(page);
                    
                calendar.events.insert({
                    auth: jwtClient,
                    calendarId: studiCalId,
                    resource: ev,
                    }, function(err, event) {
                        if (err) {
                            console.log('There was an error contacting the Calendar service: ' + err);
                            return;
                        }
                        console.log('Event created: %s', event.data.htmlLink);
                        page.properties["GCal"].rich_text = [
                            {
                                "type": "text",
                                "text": {
                                    "content": event.data.id,
                                    "link": null
                                }
                            }
                            ]
                        const newPage = {
                            page_id: page.id,
                            properties: {
                                "GCal": page.properties["GCal"],
                            }
                        }
                        updatePage(newPage);
                });
            }
            catch (error) {
                console.error(error.body || error)
            }
        };

        const pPages = await getPagesFilter(plannedSessions, databaseId);
        const plannedPages = pPages?.filter(page => {
            const statusName = page.properties.Status.status.name;
            return plannedStatuses.includes(statusName);
        });
        if (!plannedPages) return;
        if (typeof plannedPages[Symbol.iterator] !== 'function') {
            return;
        }
        for (const page of plannedPages) {
            try {
                const eventID = page.properties["GCal"].rich_text[0].plain_text;
                if (!eventID) continue;
                const event = await calendar.events.get({
                    calendarId: studiCalId,
                    eventId: eventID});
                if (!event || event.data.status === "cancelled") {
                    page.properties["GCal"].rich_text = [
                        {
                            "type": "text",
                            "text": {
                                "content": "",
                                "link": null
                            }
                        }
                        ]
                    const newPage = {
                        page_id: page.id,
                        properties: {
                            "GCal": page.properties["GCal"],
                        }
                    }
                    updatePage(newPage);
                }
            }
            catch (error) {
                console.error(error.body || error)
            }
        }


        
    }
    catch (error) {
        console.error(error.body || error)
    }
}

async function pageToEvent(page) {
    const batchID = page.properties["🚗 Батч"].relation[0]?.id;
    if (!batchID || batchID === '') return null;
    console.log(`Getting batch with ID: ${batchID}`);

    const batchPage = await getPageByID(batchID);

    const batch = batchPage.properties["Название"].title[0].plain_text;

    //get mic from batch page
    const mic = batchPage.properties["Микрофон"].select ? batchPage.properties["Микрофон"].select.name : "";
    //get Bit/Hz from batch page from text field
    const bitHz = batchPage.properties["Bit/Hz"].rich_text ? batchPage.properties["Bit/Hz"].rich_text[0].plain_text : "";
    
    const actorID = page.properties["Актёр"].relation[0]?.id;
    let actor = '';
    if (!actorID || actorID === '') {
        actor = '';
    } else {
        console.log(`Getting actor with ID: ${actorID}`);
        actor = await getPageTitleByIDnName(actorID, "Name");
    }
    const studio = page.properties["Студия"].multi_select.map(v => v.name).join(", ");
    let date = page.properties["Начало"].date.start;
    if (!date || date === '') return null;
    const hours = page.properties["Часы"].number;
    if (!hours || hours === '') return null;
    //get link from Zoom property
    const zoomLink = page.properties["Zoom"].url;
    //get text from ID property of ID type
    const id = page.properties["ID"].unique_id.number;
    var dateStart = new Date(date);
    var dateEnd = new Date(date);
    dateEnd.setMinutes(dateEnd.getMinutes() + hours * 60);
    const link = `https://www.notion.so/${databaseId}?p=${page.id.replace(/-/g, "")}&pm=s`;
    var desc = `NotionID: ${id}\nZoom: ${zoomLink}\n\nNotion: ${link}`;
    var subj = studio  + " |" + mic  + "|" + bitHz + "| " + actor + " | " + batch;
    const tz = timezones[studio];
    if (!tz || tz === '') return null;
    const event = {
        summary: subj,
        description: desc,
        start: {
            dateTime: dateStart,
            timeZone: tz,
        },
        end: {
            dateTime: dateEnd,
            timeZone: tz,
        },
    };
    return event;
}

async function checkAndDeleteEvents() {
    try {
        const jwtClient = new JWT(
            serviceAccountKeyJson.client_email,
            null,
            serviceAccountKeyJson.private_key,
            SCOPES,
            'dzotto@levsha.eu'
        );
    
        jwtClient.authorize(async function (err, tokens) {
            if (err) {
                console.log(err);
                return;
            }
    
            // Use the JWT client for further API calls, e.g.
            const calendarGoogle = google.calendar({ version: 'v3', auth: jwtClient });
    
            const response = await calendarGoogle.events.list({
                calendarId: '9t791q97fn0ae7otqmg1bvsirg@group.calendar.google.com',
                timeMin: (new Date()).toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items;
            if (events.length) {
                console.log('Upcoming events: ', events.length);
                for (const event of events) {
                    const start = event.start.dateTime || event.start.date;
                    //console.log(`${start} - ${event.summary}`);

                    // Extract NotionID from event description
                    const idMatches = event.description?.match(/NotionID: (\d+)/);
                    const notionId = idMatches ? idMatches[1] : null;
                    if (!notionId) continue;
                    // Check if the Notion page exists
                    const page = await getPageByPropertyID(databaseId, notionId);
                    const status = page?.properties?.Status.status.name;
                    const notReady = status && notReadyStatuses.includes(status);
                    if (!page || notReady) {
                        // If the page doesn't exist or not ready, delete the event
                        await calendarGoogle.events.delete({
                            calendarId: '9t791q97fn0ae7otqmg1bvsirg@group.calendar.google.com',
                            eventId: event.id,
                        }).then(() => { console.log(`Event ${event.id} deleted.`); })
                        .finally(() => {
                            if (page && notReady) {
                                page.properties["GCal"].rich_text = [
                                    {
                                        "type": "text",
                                        "text": {
                                            "content": "",
                                            "link": null
                                        }
                                    }
                                    ]
                                const newPage = {
                                    page_id: page.id,
                                    properties: {
                                        "GCal": page.properties["GCal"],
                                    }
                                }
                                updatePage(newPage);
                            }
                        });
                        
                    }
                }
            } else {
                console.log('No upcoming events found.');
            }
        });
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

module.exports.updateGCalEvent = function(eventId, page) {
    try {
        const jwtClient = new JWT(
            serviceAccountKeyJson.client_email,
            null,
            serviceAccountKeyJson.private_key,
            SCOPES,
            'dzotto@levsha.eu'
        );
    
        jwtClient.authorize(async function (err, tokens) {
            if (err) {
                console.log(err);
                return;
            }
    
            // Use the JWT client for further API calls, e.g.
            const calendarGoogle = google.calendar({ version: 'v3', auth: jwtClient });
            // get event by id
            const event = await calendarGoogle.events.get({
                calendarId: studiCalId,
                eventId: eventId});

            const ev = await pageToEvent(page);
            if (ev === null) return null;
            event.data.description = ev.description;
            event.data.summary = ev.summary;
            event.data.start = ev.start;
            event.data.end = ev.end;

            calendarGoogle.events.update({
                calendarId: studiCalId,
                eventId: eventId,
                resource: event.data,
                }, function(err, event) {
                    if (err) {
                        console.log('There was an error contacting the Calendar service: ' + err);
                        return;
                    }
                    console.log('Event updated: %s', event.data.htmlLink);
            });


        });
    }
    catch (error) {
        console.error('An error occurred:', error);
    }
}

module.exports.executePlanSessions = function() {
    checkAndSyncSessions()
        .then(checkAndDeleteEvents)
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executePlanSessions, 90 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);

            // Call failed, set next timeout
            setTimeout(module.exports.executePlanSessions, 90 * 1000);
        });
}
