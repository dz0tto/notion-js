const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const { notifyPortalSession } = require("./send-notif-sess");

async function processVOBotReq(req, res) {
    try {
        const { secret, session, prevStatus, currentStatus } = req.body;

        if (!secret || secret !== Nconf.get("VO_BOT_SECRET")) {
            res.status(401).send('Unauthorized: No secret in headers');
            return;
        }

        try {
            await notifyPortalSession(session, prevStatus, currentStatus)
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
    processVOBotReq
};