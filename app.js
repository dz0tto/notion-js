const { executeCheckAndRenameSessions } = require("./func/rename-sessions");

const { executeCheckChangesSendNotif } = require("./func/send-notif-sess");

const { executePlanSessions } = require("./func/gcal-sync");

const { executeCheckAndCreateFinances } = require("./func/create-finances");

const { executeIssueActorsPOs } = require("./func/issue-po-actors");

const { executeIssueStudioPOs } = require("./func/issue-po-studio");

const { executeDeleteStudioPOs } = require("./func/issue-po-studio");

const { executeSyncGSheetActors } = require("./func/sync-gsheet-actors");

const { executeSyncGSheetSessions } = require("./func/sync-gsheet-sessions");

// const { processSlackActions } = require("./func/slack-actions");

executeCheckAndRenameSessions();
executeSyncGSheetActors();

executeCheckChangesSendNotif();
executeSyncGSheetSessions();

executePlanSessions();

executeCheckAndCreateFinances();

executeIssueActorsPOs();

executeDeleteStudioPOs();

executeIssueStudioPOs();

const bot = require("./messengers/telegram");

const express = require('express');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json());

// Replace with your public URL
const url = 'dzotto-slack.azurewebsites.net';
const port = process.env.PORT || 3000;

// Set up the webhook
bot.setWebHook(`${url}/bot${bot.token}`);

// Event listener for incoming updates
app.post(`/bot${bot.token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.listen(port, () => {
    console.log('Server is running on port ' + port);
});


