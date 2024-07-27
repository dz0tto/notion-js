  

const { getPagesFilter, getPageTitleID, getUser, getPageByID, getAllLevelChildren } = require("../notion/database/database.datalayer")();


const _ = require('lodash');

const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const MattermostNotifier = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmUsername = Nconf.get("MATTERMOST_USERNAME");
const mmPassword = Nconf.get("MATTERMOST_PASSWORD");
const mattermostNotifier = new MattermostNotifier(mmUrl, mmUsername, mmPassword);



const pagesStored = [];

const wahtchedList = [
    { dbID: "889eacd877d0479489071bfb2daef99a", channel: "crm-notifications" }
]

async function checkChangesPageSendNotif () {
    for (const db of wahtchedList) {
        try {
            const pages = await getPagesFilter(null, db.dbID)
            // save all pages to pagesStored
            if (!pages) return;
            for (const newpage of pages) {
                // check if there is page in pagesStored
                const oldPageFull = pagesStored.find((page) => { 
                    return page.id === newpage.id
                })
                if (!oldPageFull) {
                    // if no - add to pagesStored
                    newpage.children = await getAllLevelChildren(newpage.id);
                    pagesStored.push(newpage);
                } else if (oldPageFull.last_edited_time === newpage.last_edited_time) {
                    continue;
                }
                else {
                    // if yes - check if any property changed
                    const oldPageProp = oldPageFull.properties;
                    const newPageProp = newpage.properties;
                    const keys = Object.keys(oldPageProp);
                    let changed = false;
                    let changedProps = [];
                    for (const key of keys) {
                        if (!_.isEqual(oldPageProp[key], newPageProp[key])) {
                            changed = true;
                            changedProps.push(key);
                        }
                    }
                    const oldPageBody = oldPageFull.children;
                    const newPageBody = await getAllLevelChildren(newpage.id);
                    let changedBody = false;
                    let changedBodyBlocks = [];
                    if (newPageBody) {
                        //iterate over blocks in body array
                        for (let i = 0; i < newPageBody.length; i++) {
                            let newBlock = newPageBody[i];
                            //check if block exists in oldPageBody
                            let oldBlock = oldPageBody ? oldPageBody.find((block) => {
                                return block.id === newBlock.id
                            }) : null;
                            if (oldBlock && !_.isEqual(newBlock, oldBlock)) {
                                changedBody = true;
                                changedBodyBlocks.push(newBlock);
                            } else if (!oldBlock) {
                                changedBody = true;
                                changedBodyBlocks.push(newBlock);
                            }
                        }
                        newpage.children = newPageBody;
                    }
                    if (changed || changedBody) {
                        await notify(db.channel, newpage, oldPageFull, changedProps, changedBodyBlocks);
                        // update pagesStored
                        const index = pagesStored.findIndex((page) => {
                            return page.id === newpage.id
                        })
                        pagesStored[index] = newpage;
                    }
                }
            } 
        }
        catch (error) {
            console.error(error.body || error)
        }
    }
    
}

