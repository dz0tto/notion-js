  

const { getPagesFilter, getPageTitleByIDnName, getEmailByPageID, updatePage, getPageByID  } = require("../notion/database/database.datalayer")();
const { updateGCalEvent } = require("./gcal-sync");

const moment = require('moment-timezone');
require('moment/locale/ru');

const _ = require('lodash');

const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const SlackNotifier = require('../slack/slack');
const slackToken = Nconf.get("SLACK_NOTIF_SESS_TOKEN"); // Replace with your Slack app's token
const slackNotifier = new SlackNotifier(slackToken);

const notionTimezone = 'Europe/Moscow';

const sessionStored = [];

const databaseId = "527a3d104ebc4c72a524a94341f32339"

async function checkChangesSendNotif () {
    try {
        const pages = await getPagesFilter(null, databaseId)
        // save all pages to sessionStored
    
        for (const page of pages) {
        // check if there is page in sessionStored
        const oldSession = sessionStored.find((session) => { 
            return session.id === page.id
        })
        if (!oldSession) {
            // if no - add to sessionStored
            sessionStored.push(page);
        } else {
            // if yes - check if status changed
            const oldStatus = oldSession.properties["Status"].status.name;
            const newStatus = page.properties["Status"].status.name;
            if (oldStatus !== newStatus) {
            // get emails from page
                const batchID = page.properties["🚗 Батч"].relation[0].id;
                const director = page.properties["Режиссёр"]?.people[0]?.person?.email || "";
                const postProd = page.properties["Постпрод"]?.people[0]?.person?.email || "";
                const engineer = page.properties["Инженер"]?.people[0]?.person?.email || "";
                const soundqa = page.properties["Отслушка"]?.people[0]?.person?.email || "";
                const pms = await getEmailByPageID(batchID, "Менеджер батча");
                const people = { 
                    "Режиссёр" : director, 
                    "Постпрод" : postProd, 
                    "Инженер" : engineer,
                    "Отслушка" : soundqa,
                    "Менеджер батча" : [...pms]
                };
                const emails = [director, postProd, engineer, soundqa, ...pms].filter(email => email !== "")
                // send notification
                for (const email of emails) {
                    const message = await formatSessionNotification(page, oldStatus, newStatus, notionTimezone, email, people);
                    if (message) {
                        slackNotifier.sendMessageToUser(email, message);
                    }
                }
                // update sessionStored
                const index = sessionStored.findIndex((session) => {
                    return session.id === page.id
                })
                sessionStored[index] = page;
                // update zoom calendar
            }
            else if (updateDescription(oldSession, page, propWatchCal)) {
                const index = sessionStored.findIndex((session) => {
                    return session.id === page.id
                })
                sessionStored[index] = page;
            }
        }
        } 
    }
    catch (error) {
        console.error(error.body || error)
    }
}

const propWatchCal = ["Актёр", "Студия", "Начало", "Часы", "Zoom", "ID"]

function updateDescription(oldSession, newSession, propArray) {

    // Initialize an array to store the changes
    const changes = [];

    // Iterate over the properties to watch
    for (const prop of propArray) {
        // Compare the property values in oldSession and newSession
        if (!_.isEqual(oldSession.properties[prop], newSession.properties[prop])) {
            // If the values are different, add the property to the changes array
            changes.push(prop);
        }
    }


    if (changes.length > 0) {
        // update zoom calendar
        const gcalEventId = newSession.properties["GCal"].rich_text && newSession.properties["GCal"].rich_text.length > 0 ? newSession.properties["GCal"].rich_text[0].plain_text: null;
        if (gcalEventId && gcalEventId !== '') {
            updateGCalEvent(gcalEventId, newSession);
        }
        return true
    } else {
        return false
    }
}

    
    //define formatSessionNotification
