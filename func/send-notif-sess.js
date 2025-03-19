  

const { getPagesFilter, getPageTitleByIDnName, getEmailByPageID } = require("../notion/database/database.datalayer")();
const { updateGCalEvent } = require("../func/gcal-sync");

const moment = require('moment-timezone');
require('moment/locale/ru');

const _ = require('lodash');

const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


// const SlackNotifier = require('../messengers/slack');
// const slackToken = Nconf.get("SLACK_NOTIF_SESS_TOKEN"); // Replace with your Slack app's token
// const slackNotifier = new SlackNotifier(slackToken);

const { MattermostNotifier } = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmUsername = Nconf.get("MATTERMOST_USERNAME");
const mmPassword = Nconf.get("MATTERMOST_PASSWORD");
const mattermostNotifier = new MattermostNotifier(mmUrl, mmUsername, mmPassword);

const notionTimezone = 'Europe/Moscow';

const sessionStored = [];

const databaseId = "527a3d104ebc4c72a524a94341f32339"

async function checkChangesSendNotif () {
    try {
        const pages = await getPagesFilter(null, databaseId)
        // save all pages to sessionStored
        if (!pages) return;
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
                    await notify(page, oldStatus, newStatus);
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
        console.error("Error in sending session notification: " + error.body || error)
    }
}

async function notify(page, oldStatus, newStatus) {
    const batchID = page?.properties["🚗 Батч"]?.relation[0]?.id || "";
    const director = page?.properties["Режиссёр"]?.people[0]?.person?.email || "";
    const postProd = page?.properties["Постпрод"]?.people[0]?.person?.email || "";
    const engineer = page?.properties["Инженер"]?.people[0]?.person?.email || "";
    const soundqa = page?.properties["Отслушка"]?.people[0]?.person?.email || "";
    const pms = await getEmailByPageID(batchID, "Менеджер батча");
    const people = { 
        "Режиссёр" : director, 
        "Постпрод" : postProd, 
        "Инженер" : engineer,
        "Отслушка" : soundqa,
        "Менеджер батча" : [...pms],
        "Админ" : "dzotto@levsha.eu"
    };
    const admin = "dzotto@levsha.eu";
    const emails = [director, postProd, engineer, soundqa, admin, ...pms].filter(email => email !== "")
    // send notification
    for (const email of emails) {
        const message = await formatSessionNotification(page, oldStatus, newStatus, notionTimezone, email, people);
        // if (message.slackMessage && email !== "" && email !== undefined) {
        //     slackNotifier.sendMessageToUser(email, message.slackMessage);
        // }
        if (message.mattermostMessage && email !== "" && email !== undefined) {
            mattermostNotifier.sendMessageToUser(email, message.mattermostMessage);
        }
    }
}

module.exports.sendNotificationSession = function(page, oldStatus, newStatus) {
    notify(page, oldStatus, newStatus)
};

module.exports.notifyPortalSession = async function(session, oldStatus, newStatus, link) {
    const director = session.director;
    const postProd = session.editor;
    const engineer = session.engineer;
    const pm = session.batch?.pm || session.pm || session?.quote?.levshaPm || "";
    const people = { 
        "Режиссёр" : director, 
        "Постпрод" : postProd, 
        "Инженер" : engineer,
        "Менеджер батча" : pm,
        "Админ" : "dzotto@levsha.eu",
        "Оплата" : 'fedorq@levsha.eu'
    };
    let payment = '';
    if (session.type === 'Актерская' && oldStatus !== newStatus && (oldStatus === 'Назначено' || oldStatus === 'Необходимо') && session.actorCurrency === 'RUB') {
        payment = 'fedorq@levsha.eu';
    }
    const admin = "dzotto@levsha.eu";
    const emails = [director, postProd, engineer, admin, pm, payment].filter(email => email !== "" && email !== null)
    // send notification
    for (const email of emails) {
        const message = await formatPortalSessionNotification(session, oldStatus, newStatus, notionTimezone, email, people, link);
        if (message.mattermostMessage && email !== "" && email !== undefined) {
            mattermostNotifier.sendMessageToUser(email, message.mattermostMessage);
        }
    }
}

