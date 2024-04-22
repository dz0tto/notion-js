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


// const express = require('express');
// const bodyParser = require('body-parser');

// const app = express();

// app.use(bodyParser.urlencoded({ extended: true }));

// app.post('/slack/actions', (req, res) => {
//     // Parse the `payload` body parameter into a JSON object
//     processSlackActions(req, res);
// });

// app.listen(8080, () => {
//     console.log('Server is running on port 3000');
// });


