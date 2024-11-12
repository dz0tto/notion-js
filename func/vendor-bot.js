const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const { MattermostBot } = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmToken = Nconf.get("MATTERMOST_VENDOR_BOT");
const mmBot = new MattermostBot(mmUrl, mmToken);

async function processVendorReq(req, res) {
    try {
        const secret = req.headers['secret'];
        if (!secret || secret !== Nconf.get("VENDOR_SECRET")) {
            res.status(401).send('Unauthorized: No secret in headers');
            return;
        }
        const { email, message } = req.body;

        try {
            await mmBot.sendMessageToUser(email, message);
            res.sendStatus(200);
        } catch (error) {
            console.error("Error in sending Vendor message: " + error);
            res.sendStatus(500);
        }
    }
    catch (error) {
        console.error("General error in processing Vendor message: " + error);
        res.sendStatus(500);
    }
}

module.exports = {
    processVendorReq
};