  

const _ = require('lodash');

const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));

const axios = require('axios');


const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { Base64 } = require('js-base64');
// Read the base64-encoded JSON key from the environment variable
const serviceAccountKeyBase64 = Nconf.get('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');

// Decode the base64-encoded JSON key
const serviceAccountKeyJson = JSON.parse(Base64.decode(serviceAccountKeyBase64));

const notionTimezone = 'Europe/Moscow';

const actorsStored = [];

const databaseId = "898"

const spreadsheetId = '1PM3nPkxvSpmGvBrMV3hWO2JnX1s755gsYJfTOoxY9gE';

async function syncGSheet(actorsStored) {

    // Authenticate with Google Sheets
    const jwtClient = new JWT(
        serviceAccountKeyJson.client_email,
        null,
        serviceAccountKeyJson.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    // The ID of your Google Sheet
    
    
    // Read data from the sheet Актеры in all non-empty rows A:F
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
    // compare actorsStored and actorsGSheetObj, but in actorsStored we first need to convert notion page to object
    const actorsNotionObj = actorsStored.map(brLineToObj);

    // compare actorsGSheetObj and actorsNotionObj
    const actorsToUpdate = actorsGSheetObj.filter(gSheetActor => {
        const notionActor = actorsNotionObj.find(notionActor => gSheetActor['id'].toString() === notionActor.id.toString());
        //compare only keys from propWatchCal and all values toString
        return notionActor && propWatchCal.some(prop => {
            if (notionActor[prop] !== undefined && gSheetActor[prop] !== undefined) {
                const areDifferent = notionActor[prop].toString() !== gSheetActor[prop].toString();
                if (areDifferent) {
                    console.log(`Difference found in property ${prop}`);
                    console.log(`Notion actor: "${notionActor[prop]}"`);
                    console.log(`GSheet actor: "${gSheetActor[prop]}"`);
                }
                return areDifferent;
            }
            return false;
        });
    });
    // actors not in notion but in gsheet
    const actorsToAdd = actorsGSheetObj.filter(gSheetActor => {
        return !actorsNotionObj.find(notionActor => gSheetActor['id'].toString() === notionActor.id.toString());
    });
    // compare actorsNotionObj and actorsGSheetObj
    const actorsToGSheet = actorsNotionObj.filter(notionActor => {
        return !actorsGSheetObj.find(gSheetActor => gSheetActor['id'].toString() === notionActor.id.toString());
    });
    // if (actorsToDelete.length > 0) {
    //     // Delete actors from gsheet
    //     for (const actor of actorsToDelete) {
    //         deleteRowGSheet(sheets, actor.id);
    //     }
    // }
    if (actorsToGSheet.length > 0) {
        // Add actors to gsheet 
        await addRowsGSheet(sheets, actorsToGSheet);
    }
    if (actorsToAdd.length > 0) {
        // Add actors to notion
        for (const actor of actorsToAdd) {
            // create actor in notion
            const newPage = await createActorPage(actor);
            const newActor = brLineToObj(newPage);
            await updateNewRowGSheet(sheets, actor, newActor);
        }
    }
    if (actorsToUpdate.length > 0) {
        // Update actors in gsheet
        for (const actor of actorsToUpdate) {
            const newActor = actorsNotionObj.find(notionActor => actor.id.toString() === notionActor.id.toString());
            await updateRowGSheet(sheets, actor, newActor);
        }
    }

    //sort actors in gsheet by name if any changes were made
    if (actorsToGSheet.length > 0 || actorsToUpdate.length > 0 || actorsToAdd.length > 0) {
        await sortByNameActors(sheets);
    }

    
}

const sortByNameActors = async (sheets) => {
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const sheetId = spreadsheet.data.sheets.find(sheet => sheet.properties.title === 'Актеры').properties.sheetId;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [
                {
                    sortRange: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: 1, // Start from the second row
                        },
                        sortSpecs: [
                            {
                                dimensionIndex: 1,
                                sortOrder: 'ASCENDING'
                            }
                        ]
                    }
                }
            ]
        }
    });
}

const createActorPage = async (actor) => {
    const newRow = {
        Name: actor.Name,
        "Country of Residence": actor["Country of Residence"] || null,
        "Ставка за час": actor["Ставка за час"] || 0,
        "Currency": actor["Currency"] || null,
        "Phone number": actor["Phone number"] || null,
        "Банк СБП": actor["Банк СБП"] || null
    }
    const result = await addActorRowBR(newRow);
    return result;
}

const addActorRowBR = async (actorRow) => {
    //const url = 'https://api.levsha.eu/data/baserow/actor/new';
    const url = 'https://c61a-51-144-91-154.ngrok-free.app/data/baserow/actor/new';
    const opt = {
        "actor": actorRow,
        "secret": "secretFORACTORSLOL",
    }
    try {
        if (!actorRow || actorRow === "") {
            console.error("Error in posting actor: " + "error in actor");
            return "";
        }
        const response = await axios.post(url, opt);
        if (response.data.error) {
            return "";
        } else {
            return response.data;
        }
    } catch (error) {
        console.error("Error in posting studio PO: " + error);
        return "";
    }
}


//function to add row to GSheet in sheet Актеры in first empty row
async function addRowsGSheet(sheets, actors) {
    // Prepare the data to be inserted
    const data = actors.map(actor => 
        [actor.id, actor.Name, actor["Country of Residence"], actor["Ставка за час"].toString().replace(/\./g, ','), actor["Currency"], "'" + actor["Phone number"], actor["Банк СБП"], "https://br.levsha.eu/database/114/table/898/3933/row/" + actor.id]);

    // Get the first empty row
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Актеры!B:B',
    });
    const firstEmptyRow = (readResponse.data.values || []).length + 1;

    // Add the rows
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data: [{
                range: `Актеры!A${firstEmptyRow}:H${firstEmptyRow + data.length - 1}`,
                values: data,
            }],
        },
    });
}

