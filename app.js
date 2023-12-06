const { executeCheckAndRenameSessions } = require("./func/rename-sessions");

const { executeCheckChangesSendNotif } = require("./func/send-notif-sess");

const { executePlanSessions } = require("./func/gcal-sync");

const { executeIssuePOs } = require("./func/issue-po-actors");


executeCheckAndRenameSessions();

executeCheckChangesSendNotif();

executePlanSessions();

executeIssuePOs();

