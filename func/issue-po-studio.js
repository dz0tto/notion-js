const { getPagesFilter, updatePage, getPageTitleByIDnName, getPageByID, deletePageByID } = require("../notion/database/database.datalayer")();

const databaseId = "26754db5110b4776b33613341851d368"

const workersDBid = "f7ccc2961ec64482aca9a8509d50b3c8"

// filter with empty property PO and status not "Необходимо", "Загружено", "Назначено"
const notReadyStatuses = ["Необходимо", "Назначено"];

const notReadyPost = ["Записано", "Загружено"];

const studioSessionTypes = ["Студия", "Режиссура", "Кнопка"];


const filterToIssuePoSessions = {
    property: "PO",
    rich_text: {
        is_empty: true,
    }
}

const filterToDelPoSessions = {
    property: "Сессия",
    relation: {
        is_empty: true,
    }
}

async function checkAndIssuePO () {
    try {
        const pages = await getPagesFilter(filterToIssuePoSessions, databaseId);
        const workers = await getPagesFilter(null, workersDBid);
        const filteredPages = pages?.filter(page => {
            const statusName = page.properties["Статус сессии"]?.rollup?.array[0]?.status?.name;
            return !notReadyStatuses.includes(statusName);
        });
        for (const page of filteredPages) {
            try {
                const jobType = page.properties["Тип работы"].select.name;
                const statusName = page.properties["Статус сессии"]?.rollup?.array[0]?.status?.name;
                if ((!studioSessionTypes.includes(jobType)) && notReadyPost.includes(statusName)) continue;

                const sessionID = page?.properties["Сессия"].relation[0]?.id;
                if (!sessionID) continue;
                const sessionPage = await getPageByID(sessionID);

                const hoursSession = sessionPage?.properties["Часы"].number;
                const factHours = page.properties["Часы факт"].number;
                const hours = factHours && factHours !== 0 ? factHours : hoursSession;

                if (!hours || hours === 0) continue;

                const batchID = sessionPage.properties["🚗 Батч"].relation[0]?.id;
                if (!batchID) continue;
                const batchPage = await getPageByID(batchID);

                const llid = batchPage?.properties["Код заказа с портала"].rich_text[0]?.plain_text;
                if (!llid) continue;
                const project = batchPage.properties["Проект"].relation[0]?.id;
                const projectPage = await getPageByID(project);
                const clientID = projectPage?.properties["Заказчик"].relation[0]?.id;
                if (!clientID) continue;
                const clientPage = await getPageByID(clientID);
                if (!clientPage?.properties["Name"]) continue;
                const client = clientPage.properties["Name"].title[0]?.plain_text;
                const clientCode = clientPage.properties["Код клиента"].rich_text[0]?.plain_text;

                const workerID = page.properties["Работник"]?.relation[0]?.id;
                const workerPage = workers.find(worker => worker.id === workerID);
                const worker = workerPage.properties["Name"].title[0]?.plain_text;

                const hourlyPrice = workerPage.properties["Часовая"].number;
                const directorPrice = workerPage.properties["Ставка за режиссуру"].number;
                const buttonPrice = workerPage.properties["Ставка за кнопку"].number;



                let price = 0;

                switch (jobType) {
                    case "Режиссура":
                        price = directorPrice;
                        break;
                    case "Кнопка":
                        price = buttonPrice;
                        break;
                    default:
                        price = hourlyPrice;
                }


                const subj = `[${llid}] ${page.properties["Name"].title[0].plain_text}`;
                const id = await postPO(client, subj, hours, price, worker, clientCode, llid);
                page.properties["PO"].rich_text = [
                    {
                        "type": "text",
                        "text": {
                            "content": id,
                            "link": null
                        }
                    }
                    ]
                const newPage = {
                    page_id: page.id,
                    properties: {
                        "PO": page.properties["PO"],
                    }
                }
                await updatePage(newPage);
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

async function checkAndDeletePO () {
    try {
        const pages = await getPagesFilter(filterToDelPoSessions, databaseId);
        const filteredPages = pages?.filter(page => {
            const sessionID = page?.properties["Сессия"].relation[0]?.id;
            return !sessionID;
        });
        if (!filteredPages) return;
        //check filteredPages if iterable
        if (typeof filteredPages[Symbol.iterator] !== 'function') {
            return;
        }
        for (const page of filteredPages) {
            try {
                const poID = page?.properties["PO"].rich_text[0]?.plain_text;
                
                const deleted = poID ? await deletePO(poID) : false;

                if (deleted.success || !poID) {
                    await deletePageByID(page.id);
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


const axios = require('axios');


async function postPO(client, description, wc, rate, actor, clientCode, taskID) {
    const url = 'https://api.levsha.eu/api/connectors/actorPO';
    //const url = 'http://d479-51-144-91-154.ngrok-free.app/api/connectors/actorPO';
    const opt = {
        "client": client,
        "clientCode": clientCode || "",
        "description": description,
        "wc": wc,
        "rate": rate,
        "secret": "OURconnectorSECRETINNER",
        'taskID': taskID || null,
    }
    if (actor) {
        opt.actor = actor;
    }
    try {
        const response = await axios.post(url, opt);
        if (response.data.error) {
            return "";
        } else {
            return response.data.id;
        }
    } catch (error) {
        console.error(error);
        return "";
    }
}

async function deletePO(poID) {
    const url = 'https://api.levsha.eu/api/connectors/actorPO';
    //const url = 'http://localhost:8810/api/connectors/deletePO';
    const opt = {
        "secret": "OURconnectorSECRETINNER",
        'id': poID || null,
    }
    try {
        const response = await axios.post(url, opt);
        if (response.data.error) {
            return "";
        } else {
            return response.data;
        }
    } catch (error) {
        console.error(error);
        return "";
    }
}

module.exports.executeIssueStudioPOs = function() {
    checkAndIssuePO()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeIssueStudioPOs, 90 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);

            // Call failed, set next timeout
            setTimeout(module.exports.executeIssueStudioPOs, 90 * 1000);
        });
}

module.exports.executeDeleteStudioPOs = function() {
    checkAndDeletePO()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeDeleteStudioPOs, 90 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);

            // Call failed, set next timeout
            setTimeout(module.exports.executeDeleteStudioPOs, 90 * 1000);
        });
}
    