//function to update row by id stored in column id in GSheet in sheet Актеры
async function updateRowGSheet(sheets, actor, newActor) {
    // Read data from the sheet
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Актеры!A:A', // Adjust this to the column that contains the IDs
    });

    // Find the row that contains the ID
    const rows = readResponse.data.values;
    const rowIndex = rows.findIndex(row => row[0] == actor.id.toString());

    if (rowIndex === -1) {
        console.error(`ID not found: ${actor.id}`);
        return;
    }

    // Update the row
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Актеры!A${rowIndex + 1}:H${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [[newActor.id, newActor.Name, newActor["Country of Residence"], newActor["Ставка за час"].toString().replace(/\./g, ','), newActor["Currency"], "'" + newActor["Phone number"], newActor["Банк СБП"], "https://br.levsha.eu/database/114/table/898/3933/row/" + newActor.id]],
        },
    });
}
    
//function to update row by name stored in column name in GSheet in sheet Актеры
async function updateNewRowGSheet(sheets, actor, newActor) {
    // Read data from the sheet
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Актеры!B:B', // Adjust this to the column that contains the names
    });

    // Find the row that contains the ID
    const rows = readResponse.data.values;
    const rowIndex = rows.findIndex(row => row[0] == actor.Name);

    if (rowIndex === -1) {
        console.error(`Name not found: ${actor.Name}`);
        return;
    }

    // Update the row
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Актеры!A${rowIndex + 1}:H${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [[newActor.id, newActor.Name, newActor["Country of Residence"], newActor["Ставка за час"].toString().replace(/\./g, ','), newActor["Currency"], "'" + newActor["Phone number"], newActor["Банк СБП"], "https://br.levsha.eu/database/114/table/898/3933/row/" + newActor.id]],
        },
    });
}



//function to delete row by id stored in column id in GSheet in sheet Актеры
async function deleteRowGSheet(sheets, id) {
    // Read data from the sheet
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Актеры!A:A', // Adjust this to the column that contains the IDs
    });

    // Find the row that contains the ID
    const rows = readResponse.data.values;
    const rowIndex = rows.findIndex(row => row[0] == id);

    if (rowIndex === -1) {
        console.error(`ID not found: ${id}`);
        return;
    }

    // Delete the row
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: 0,
                            dimension: 'ROWS',
                            startIndex: rowIndex,
                            endIndex: rowIndex + 1
                        }
                    }
                }
            ]
        }
    });
}



//convert notion page to object

function brLineToObj(page) {
    return {
        "id" : page.id,
        "Name" : page.Name || '',
        "Country of Residence" : page['Country of Residence']?.value || '',
        "Ставка за час" : page['Ставка за час']?.toString().replace(/\.0/g, '').replace('.', ',') || 0,
        "Currency" : page.Currency?.value || '',
        "Phone number" : page['Phone number']|| '',
        "Банк СБП" : page['Банк СБП'] || ''
    }
}

async function getActorFromBR() {
    const url = 'https://c61a-51-144-91-154.ngrok-free.app/data/baserow/actors';
    const opt = {
        "secret": "secretFORACTORSLOL",
    }
    const response = await axios.post(url, opt);
    return response.data;
}

async function syncGSheetActorsBR () {
    try {
        const pages = await getActorFromBR()
        // save all pages to sessionStored
        if (!pages) return;
        //filter actors with RUB and AMD in Currency
        const actors = pages.filter(page => 
            page.Currency && 
            (page.Currency.value === 'RUB' || page.Currency.value === 'AMD')
        );
        for (const page of actorsStored) {
            // check if there is page in actorsStored
            const newActor = actors.find((actor) => { 
                return actor.id.toString() === page.id.toString()
            })
            if (!newActor) {
                // if no - delete from actorsStored
                const index = actorsStored.findIndex((actor) => {
                    return actor.id.toString() === page.id.toString()
                })
                actorsStored.splice(index, 1);
            }
        }
        for (const page of actors) {
            // check if there is page in actorsStored
            const oldActor = actorsStored.find((actor) => { 
                return actor.id.toString() === page.id.toString()
            })
            if (!oldActor) {
                // if no - add to actorsStored
                actorsStored.push(page);
            } else if (updateDescription(oldActor, page, propWatchCal)) {
                const index = actorsStored.findIndex((actor) => {
                    return actor.id.toString() === page.id.toString()
                })
                actorsStored[index] = page;
            }
        }
        await syncGSheet(actorsStored);
    }
    catch (error) {
        console.error("Error in syncing GSheet actors: " + error.body || error)
    }
}

const propWatchCal = ["Name", "Country of Residence", "Ставка за час", "Currency", "Phone number", "Банк СБП"]

function updateDescription(oldPage, newPage, propArray) {

    // Initialize an array to store the changes
    const changes = [];

    // Iterate over the properties to watch
    for (const prop of propArray) {
        // Compare the property values in oldPage and newPage
        if (!_.isEqual(oldPage[prop], newPage[prop])) {
            // If the values are different, add the property to the changes array
            changes.push(prop);
        }
    }

    if (changes.length > 0) {
        return true
    } else {
        return false
    }
}

    
    //define formatSessionNotification

    
module.exports.executeSyncGSheetActorsBR = function() {
syncGSheetActorsBR()
    .then(() => {
        // Call succeeded, set next timeout
        setTimeout(module.exports.executeSyncGSheetActorsBR, 60 * 1000);
    })
    .catch((error) => {
        console.error('An error occurred:', error);

        // Call failed, set next timeout
        setTimeout(module.exports.executeSyncGSheetActorsBR, 60 * 1000);
    });
}
