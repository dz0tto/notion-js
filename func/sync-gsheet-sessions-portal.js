const { notifyPortalSession } = require("./send-notif-sess");

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

const spreadsheetId = '1-D8efQECrlqbd6qzPGjpp7ZUODCsx61ck_9fRgCCWjE';

//const levshaApiUrl = 'http://localhost:8810';
const levshaApiUrl = 'https://api.levsha.eu';

const timezones = {
    'EVN': 'Asia/Yerevan',
    'MSK': 'Europe/Moscow',
    'TBS': 'Asia/Tbilisi',
    'Freelance': 'Europe/Moscow',
    'msk-studio@levsha.eu' : 'Europe/Moscow',   
    'evn-studio@levsha.eu' : 'Asia/Yerevan',
    'freelance-studio@levsha.eu' : 'Europe/Moscow'
}

const studioNames = {
    'msk-studio@levsha.eu' : 'MSK',
    'evn-studio@levsha.eu' : 'EVN',
    'freelance-studio@levsha.eu' : 'Freelance'
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

    const actorsBR = await getActors();

    actorsGSheetObj.forEach(actor => {
        actor.id = actorsBR.find(a => a.Name === actor.Name)?.id || '';
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
            const batchID = row['проект'].split('/').pop();
            const batch = await getBatchInfo(batchID);
            if (batch.batchStatus === 'Сметирование' || batch.batchStatus === '') {
                row['status'] = 'Сметирование'
            }
            row['batchID'] = batchID;
            row['batch'] = batch;
            row['actorID'] = actorsGSheetObj.find(actor => actor.Name === row['актер'])?.id || '';
            row['actorFull'] = actorsGSheetObj.find(actor => actor.Name === row['актер'])
        }
        return {sheetName: sheet.name, data: result};
    });
    
    const sessionsToAdd = await Promise.all(sessionsToAddPromises);
    
    const sessionsToUpdatePromises = sessionsGSheetNonEmpty.map(async (sheet) => {
        const result =  sheet.values.filter(row => row['notion'] === 'готово' && row['ссылка'] !== '');
        //add batchID, actorID, directorID, postprodID, lqaID for each row
        for (const row of result) {
            const batchID = row['проект'].split('/').pop();
            const batch = await getBatchInfo(batchID);
            row['batchID'] = batchID;
            row['batch'] = batch;
            row['actorID'] = actorsGSheetObj.find(actor => actor.Name === row['актер'])?.id || '';
            row['actorFull'] = actorsGSheetObj.find(actor => actor.Name === row['актер'])
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
                if (session.status === 'Сметирование') {
                    await updateRowGSheet(sheets, sheetName, session, { reason: 'Смените статус батча' });
                } else {
                    const newPage = await createSession(session);
                    notifyPortalSession(newPage, "Создано в GSheet", "Назначено");
                    await updateRowGSheet(sheets, sheetName, session, newPage);
                }
            }
        }
    }

    if (sessionsToUpdate.length > 0) {
        for (const sheetSession of sessionsToUpdate) {
            // create actor in notion
            const sheetName = sheetSession.sheetName;
            for (const session of sheetSession.data) {
                const updatedPage = await updateSession(session);
                notifyPortalSession(updatedPage, "Внесены изменения", "Назначено");
                await updateRowGSheet(sheets, sheetName, session, updatedPage);
            }
        }
    }

    
}

const getBatchInfo = async (batchID, retries = 3) => {
    //send post request
    try {
        const response = await fetch(`${levshaApiUrl}/data/sound/batch/get`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                taskID: batchID,
                secret: 'secretFORBATCHESLOL'
            })
        });
        const batchInfo = await response.json();
        return batchInfo;
    } catch (error) {
        if (retries > 0) {
            console.warn(`Retrying getBatchInfo for batchID: ${batchID}, attempts left: ${retries}`);
            return getBatchInfo(batchID, retries - 1); // Retry the request
        } else {
            console.error(`Failed to get batch info for batchID: ${batchID} after multiple attempts`, error);
            throw error; // Rethrow the error after retries
        }
    }
}

async function getActors () {
    const response = await fetch(`${levshaApiUrl}/data/baserow/actors`, {   
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            secret: 'secretFORACTORSLOL'
        })
    });
    const actors = await response.json();
    return actors;
}

const getSessionTitle = (session) => {
    // format as [batchname]-[batch.mic|batch hz and bit] - actor - date and length in format 26 ноября, 11:00-12:00
    const batchName = session['batch']?.batch?.find(v => v.id === 'batchName')?.value
    const batchMic = session['batch']?.sound?.find(v => v.id === 'microphone')?.value
    const batchHz = session['batch']?.sound?.find(v => v.id === 'recordingFrequency')?.value
    const batchBit = session['batch']?.sound?.find(v => v.id === 'bitrateRecording')?.value
    const channel = session['batch']?.sound?.find(v => v.id === 'channelsRecording')?.value
    const actor = session['актер']
    const studio = session['студия']
      // get from sessionDate and sessionHours a timeframe like 11:00-12:00
    const length = session['вр']
    const sessionMoment = moment.tz(session['дата'] + ' ' + session['начало сессии'], 'DD.MM.YYYY HH:mm', timezones[session['студия']])
    const dateString = sessionMoment.format('DD MMMM')
    const timeString = sessionMoment.format('HH:mm')
    const timeEnd = sessionMoment.add(length, 'hours').format('HH:mm');
    return `[${studio}] ${batchName} - [${batchMic || 'No mic'}|${batchBit || 'No bit'}, ${batchHz || 'No Hz'}|${channel || 'No channels'}] - ${actor || 'техническая'} - ${dateString} ${timeString}-${timeEnd} (MSK)`
}

