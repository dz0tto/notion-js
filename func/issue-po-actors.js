const { getPagesFilter, updatePage, getPageTitleByID, getPageByID } = require("../notion/database/database.datalayer")();

const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2"

// filter with empty property PO and status not "Необходимо", "Загружено", "Назначено"
const notReadyStatuses = ["Необходимо", "Загружено", "Назначено"];



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
            const statusName = page.properties["Статус оплаты"].status.name;
            return statusName === "Оплачено";
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
                const clientPage = await getPageByID(clientID);
                const client = clientPage.properties["Название"].title[0]?.plain_text;
                const hours = page.properties["Часы"].number;
                const defaultPrice = page.properties["За час"].rollup.number;
                const specialPrice = page.properties["Спец. ставка"].number;
                const price = specialPrice ? specialPrice : defaultPrice;
                const currency = page.properties["Валюта"].rollup?.array[0].select?.name;
                const actor = currency === "AMD" ? "Актер - EVN" : "Актер";
                const subj = `[${llid}] ${page.properties["Задача"].title[0].plain_text}`;
                const id = await postPO(client, subj, hours, price, actor);
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


async function postPO(client, description, wc, rate, actor) {
    const url = 'https://api.levsha.eu/api/connectors/actorPO';
    const opt = {
        "client": client,
        "description": description,
        "wc": wc,
        "rate": rate,
        "secret": "OURconnectorSECRETINNER",
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

async function checkClient(client) {
    if (client) {
        const url = 'https://api.levsha.eu/api/connectors/checkClient';
        const opt = {
            "client": client,
            "secret": "OURconnectorSECRETINNER",
        }
        try {
            const response = await axios.post(url, opt);
            if (response.data.length > 0) {
                return response.data[0].text;
            } else {
                return "";
            }
        } catch (error) {
            console.error(error);
            return "";
        }
    } else {
        return "";
    }
}


module.exports.executeIssuePOs = function() {
    checkAndIssuePO()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeIssuePOs, 90 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);

            // Call failed, set next timeout
            setTimeout(module.exports.executeIssuePOs, 90 * 1000);
        });
}
    