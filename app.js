const { executeCheckAndRenameSessions } = require("./func/rename-sessions");

const { executeCheckChangedStatusSendNotif } = require("./func/send-notif-sess");

const { executePlanSessions } = require("./func/gcal-sync");


executeCheckAndRenameSessions();

executeCheckChangedStatusSendNotif();

executePlanSessions();