const createSession = async (session) => {
    const batch = session['batch'];
    const batchInfo = batch.batch;
    const techInfo = batch.sound;
    const director = batchInfo ? batchInfo.find(v => v.id === 'mainDirector')?.value : ''
    const engineer = batchInfo ? batchInfo.find(v => v.id === 'mainEngineer')?.value : ''
    const editor = batchInfo ? batchInfo.find(v => v.id === 'mainEditor')?.value : ''
    const studio = techInfo ? techInfo.find(v => v.id === 'studio')?.value : ''
    const response = await fetch(`${levshaApiUrl}/data/sound/session/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          id: session['batchID'], 
          director: director,
          engineer: engineer,
          editor: editor,
          studio: studio
        })
    });
    const sessionRes = await response.json();
    let sessionInfo = sessionRes?.data?.recordset[0];
    const sessionMoment = moment.tz(session['дата'] + ' ' + session['начало сессии'], 'DD.MM.YYYY HH:mm', timezones[studioNames[session.studio]])
    //cast to camelCase
    sessionInfo = _.mapKeys(sessionInfo, (v, k) => _.camelCase(k));
    sessionInfo.title = getSessionTitle(session);
    sessionInfo.sessionDate = sessionMoment.format('YYYY-MM-DD HH:mm')
    sessionInfo.prevStatus = sessionInfo.sessionStatus
    sessionInfo.sessionStatus = 'Назначено'
    sessionInfo.actor = session['actorID']
    sessionInfo.actorName = session['актер']
    sessionInfo.studioHours = session['ч']
    sessionInfo.directorHours = session['ч']
    sessionInfo.engineerHours = session['ч']
    sessionInfo.actorHours = session['вр']
    const actorRate = session.actorFull['Ставка за час'] || 0
    sessionInfo.actorRate = actorRate
    sessionInfo.actorSpecialRate = actorRate === session['ставка'] ? 0 : session['ставка']
    // find studio name in studioNames as session['студия'] is value and we need key
    sessionInfo.studio = Object.keys(studioNames).find(key => studioNames[key] === session['студия'])
    await updateSessionPost(sessionInfo);
    sessionInfo.batch = session['batch']
    sessionInfo.studioName = session['студия']
    sessionInfo.batchID = session['batchID']
    return sessionInfo;
}   


const updateSession = async (session) => {
    const sessionMoment = moment.tz(session['дата'] + ' ' + session['начало сессии'], 'DD.MM.YYYY HH:mm', timezones[studioNames[session['студия']]])
    const payload = {...session }
    payload.sessionDate = sessionMoment.format('YYYY-MM-DD HH:mm')
    payload.title = getSessionTitle(session);
    payload.actor = session['actorID']
    payload.actorName = session['актер']
    payload.studioHours = session['ч']
    payload.actorHours = session['вр']
    sessionInfo.directorHours = session['ч']
    sessionInfo.engineerHours = session['ч']
    const actorRate = session.actorFull['Ставка за час'] || 0
    payload.actorRate = actorRate
    payload.actorSpecialRate = actorRate === session['ставка'] ? 0 : session['ставка']
    payload.studio = Object.keys(studioNames).find(key => studioNames[key] === session['студия'])
    payload.studioName = session['студия']
    payload.batchID = session['batchID']
    const updatedSession = await updateSessionPost(payload);
    return payload;
}

const updateSessionPost = async (payload) => {
    try {
        const response = await fetch(`${levshaApiUrl}/data/sound/session/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const sessionInfo = await response.json();
        return sessionInfo;
    } catch (error) {
        console.error('Error in updateSessionPost:', error);
        throw error;
    }
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
                values: [[newSession.reason ? 'ошибка' : 'внесено', newSession.reason ? newSession.reason : 'added']],
            },
        });
    } else {
        return
    }

    
}




async function syncGSheetPortalSessions () {
    try {
        await syncGSheet();
    }
    catch (error) {
        console.error("Error in syncing GSheet sessions: " + error.body || error)
    }
}


    
module.exports.executeSyncGSheetPortalSessions = function() {
    syncGSheetPortalSessions()
    .then(() => {
        // Call succeeded, set next timeout
        setTimeout(module.exports.executeSyncGSheetPortalSessions, 60 * 1000);
    })
    .catch((error) => {
        console.error('An error occurred:', error);

        // Call failed, set next timeout
        setTimeout(module.exports.executeSyncGSheetPortalSessions, 60 * 1000);
    });
}
