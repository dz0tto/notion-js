const { executeCheckAndRenameSessions } = require("./func/rename-sessions");

const { executeCheckChangesSendNotif } = require("./func/send-notif-sess");

const { executePlanSessions } = require("./func/gcal-sync");

const { executeCheckAndCreateFinances } = require("./func/create-finances");

const { executeIssueActorsPOs } = require("./func/issue-po-actors");

const { executeIssueStudioPOs } = require("./func/issue-po-studio");


executeCheckAndRenameSessions();

executeCheckChangesSendNotif();

executePlanSessions();

executeCheckAndCreateFinances();

executeIssueActorsPOs();

executeIssueStudioPOs();

