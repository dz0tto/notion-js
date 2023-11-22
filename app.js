const { getPagesFilter, updatePage, getPageTitleByID, getEmailByPageID } = require("./notion/database/database.datalayer")();

const moment = require('moment-timezone');

require('moment/locale/ru');

const Path = require('path');
const Nconf = require('nconf');
Nconf
  .env()
  .file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const SlackNotifier = require('./slack/slack');
const slackToken = Nconf.get("SLACK_NOTIF_SESS_TOKEN"); // Replace with your Slack app's token
const slackNotifier = new SlackNotifier(slackToken);

const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2"

const notionTimezone = 'Europe/Moscow';

const sessionStored = [];


 const filterToRenameSessions = 
    {
      property: "Ренейм",
      rich_text: {
        equals : "#",
      }
    }

checkAndRenameSessions = async () => {
  try {
    const pages = await getPagesFilter(filterToRenameSessions, databaseId)
    pages.forEach(async (page) => {
      try {
        const batchID = page.properties["🚗 Батч"].relation[0]?.id;
        if (!batchID) return;
        const batch = await getPageTitleByID(batchID, "Название");
        const actorID = page.properties["Актёр"].relation[0]?.id;
        if (!actorID) return;
        const actor = await getPageTitleByID(actorID, "Name");
        const start = page.properties["Начало"].date.start;
        const hours = page.properties["Часы"].number;

        page.properties["Задача"].title = [
          {
              "type": "text",
              "text": {
                  "content": formatSessionHeadline(batch, actor, start, hours, notionTimezone),
                  "link": null
              }
          }
        ]
        page.properties["Ренейм"].rich_text = [
          {
              "type": "text",
              "text": {
                  "content": "Renamed",
                  "link": null
              }
          }
        ]
        const newPage = {
          page_id: page.id,
          properties: {
            "Задача": page.properties["Задача"],
            "Ренейм": page.properties["Ренейм"],
          }
        }
        updatePage(newPage);
      } catch (error) {
        console.error(error.body || error)
      }
    })
  } 
  catch (error) {
    console.error(error.body || error)
  }
}

checkChangedStatusSendNotif = async () => {
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
        }
      }
    } 
  }
  catch (error) {
    console.error(error.body || error)
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
  const batch = await getPageTitleByID(batchID, "Название");
  const batchLink = `https://www.notion.so/${batchID}`.replace(/-/g, "");
  const actorID = page.properties["Актёр"].relation[0].id;
  const actor = await getPageTitleByID(actorID, "Name");
  
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

  return slackMessage;
}

function formatSessionHeadline(batch, actor, start, hours, notionTimezone) {
  const formatDateTime = (momentObj, format) => {
      return momentObj.tz(notionTimezone).format(format);
  };

  const startDate = moment(start);
  const endDate = moment(start).add(hours, 'hours');

  const formattedStart = formatDateTime(startDate, 'DD MMMM, HH:mm');
  const formattedEnd = formatDateTime(endDate, 'HH:mm');

  return `[${batch}] - ${actor} - ${formattedStart}-${formattedEnd}`;
}

function executeCheckAndRenameSessions() {
  checkAndRenameSessions()
      .then(() => {
          // Call succeeded, set next timeout
          setTimeout(executeCheckAndRenameSessions, 90 * 1000);
      })
      .catch((error) => {
          console.error('An error occurred:', error);

          // Call failed, set next timeout
          setTimeout(executeCheckAndRenameSessions, 90 * 1000);
      });
}

executeCheckAndRenameSessions();

function executeCheckChangedStatusSendNotif() {
  checkChangedStatusSendNotif()
      .then(() => {
          // Call succeeded, set next timeout
          setTimeout(executeCheckChangedStatusSendNotif, 60 * 1000);
      })
      .catch((error) => {
          console.error('An error occurred:', error);

          // Call failed, set next timeout
          setTimeout(executeCheckChangedStatusSendNotif, 60 * 1000);
      });
}

executeCheckChangedStatusSendNotif();

