const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const MattermostBot = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmToken = Nconf.get("MATTERMOST_TILDA_BOT");
const mmBot = new MattermostBot(mmUrl, mmToken);

const mmChannelTilda = Nconf.get("MATTERMOST_CHANNEL_TILDA");

async function processTildaReq(req, res) {
    const secret = req.headers['secret'];
    if (!secret || secret !== Nconf.get("TILDA_SECRET")) {
        res.status(401).send('Unauthorized: No secret in headers');
        return;
    }
    const data = req.body;
    //filter out the data we don't need = tranid, formid, Checkbox
    delete data.tranid;
    delete data.formid;
    delete data.Checkbox;
    //stringify the data as *key:* value
    const string = Object.keys(data).map(key => {
           if (key !== 'Textarea') return `**${key}:** \`${data[key]}\`` 
           else {
                const message = data[key] ? data[key].split('\n').map((line) => `> ${line}`).join('\n') : '';
                return `**${key}:**\n${message}`
           } 
        }).join('\n');

    try {
        await mmBot.sendMessageAsBot(mmChannelTilda, string, null);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error in processing Tilda webhook: " + error);
        res.sendStatus(500);
    }
}

module.exports = {
    processTildaReq
};