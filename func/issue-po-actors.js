const { getPagesFilter, updatePage, getPageTitleByID, getPageByID } = require("../notion/database/database.datalayer")();

const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2"

// filter with empty property PO and status not "Необходимо", "Загружено", "Назначено"
const notReadyStatuses = ["Необходимо", "Назначено"];



const filterToIssuePoSessions = {
    property: "PO",
    rich_text: {
        is_empty: true,
    }
}
async function checkAndIssuePO () {
    try {
        const pages = await getPagesFilter(filterToIssuePoSessions, databaseId);
        const filteredPages = pages.filter(page => {
            const currency = page.properties["Валюта"].rollup?.array[0]?.select?.name;
            if (currency === "RUB" || currency === "AMD") {
                const statusName = page.properties["Статус оплаты"].status.name;
                return statusName === "Оплачено"; }
            else {
                const statusName = page.properties.Status.status.name;
                return !notReadyStatuses.includes(statusName);
            }
        });
        for (const page of filteredPages) {
            try {
                const batchID = page.properties["🚗 Батч"].relation[0]?.id;
                if (!batchID) return;
                const batchPage = await getPageByID(batchID);
                const llid = batchPage.properties["Код заказа с портала"].rich_text[0]?.plain_text;
                const project = batchPage.properties["Проект"].relation[0]?.id;
                const projectPage = await getPageByID(project);
                const clientID = projectPage.properties["Заказчик"].relation[0]?.id;
                if (!clientID) continue;
                const clientPage = await getPageByID(clientID);
                if (!clientPage) continue;
                const client = clientPage.properties["Name"].title[0]?.plain_text;
                const clientCode = clientPage.properties["Код клиента"].rich_text[0]?.plain_text;
                const hours = page.properties["Часы"].number;
                const defaultPrice = page.properties["За час"].rollup.number;
                const specialPrice = page.properties["Спец. ставка"].number;
                const price = specialPrice || specialPrice === 0 ? specialPrice : defaultPrice;
                if (!price || price === 0) continue;
                const currency = page.properties["Валюта"].rollup?.array[0].select?.name;
                let actor = "Актер"
                if (currency === "AMD") { actor = "Актер - EVN"; } 
                else if (currency !== "RUB") {
                    const actorID = page.properties["Актёр"]?.relation[0]?.id;
                    if (!actorID) continue;
                    const actorPage = await getPageByID(actorID);
                    if (!actorPage) continue;
                    actor = actorPage.properties["Name"].title[0]?.plain_text + " (VO)";
                }
                
                const subj = `[${llid}] ${page.properties["Задача"].title[0].plain_text}`;
                const id = await postPO(client, subj, hours, price, actor, clientCode, llid);
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


module.exports.executeIssueActorsPOs = function() {
    checkAndIssuePO()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeIssueActorsPOs, 90 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);

            // Call failed, set next timeout
            setTimeout(module.exports.executeIssueActorsPOs, 90 * 1000);
        });
}
    