async function formatPortalSessionNotification(session, oldStatus, newStatus, notionTimezone, email, people, link) {
    // Function to format date and time
    const formatDateTime = (momentObj, format) => {
        momentObj.locale('ru');
        return momentObj.format(format);
    };
    
    // Extracting and formatting date and time
    const startDate = moment(session.sessionDate);
    const durationHours = session.type === 'Техническая' ? session.editorHours : session.studioHours;
    const endDate = startDate.clone().add(durationHours, 'hours');
    
    const formattedStart = formatDateTime(startDate, 'DD MMMM, HH:mm');
    const formattedEnd = formatDateTime(endDate, 'HH:mm');
  
    // Constructing message content
    const batchID = session.batch?.taskId || session.quote?.id || session.batchID || session.batchId;
    //const link = `https://scaevola.levsha.eu/sound/batches/${batchID}`;
    link = `${link}${batchID}`
    const batch = session.batch?.batchName || session['batch']?.batch?.find(v => v.id === 'batchName')?.value || '';
    const actor = session.actorName
    const studio = session.studioName
    //find email in people
    const role = Object.keys(people).find(key => people[key] === email || (Array.isArray(people[key]) && people[key].includes(email)));

    // Format the Mattermost message
    let mattermostMessage = '';
    if (oldStatus === newStatus) { mattermostMessage += `Внесены изменения в сессию.\n\n` }
    else { mattermostMessage += `Изменение статуса (${oldStatus} -> ${newStatus}) сессии.\n\n` }

    mattermostMessage += `**Батч**: ${batch}\n`
    if (actor) { mattermostMessage +=    `**Актёр**: ${actor}\n` }
    if (studio) { mattermostMessage +=    `**Студия**: ${studio}\n` }
    if (session.type === 'Техническая') { mattermostMessage +=    `**Тип сессии**: ${session.type}\n` }
    mattermostMessage +=     `**Время**: ${formattedStart} - ${formattedEnd} MSK\n\n`
    if (oldStatus !== newStatus) {
        mattermostMessage += `**Сменился статус:** ${oldStatus} -> ${newStatus}\n` 
    } else {
        mattermostMessage += `**Cтатус:** ${newStatus}\n` 
    }      
    mattermostMessage += `**Ваша роль:** ${role}\n`;

    mattermostMessage += `[Посмотреть на портале](${link})`;
    
    return { mattermostMessage };
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
    const actorID = page.properties["Актёр"].relation[0]?.id;
    let actor = '';
    if (!actorID || actorID === '') {
        actor = '';
    } else {
        console.log(`Getting actor with ID: ${actorID}`);
        actor = await getPageTitleByIDnName(actorID, "Name");
    }
    
    // check if email is in people and get the role
    const role = Object.keys(people).find(key => people[key] === email || (Array.isArray(people[key]) && people[key].includes(email)));
    
    // if (role !== 'Отслушка') return false
    
    // Format the Slack message block
    const slackMessage = {
        "text" : `Изменение статуса (${oldStatus} -> ${newStatus}) сессии.`,
        "blocks": [
        {
            "type": "header",
            "text": {
            "type": "plain_text",
            "text": "Изменение статуса сессии",
            "emoji": true
            }
        },
        {
            "type": "section",
            "text": {
            "type": "mrkdwn",
            "text": `*Батч*: <${batchLink}|${batch}>\n*Актёр*: ${actor}\n*Время*: ${formattedStart} - ${formattedEnd} MSK`
            }
        },
        {
            "type": "section",
            "fields": [
            {
                "type": "mrkdwn",
                "text": `*Сменился статус:*\n${oldStatus} -> ${newStatus}`
            },
            {
                "type": "mrkdwn",
                "text": `*Ваша роль:*\n${role}`
            }
            ]
        }
        ]};
    if (role !== 'Менеджер батча' && roleDeadlines[role]) {
        slackMessage.blocks.push({
        "type": "section",
        "fields": [
            {
            "type": "mrkdwn",
            "text": `*Ваш дедлайн:*\n${roleDeadlines[role]} MSK`
            }
        ]
        })
    };
    slackMessage.blocks.push({
        "type": "section",
        "text": {
        "type": "mrkdwn",
        "text": `<${link}|Посмотреть в Notion>`
        }
    });

    // Format the Mattermost message
    let mattermostMessage = `Изменение статуса (${oldStatus} -> ${newStatus}) сессии.\n\n` +
        `**Батч**: [${batch}](${batchLink})\n` +
        `**Актёр**: ${actor}\n` +
        `**Время**: ${formattedStart} - ${formattedEnd} MSK\n\n` +
        `**Сменился статус:**\n${oldStatus} -> ${newStatus}\n` +
        `**Ваша роль:**\n${role}\n`;

    if (role !== 'Менеджер батча' && roleDeadlines[role]) {
        mattermostMessage += `**Ваш дедлайн:**\n${roleDeadlines[role]} MSK\n`;
    }

    mattermostMessage += `[Посмотреть в Notion](${link})`;
    
    return { slackMessage, mattermostMessage };
}
    
    module.exports.executeCheckChangesSendNotif = function() {
    checkChangesSendNotif()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeCheckChangesSendNotif, 60 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);
    
            // Call failed, set next timeout
            setTimeout(module.exports.executeCheckChangesSendNotif, 60 * 1000);
        });
    }
