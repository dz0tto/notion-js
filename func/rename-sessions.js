const { getPagesFilter, updatePage, getPageTitleByID } = require("../notion/database/database.datalayer")();
const moment = require('moment-timezone');
require('moment/locale/ru');



    const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2"
    // const notionTimezone = 'Europe/Moscow';

    const filterToRenameSessions = 
    {
        property: "Ренейм",
        rich_text: {
            equals : "#",
        }
    }

    const timezones = {
        'EVN': 'Asia/Yerevan',
        'MSK': 'Europe/Moscow',
        'TBS': 'Asia/Tbilisi',
        'Freelance': 'Europe/Moscow'
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

    async function checkAndRenameSessions () {
    try {
        const pages = await getPagesFilter(filterToRenameSessions, databaseId)
        for (const page of pages) {
            try {
                const batchID = page.properties["🚗 Батч"].relation[0]?.id;
                // go to next page if batch is empty
                if (!batchID) continue;
                const batch = await getPageTitleByID(batchID, "Название");
                const actorID = page.properties["Актёр"].relation[0]?.id;
                const currName = page.properties["Задача"] && page.properties["Задача"].title ? page.properties["Задача"].title[0].plain_text: "";
                const actor = (!actorID) 
                    ? currName !== "" 
                        ? currName
                        : "Техническая"
                    : await getPageTitleByID(actorID, "Name");
                const start = page.properties["Начало"].date?.start;
                if (!start) continue;
                const hours = page.properties["Часы"].number;

                const studio = page.properties["Студия"].multi_select.map(v => v.name).join(", ");
                const timezone = timezones[studio] || 'Europe/Moscow';

                page.properties["Задача"].title = [
                {
                    "type": "text",
                    "text": {
                        "content": formatSessionHeadline(batch, actor, start, hours, timezone),
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
        }
    } 
    catch (error) {
        console.error(error.body || error)
    }
    }

    module.exports.executeCheckAndRenameSessions = function() {
        checkAndRenameSessions()
            .then(() => {
                // Call succeeded, set next timeout
                setTimeout(module.exports.executeCheckAndRenameSessions, 90 * 1000);
            })
            .catch((error) => {
                console.error('An error occurred:', error);

                // Call failed, set next timeout
                setTimeout(module.exports.executeCheckAndRenameSessions, 90 * 1000);
            });
    }