async function formatSessionNotification(page, oldStatus, newStatus, notionTimezone, email, people) {
    // Function to format date and time
    const formatDateTime = (momentObj, format) => {
        momentObj.locale('ru');
        return momentObj.tz(notionTimezone).format(format);
    };
    
    // Extracting and formatting date and time
    const startDate = moment(page.properties["Начало"]?.date?.start);
    const durationHours = page.properties["Часы"]?.number || 0;
    const endDate = startDate.clone().add(durationHours, 'hours');
    
    const formattedStart = formatDateTime(startDate, 'DD MMMM, HH:mm');
    const formattedEnd = formatDateTime(endDate, 'HH:mm');
    
    const roleDeadlines = {}
    
    roleDeadlines["Постпрод"] = page.properties["Дедлайн постпрода"]?.date?.start ? formatDateTime(moment(page.properties["Дедлайн постпрода"]?.date?.start), 'DD MMMM, HH:mm') : null;
    roleDeadlines["Отслушка"] = page.properties["Дедлайн отслушки"]?.date?.start ? formatDateTime(moment(page.properties["Дедлайн отслушки"]?.date?.start), 'DD MMMM, HH:mm') : null;
    
    // Constructing message content
    const link = `https://www.notion.so/${databaseId}?p=${page.id.replace(/-/g, "")}&pm=s`;
    const batchID = page.properties["🚗 Батч"].relation[0].id;
    const batch = await getPageTitleByIDnName(batchID, "Название");
    const batchLink = `https://www.notion.so/${batchID}`.replace(/-/g, "");
    const actorID = page.properties["Актёр"].relation[0].id;
    const actor = await getPageTitleByIDnName(actorID, "Name");
    
    // check if email is in people and get the role
    const role = Object.keys(people).find(key => people[key] === email || (Array.isArray(people[key]) && people[key].includes(email)));
    
    // if (role !== 'Отслушка') return false
    
    // Format the Slack message block
    const slackMessage = {
        "text" : `Сессия по расписанию закончилась. Сессия была записана?`,
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "Сессия записана?",
                    "emoji": true
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*Батч*: <${batchLink}|${batch}>\n*Актёр*: ${actor}\n*Время*: ${formattedStart} - ${formattedEnd} MSK`
                }
            }
        ]};
    slackMessage.blocks.push({
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": `<${link}|Посмотреть в Notion>`
        }
    });

    // Add buttons to the message
    const buttons = [
        {
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "Да",
                "emoji": true
            },
            "value": `choice_sessionRecorded_${page.id}` // Include the page.id in the action_id
        },
        {
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "Нет, не состоялась",
                "emoji": true
            },
            "value": `choice_sessionNo_${page.id}` // Include the page.id in the action_id
        }
    ];
    addButtonsToMessage(slackMessage, buttons);


    
    return slackMessage;
}

function addButtonsToMessage(message, buttons) {
    message.blocks.push({
        "type": "actions",
        "elements": buttons
    });
    return message;
}
    
module.exports.executeCheckChangesSendNotif = function(req, res) {
    
    const payload = JSON.parse(req.body.payload);

    // Extract the clicked button's value
    const actionValue = payload.actions[0].value;

    const actionId = payload.actions[0].action_id;

    const actions = actionId.split('_');

    if (!actions || actions.length !== 3 || actions[0] !== 'choice') {
        console.error(`Unknown action: ${actionValue}`);
        return;
    }

    const pageId = actions[2];

    const action = actions[1];

    let recorded = false;
    let processed = false;

    // Handle the action
    switch (action) {
        case 'sessionRecorded':
            changeSessionStatus(pageId, 'Записано');
            recorded = true;
            processed = true;
            break;
        case 'sessionNo':
            changeSessionStatus(pageId, 'Необходимо');
            recorded = false;
            processed = true;
            break;
        default:
            console.error(`Unknown action: ${actionValue}`);
    }
    // Update the original message
    try {
        if (processed) {
            slack.chat.update({
                channel: payload.channel.id,
                ts: payload.message.ts,
                text: recorded ? 'Спасибо! статус изменен на "Записано".' : 'Хорошо, статус изменен на "Необходима".',
                // You can also include blocks here if you want to format the message
            });
        }
    } catch (error) {
        console.error(`Failed to update message: ${error}`);
    }

    // Respond with a 200 status to acknowledge the action
    res.sendStatus(200);
}

async function changeSessionStatus(pageId, status) {
    try {
        const page = await getPageByID(pageId);
        page.properties["Status"].status = {
            "name": status
        }
        const newPage = {
            page_id: page.id,
            properties: {
                "Status": page.properties["Status"],
            }
        }
        await updatePage(newPage);
    }
    catch (error) {
        console.error(error.body || error)
    }
}
