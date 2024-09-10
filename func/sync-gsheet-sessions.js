  

const { getPageByID, createPage, updatePage } = require("../notion/database/database.datalayer")();

const { sendNotificationSession } = require("./send-notif-sess");

const moment = require('moment-timezone');
require('moment/locale/ru');

const _ = require('lodash');

const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { Base64 } = require('js-base64');
// Read the base64-encoded JSON key from the environment variable
const serviceAccountKeyBase64 = Nconf.get('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');

// Decode the base64-encoded JSON key
const serviceAccountKeyJson = JSON.parse(Base64.decode(serviceAccountKeyBase64));

const databaseId = "527a3d104ebc4c72a524a94341f32339"

const spreadsheetId = '1pNmhuEcx5nykMOEqMnyiMOcRBJqrUniDUlbOuo9TZCo';

const AZak = 'bb9cd8c2-1d7b-4425-ae75-00d22ddb2a34';

const timezones = {
    'EVN': 'Asia/Yerevan',
    'MSK': 'Europe/Moscow',
    'TBS': 'Asia/Tbilisi',
    'Freelance': 'Europe/Moscow'
}

async function syncGSheet() {

    // Authenticate with Google Sheets
    const jwtClient = new JWT(
        serviceAccountKeyJson.client_email,
        null,
        serviceAccountKeyJson.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "'Актеры'!A1:G1000", // Adjust this to the range you want to read from
    });
    const keys = readResponse.data.values ? readResponse.data.values[0] : [];
    if (keys.length === 0) {
        console.error('No data found.');
        return;
    }
    readResponse.data.values.shift();
    //filter to non-empty rows
    const actorsGSheet = readResponse.data.values ? readResponse.data.values.filter(row => row[1] !== '') : [];
    //create array of objects, each object is a row, and keys are from keys array
    const actorsGSheetObj = actorsGSheet.map(row => {
        return keys.reduce((acc, key, index) => {
            if (row[index] !== undefined) {
                acc[key] = row[index];
            } else {
                acc[key] = '';
            }
            return acc;
        }, {});
    });

    // The ID of your Google Sheet
    
    // Read data from the sheet Актеры in all non-empty rows A:F
    // get all available sheets except Актеры and Вызовы по месяцам
    const sheetsList = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const sheetsNames = sheetsList.data.sheets.map(sheet => sheet.properties.title);
    const sheetsToRead = sheetsNames.filter(sheet => sheet !== 'Актеры' && sheet !== 'Вызовы по месяцам');
    //get all data from sheets except Актеры and Вызовы по месяцам
    const sessionsGSheet = await Promise.all(sheetsToRead.map(async sheet => {
        const readResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheet}!A1:M1000`, // Adjust this to the range you want to read from
        });
        return {name: sheet, values: readResponse.data.values ? readResponse.data.values.filter(row => row[11] && row[11] !== '') : []};
    }));
    
    //filter to non-empty rows
    //create array of objects, each object is a row, and keys are from keys array
    for (const sheet of sessionsGSheet) {
        if (sheet.values.length > 0) {
            const keys = sheet.values[0];
            sheet.values.shift();
            sheet.values = sheet.values.map(row => {
                return keys.reduce((acc, key, index) => {
                    if (row[index] !== undefined) {
                        acc[key] = row[index];
                    } else {
                        acc[key] = '';
                    }
                    return acc;
                }, {});
            });
        }
    }
    //filter sheets with no data
    const sessionsGSheetNonEmpty = sessionsGSheet.filter(sheet => sheet.values.length > 0);

    const sessionsToAddPromises = sessionsGSheetNonEmpty.map(async (sheet) => {
        const result = sheet.values.filter(row => row['notion'] === 'готово' && row['ссылка'] === '');
        //add batchID, actorID, directorID, postprodID, lqaID for each row
        for (const row of result) {
            const batchID = row['проект'].split('?')[0].split('-').pop().split('/').pop();
            const batch = await getPageByID(batchID);
            row['batchID'] = batchID;
            row['actorID'] = actorsGSheetObj.find(actor => actor.Name === row['актер'])?.id || '';
            row['directorID'] = batch.properties['Режиссёр']?.people[0]?.id || '';
            row['postprodID'] = batch.properties['Постпрод (ответственный)']?.people[0]?.id || '';
            row['lqaID'] = batch.properties['Отслушка']?.people[0]?.id || '';
        }
        return {sheetName: sheet.name, data: result};
    });
    
    const sessionsToAdd = await Promise.all(sessionsToAddPromises);
    
    const sessionsToUpdatePromises = sessionsGSheetNonEmpty.map(async (sheet) => {
        const result =  sheet.values.filter(row => row['notion'] === 'готово' && row['ссылка'] !== '');
        //add batchID, actorID, directorID, postprodID, lqaID for each row
        for (const row of result) {
            const batchID = row['проект'].split('?')[0].split('-').pop().split('/').pop();
            const batch = await getPageByID(batchID);
            row['batchID'] = batchID;
            row['actorID'] = actorsGSheetObj.find(actor => actor.Name === row['актер'])?.id || '';
            row['directorID'] = batch.properties['Режиссёр']?.people[0]?.id || '';
            row['postprodID'] = batch.properties['Постпрод (ответственный)']?.people[0]?.id || '';
            row['lqaID'] = batch.properties['Отслушка']?.people[0]?.id || '';
        }
        return {sheetName: sheet.name, data: result};
    });

    const sessionsToUpdate = await Promise.all(sessionsToUpdatePromises);
    
    if (sessionsToAdd.length > 0) {
        // Add actors to gsheet 
        for (const sheetSession of sessionsToAdd) {
            // create actor in notion
            const sheetName = sheetSession.sheetName;
            for (const session of sheetSession.data) {
                const newPage = await createSessionPage(databaseId, session);
                sendNotificationSession(newPage, "Создано в GSheet", "Назначено");
                await updateRowGSheet(sheets, sheetName, session, newPage);
            }
        }
    }

    if (sessionsToUpdate.length > 0) {
        for (const sheetSession of sessionsToUpdate) {
            // create actor in notion
            const sheetName = sheetSession.sheetName;
            for (const session of sheetSession.data) {
                const updatedPage = await updateSessionPage(databaseId, session);
                sendNotificationSession(updatedPage, "Внесены изменения", "Назначено");
                await updateRowGSheet(sheets, sheetName, session, updatedPage);
            }
        }
    }

    
}

const combineNewSession = (dbId, session) => {
    const start = moment.tz(session['дата'] + ' ' + session['начало сессии'], 'DD.MM.YYYY HH:mm', timezones[session['студия']]).format('YYYY-MM-DDTHH:mm:ssZ');
    const newPage = {
        parent: {
            database_id: dbId
        },
        properties: {
            "Актёр" : {
                "relation": [
                    {
                        "id": session['actorID']
                    }
                ]
            },
            "Status" : {
                "status": { 
                    "name": "Назначено"
                }
            },
            "Студия" : {
                "multi_select": [
                    {
                        "name": session['студия']
                    }
                ]
            },
            "🚗 Батч" : {
                "relation": [
                    {
                        "id": session['batchID']
                    }
                ]
            },
            "Режиссёр" : {
                "people": session['directorID'] !== '' ? [{ id: session['directorID'] }] : []
            },
            "Часы" : {
                "number": Number(session['вр'].replace(',', '.')) || 0
            },
            "Часы актера" : {
                "number": Number(session['ч'].replace(',', '.')) || 0
            },
            "Начало" : {
                "date": {
                    "start": start
                }
            },
            "Инженер" : {
                "people": session['студия'] === 'MSK' ? [{ id: AZak }] : []
            },
            "Постпрод" : {
                "people": session['postprodID'] !== '' ? [{ id: session['postprodID'] }] : []
            },
            "Отслушка" : {
                "people": session['lqaID'] !== '' ? [{ id: session['lqaID'] }]: []
            },
            "Ренейм" : {
                "rich_text": [
                    {
                        "text": {
                            "content": '#'
                        }
                    }
                ]
            }
        }
    }
    return newPage;
}


const createSessionPage = async (dbId, session) => {
    const newPage = combineNewSession(dbId, session);
    newPage.properties['Задача'] = {
            "title": [
                {
                    "text": {
                        "content": "Сессия"
                    }
                }
            ]
    }
    return await createPage(newPage);
}

const updateSessionPage = async (dbId, session) => {
    const newPage = combineNewSession(dbId, session);
    newPage.page_id = session['ссылка'].split('?')[0].split('-').pop().split('/').pop();
    return await updatePage(newPage);
}

//function to update row by id stored in column id in GSheet in sheet Актеры
async function updateRowGSheet(sheets, sheetName, session, newSession) {
    // Read data from the sheet
    const sessionsGSheet = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:M`, // Adjust this to the column that contains the names
    });

    if (sessionsGSheet.data.values.length > 0) {
        const keys = sessionsGSheet.data.values[0];
        sessionsGSheet.data.values.shift();
        sessionsGSheet.data.values = sessionsGSheet.data.values.map(row => {
            return keys.reduce((acc, key, index) => {
                if (row[index] !== undefined) {
                    acc[key] = row[index];
                } else {
                    acc[key] = '';
                }
                return acc;
            }, {});
        });

        // Find the row that contains the ID
        const rows = sessionsGSheet.data.values;
        const rowIndex = rows.findIndex(row => row['актер'] == session['актер'] && row['дата'] == session['дата'] && row['начало сессии'] == session['начало сессии'] && row['студия'] == session['студия'] && row['вр'] == session['вр'] && row['ч'] == session['ч'] && row['notion'] === 'готово' && row['ссылка'] === session['ссылка']);

        if (rowIndex === -1) {
            console.error(`ID not found: ${session['актер'] + ' ' + session['дата'] + ' ' + session['начало сессии'] + ' ' + session['студия'] + ' ' + session['вр'] + ' ' + session['ч']}`);
            return;
        }

        // Update the row
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!L${rowIndex + 2}:M${rowIndex + 2}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [['внесено', newSession.url ? newSession.url : '']],
            },
        });
    } else {
        return
    }

    
}




async function syncGSheetSessions () {
    try {
        await syncGSheet();
    }
    catch (error) {
        console.error("Error in syncing GSheet sessions: " + error.body || error)
    }
}


    
module.exports.executeSyncGSheetSessions = function() {
syncGSheetSessions()
    .then(() => {
        // Call succeeded, set next timeout
        setTimeout(module.exports.executeSyncGSheetSessions, 60 * 1000);
    })
    .catch((error) => {
        console.error('An error occurred:', error);

        // Call failed, set next timeout
        setTimeout(module.exports.executeSyncGSheetSessions, 60 * 1000);
    });
}
