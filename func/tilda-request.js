const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const MattermostBot = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmToken = Nconf.get("MATTERMOST_TILDA_BOT");
const mmBot = new MattermostBot(mmUrl, mmToken);

async function processTildaReq(req, res) {
    const data = req.body;
    //stringify the data
    const string = JSON.stringify(data);
    const channelId = ''; // replace with your channel ID

    try {
        await mmBot.sendMessageAsBot(channelId, string, null);
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    }
}

module.exports = processTildaReq;