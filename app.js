// const { executeCheckAndRenameSessions } = require("./func/rename-sessions");

// const { executeCheckChangesSendNotif } = require("./func/send-notif-sess");

// const { executePlanSessions } = require("./func/gcal-sync");

// const { executeCheckAndCreateFinances } = require("./func/create-finances");

// const { executeIssueActorsPOs } = require("./func/issue-po-actors");

// const { executeIssueStudioPOs } = require("./func/issue-po-studio");

// const { executeDeleteStudioPOs } = require("./func/issue-po-studio");

// const { executeSyncGSheetActors } = require("./func/sync-gsheet-actors");

// const { executeSyncGSheetSessions } = require("./func/sync-gsheet-sessions");

// const { executeCheckChangesPageSendNotif } = require("./func/send-notif-db");

// //const { executeSyncGSheetPortalSessions } = require("./func/sync-gsheet-sessions-portal");

 const { startVendorAvailabilityBot } = require("./func/vend-availability-bot");
// const tgBot = require("./messengers/telegram");

// const { processTildaReq } = require("./func/tilda-request");

// const { processVendorReq } = require("./func/vendor-bot");

// tgBot.startBot();

// executeCheckAndRenameSessions();
// executeSyncGSheetActors();

// executeCheckChangesSendNotif();
// executeSyncGSheetSessions();

// executePlanSessions();

// executeCheckAndCreateFinances();

// executeIssueActorsPOs();

// executeDeleteStudioPOs();

// executeIssueStudioPOs();

// executeCheckChangesPageSendNotif();

// //executeSyncGSheetPortalSessions();

 startVendorAvailabilityBot();

// const express = require('express');
// const bodyParser = require('body-parser');

// const app = express();

// app.use(bodyParser.json());

// app.post('/webhook/tilda', (req, res) => {
//     // Parse the `payload` body parameter into a JSON object
//     processTildaReq(req, res);
// });

// app.post('/webhook/vendorbot', (req, res) => {
//     // Parse the `payload` body parameter into a JSON object
//     processVendorReq(req, res);
// });

// const port = process.env.PORT || 3000;

// app.listen(port, () => {
//     console.log(`Server is running on port ${port}`);
// });


