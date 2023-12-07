const { executeCheckAndRenameSessions } = require("./func/rename-sessions");

const { executeCheckChangesSendNotif } = require("./func/send-notif-sess");

const { executePlanSessions } = require("./func/gcal-sync");

const { executeCheckAndCreateFinances } = require("./func/create-finances");

const { executeIssuePOs } = require("./func/issue-po-actors");


executeCheckAndRenameSessions();

executeCheckChangesSendNotif();

executePlanSessions();

executeCheckAndCreateFinances();

executeIssuePOs();

