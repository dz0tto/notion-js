const { getPagesFilter, updatePage, getPageTitleByID } = require("./notion/database/database.datalayer")();

const moment = require('moment-timezone');

const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2"

const notionTimezone = 'Europe/Moscow';


 const filterToRenameSessions = 
    {
      property: "Ренейм",
      rich_text: {
        equals : "#",
      }
    }
,

checkAndRenameSessions = async () => {
  const pages = await getPagesFilter(filterToRenameSessions, databaseId)
  pages.forEach(async (page) => {
    const batchID = page.properties["🚗 Батч"].relation[0].id;
    const batch = await getPageTitleByID(batchID, "Название");
    const actorID = page.properties["Актёр"].relation[0].id;
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
  })
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

setInterval(checkAndRenameSessions, 60 * 1000);

