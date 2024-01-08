const { getPagesFilter, updatePage, createPage } = require("../notion/database/database.datalayer")();

const databaseId = "a12d2dbbb6ce4fb09a76043b176ee1d2"

const financeDBid = "26754db5110b4776b33613341851d368"

const workersDBid = "f7ccc2961ec64482aca9a8509d50b3c8"

const notReadyStatuses = ["Необходимо"];



const filterNoFinancesSessions = {
    property: "CreatedFinances",
    rich_text: {
        is_empty: true,
    }
}

const studioNames = {
    "MSK": "Наша студия в Москве",
    "EVN": "Студия Ереван"
}

async function checkAndCreateFinances () {
    try {
        const workers = await getPagesFilter(null, workersDBid);
        const pages = await getPagesFilter(filterNoFinancesSessions, databaseId);
        const readyPages = pages.filter(page => {
            const statusName = page.properties.Status.status.name;
            const renamed = page.properties["Ренейм"]?.rich_text[0]?.plain_text === "Renamed";
            return !notReadyStatuses.includes(statusName) && renamed;
        });
        for (const page of readyPages) {
            try {
                const subj = page.properties["Задача"].title[0].plain_text;
                const studio = page.properties["Студия"].multi_select.map(v => v.name).join(", ");
                const director = page.properties["Режиссёр"]?.people[0]?.person?.email || "";
                const postProd = page.properties["Постпрод"]?.people[0]?.person?.email || "";
                const engineer = page.properties["Инженер"]?.people[0]?.person?.email || "";

                if (studio !== "" && studio !== "Freelance") { 
                    const studioName = studioNames[studio];
                    const studioID = studioName ? workers.find(worker => worker.properties["Name"].title[0]?.plain_text === studioName)?.id : false;
                    if (studioID) {
                        await createNotionPage({ sessionID: page.id, title: `Студия - ${subj}`, jobType: "Студия", workerID: studioID });
                    }
                    if (director !== "") {
                        const directorID = workers.find(worker => !Object.values(studioNames).includes(worker.properties["Name"].title[0]?.plain_text) && worker.properties["Работник"]?.people[0]?.id === page.properties["Режиссёр"]?.people[0]?.id)?.id;
                        if (directorID) {
                            await createNotionPage({ sessionID: page.id, title: `Режиссер - ${subj}`, jobType: "Режиссура", workerID: directorID });
                        }
                    }
                    if (studio === "MSK" && engineer !== "") {
                        const engineerID = workers.find(worker => !Object.values(studioNames).includes(worker.properties["Name"].title[0]?.plain_text) && worker.properties["Работник"]?.people[0]?.id === page.properties["Инженер"]?.people[0]?.id)?.id;
                        if (engineerID) {
                            await createNotionPage({ sessionID: page.id, title: `Кнопка - ${subj}`, jobType: "Кнопка", workerID: engineerID });
                        }
                    }
                } else if (studio === "Freelance") {
                    if (director !== "") {
                        const directorID = workers.find(worker => !Object.values(studioNames).includes(worker.properties["Name"].title[0]?.plain_text) && worker.properties["Работник"]?.people[0]?.id === page.properties["Режиссёр"]?.people[0]?.id)?.id;
                        if (directorID) {
                            await createNotionPage({ sessionID: page.id, title: `Режиссер - ${subj}`, jobType: "Режиссура", workerID: directorID });
                        }
                    }
                }
                if (postProd !== "") {
                    const postprodID = workers.find(worker => !Object.values(studioNames).includes(worker.properties["Name"].title[0]?.plain_text) && worker.properties["Работник"]?.people[0]?.id === page.properties["Постпрод"]?.people[0]?.id && studioNames)?.id;
                    if (postprodID) {
                        await createNotionPage({ sessionID: page.id, title: `Постпрод - ${subj}`, jobType: "Постпрод", workerID: postprodID });
                    }
                }
 
                page.properties["CreatedFinances"].rich_text = [
                    {
                        "type": "text",
                        "text": {
                            "content": "Yes",
                            "link": null
                        }
                    }
                    ]
                const newPage = {
                    page_id: page.id,
                    properties: {
                        "CreatedFinances": page.properties["CreatedFinances"],
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

const createNotionPage = async ({ sessionID, title, jobType, workerID }) => {
    const newPage = {
        parent: {
            database_id: financeDBid
        },
        properties: {
            "Name": {
                "title": [
                    {
                        "text": {
                            "content": title
                        }
                    }
                ]
            },
            "Сессия": {
                "relation": [
                    {
                        "id": sessionID
                    }
                ]
            },
            "Тип работы": {
                "select": {
                    "name": jobType
                }
            },
            "Работник": {
                "relation": [
                    {
                        "id": workerID
                    }
                ]
            }
        }
    }
    return await createPage(newPage);
}





module.exports.executeCheckAndCreateFinances = function() {
    checkAndCreateFinances()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeCheckAndCreateFinances, 90 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);

            // Call failed, set next timeout
            setTimeout(module.exports.executeCheckAndCreateFinances, 90 * 1000);
        });
}
    