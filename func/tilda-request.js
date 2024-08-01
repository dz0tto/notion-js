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
    //stringify the data as *key:* value
    const string = Object.keys(data).map(key => `**${key}:** ${data[key]}`).join('\n');

    try {
        await mmBot.sendMessageAsBot(mmChannelTilda, string, null);
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    }
}

module.exports = {
    processTildaReq
};