async function formatChangedNotionProps(newpage, oldPageFull, changedProps, mattermostMessage) {
    for (const prop of changedProps) {
        //for firrerent types of properties we need to use different formatting
        if (oldPageFull.properties[prop].type === 'checkbox') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].checkbox ? '✅' : '❌'} → ${newpage.properties[prop].checkbox ? '✅' : '❌'}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'date') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].date.start ? oldPageFull.properties[prop].date.start : 'no date'} → ${newpage.properties[prop].date.start ? newpage.properties[prop].date.start : 'no date'}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'email') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].email ? oldPageFull.properties[prop].email : 'no email'} → ${newpage.properties[prop].email ? newpage.properties[prop].email : 'no email'}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'formula') {
            let oldType = oldPageFull.properties[prop].formula ? oldPageFull.properties[prop].formula.type : '';
            let newType = newpage.properties[prop].formula ? newpage.properties[prop].formula.type : '';
            let oldValue = oldType !== '' ? oldPageFull.properties[prop].formula[oldType] : '';
            let newValue = newType !== '' ? newpage.properties[prop].formula[newType] : '';
            mattermostMessage += `**${prop}**: \`${oldValue} → ${newValue}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'multi_select') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].multi_select.map((item) => item.name).join(', ') || ''} → ${newpage.properties[prop].multi_select.map((item) => item.name).join(', ') || ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'number') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].number ? oldPageFull.properties[prop].number : ''} → ${newpage.properties[prop].number ? newpage.properties[prop].number : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'phone_number') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].phone_number ? oldPageFull.properties[prop].phone_number : ''} → ${newpage.properties[prop].phone_number ? newpage.properties[prop].phone_number : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'relation') {
            //get names of related pages by 
            let oldRelated = oldPageFull.properties[prop].relation ? await Promise.all(oldPageFull.properties[prop].relation.map(async (item) => await getPageTitleID(item.id))) : '';
            let newRelated = newpage.properties[prop].relation ? await Promise.all(newpage.properties[prop].relation.map(async (item) => await getPageTitleID(item.id))) : '';
            oldRelated = oldRelated.join('\n');
            newRelated = newRelated.join('\n');
            mattermostMessage += `**${prop}**: \`${oldRelated} → ${newRelated}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'rollup') {
            let oldType = oldPageFull.properties[prop].rollup ? oldPageFull.properties[prop].rollup.type : '';
            let newType = newpage.properties[prop].rollup ? newpage.properties[prop].rollup.type : '';
            let oldValue = oldType !== '' ? oldPageFull.properties[prop].rollup[oldType] : '';
            let newValue = newType !== '' ? newpage.properties[prop].rollup[newType] : '';
            mattermostMessage += `**${prop}**: \`${oldValue} → ${newValue}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'rich_text') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].rich_text ? oldPageFull.properties[prop].rich_text.map((item) => item.plain_text).join('') : ''} → ${newpage.properties[prop].rich_text ? newpage.properties[prop].rich_text.map((item) => item.plain_text).join('') : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'select') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].select ? oldPageFull.properties[prop].select.name : ''} → ${newpage.properties[prop].select ? newpage.properties[prop].select.name : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'status') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].status ? oldPageFull.properties[prop].status : ''} → ${newpage.properties[prop].status ? newpage.properties[prop].status : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'title') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].title ? oldPageFull.properties[prop].title[0].plain_text : ''} → ${newpage.properties[prop].title ? newpage.properties[prop].title[0].plain_text : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'url') {
            mattermostMessage += `**${prop}**: \`${oldPageFull.properties[prop].url ? oldPageFull.properties[prop].url : ''} → ${newpage.properties[prop].url ? newpage.properties[prop].url : ''}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'unique_id') {
            let oldID = oldPageFull.properties[prop].unique_id ? oldPageFull.properties[prop].unique_id.prefix + '-' + oldPageFull.properties[prop].number : '';
            let newID = newpage.properties[prop].unique_id ? newpage.properties[prop].unique_id.prefix + '-' + newpage.properties[prop].unique_id.number : '';
            mattermostMessage += `**${prop}**: \`${oldID} → ${newID}\`\n`;
            continue;
        } else if (oldPageFull.properties[prop].type === 'people') {
            let oldPeople = oldPageFull.properties[prop].people ? oldPageFull.properties[prop].people.map((item) => item.name).join(', ') : '';
            let newPeople = newpage.properties[prop].people ? newpage.properties[prop].people.map((item) => item.name).join(', ') : '';
            mattermostMessage += `**${prop}**: \`${oldPeople} → ${newPeople}\`\n`;
            continue;
        }
    }
    return mattermostMessage;   
}

function formatChangedNotionBlocks(changedBodyBlocks, mattermostMessage) {
    for (const block of changedBodyBlocks) {
        //get text from block and it's children
        let text = '';
        if (block.type === 'paragraph') {
            text = block.paragraph.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'heading_1') {
            text = block.heading_1.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'heading_2') {
            text = block.heading_2.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'heading_3') {
            text = block.heading_3.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'bulleted_list_item') {
            text = block.bulleted_list_item.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'numbered_list_item') {
            text = block.numbered_list_item.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'to_do') {
            text = block.to_do.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'toggle') {
            text = block.toggle.rich_text.map((item) => item.plain_text).join('');
        } else if (block.type === 'child_page') {
            text = block.child_page.title[0].plain_text;
        } else if (block.type === 'unsupported') {
            text = 'Unsupported block type';
        }
        text = (text !== '') ? `\`${text.replace(/([_*~`])/g, '\\$1')}\`` : '';
        if (block.children) {
            text += '\n';
            text = formatChangedNotionBlocks(block.children, text);
        }
        //add text to the message sanitized as for markdown
        mattermostMessage += `${text}\n`;
    }
    return mattermostMessage;
}

async function notify(channel, newpage, oldPageFull, changedProps, changedBodyBlocks) {
    const lastEditedBy = newpage.last_edited_by;
    //get name by id from notion
    const lastEditedByName = await getUser(lastEditedBy.id);
    //iterate through properties object and find one with title and get plain_text
    let pageTitle = '';
    for (const prop in newpage.properties) {
        if (newpage.properties[prop].title) {
            pageTitle = newpage.properties[prop].title[0].plain_text;
            break;
        }
    }
    
    const link = `https://www.notion.so/${newpage.id.replace(/-/g, '')}`;

    let mattermostMessage = `${lastEditedByName.name} edited [${pageTitle}](${link}).\n`;
    mattermostMessage = await formatChangedNotionProps(newpage, oldPageFull, changedProps, mattermostMessage);
    //add all changed blocks to the message
    if (changedBodyBlocks.length > 0) { 
        mattermostMessage += `**Описание:**\n` 
        mattermostMessage = formatChangedNotionBlocks(changedBodyBlocks, mattermostMessage);
        mattermostMessage += `\n`
    }

    mattermostMessage += `[Посмотреть в Notion](${link})`;

    mattermostNotifier.sendMessageToChannel(channel, mattermostMessage);
    

    
}

    
    //define formatPageNotification
    
    module.exports.executeCheckChangesPageSendNotif = function() {
    checkChangesPageSendNotif()
        .then(() => {
            // Call succeeded, set next timeout
            setTimeout(module.exports.executeCheckChangesPageSendNotif, 3 * 60 * 1000);
        })
        .catch((error) => {
            console.error('An error occurred:', error);
    
            // Call failed, set next timeout
            setTimeout(module.exports.executeCheckChangesPageSendNotif, 3* 60 * 1000);
        });
    }
