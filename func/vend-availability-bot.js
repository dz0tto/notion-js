const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const { MattermostBot } = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmToken = Nconf.get("MATTERMOST_VENDOR_AVAILABILITY_BOT");
const bot = new MattermostBot(mmUrl, mmToken);

const { WebSocketClient } = require('@mattermost/client');

const connectionUrl = bot.mattermostClient.getWebSocketUrl();

const WebSocket = require('ws');

if (!globalThis.WebSocket) {
    globalThis.WebSocket = WebSocket;
}

const client = new WebSocketClient(connectionUrl, mmToken);
//client.initialize(connectionUrl, mmToken);


async function postInThread(channelId, respondToRootId, text) {
    try {
        await bot.sendMessageAsBot(channelId, text, null, respondToRootId);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
}

client.addMessageListener(async (msg) => {
    let message = msg.data;
    message.message = message.post ? JSON.parse(message.post) : {}  ;
    // Check for mention and if it's direct message to bot
    if (msg.event === 'posted' && (message.message?.message?.includes(`@task_allocation_bot`) || (message.channel_type === 'D') && message.sender_name !== '@task_allocation_bot')) {
        const messageObj = message.message;
        const respondToRootId = messageObj.root_id || message.channel_type === 'D' ? '' : messageObj.id;
        const channelId = messageObj.channel_id;

        console.log(message);

        let ulist = await bot.getUsersInTeam('external-team'); // Fetch users in the team

        if (!ulist || !ulist.length) {
            await postInThread(channelId, respondToRootId, "Failed fetching users.");
        }

        const defaultStatusFilter = ["large_green_circle", "large_yellow_circle"];
        const linguists = await parseUsers(ulist, defaultStatusFilter);

        const green = linguists.filter(u => u.emoji === "large_green_circle");
        const yellow = linguists.filter(u => u.emoji === "large_yellow_circle");

        if (green.length) {
            await postInThread(channelId, respondToRootId, `Found ${green.length} :large_green_circle: available ${green.length === 1 ? 'linguist' : 'linguists'}:`);
            let response = "";
            response += `| Username | Name | Status |\n|--------|------|-----------|\n`; // Table header
            green.forEach(u => {
                response += `| ${u.tag} | ${u.name} | ${u.status ? u.status : ' - '} |\n`; // Add green users
            });
            await postInThread(channelId, respondToRootId, response);
        }
        
        if (yellow.length) {
            await postInThread(channelId, respondToRootId, `Found ${yellow.length} :large_yellow_circle: partially available ${yellow.length === 1 ? 'linguist' : 'linguists'}:`);
            let response = "";
            response += `| Username | Name | Status |\n|--------|--------|-----------|\n`; // Table header
            yellow.forEach(u => {
                response += `| ${u.tag} | ${u.name} | ${u.status ? u.status : ' - '} |\n`; // Add yellow users
            });
            await postInThread(channelId, respondToRootId, response);
        }
    }
});

async function parseUsers(members, statusFilter) {
    const linguists = [];
    for (const m of members) {
        const user = await bot.findUserById(m.user_id); 
        if (user) {
            if (user.delete_at !== 0) continue; // Skip deleted users
            user.status = user.props?.customStatus ? JSON.parse(user.props.customStatus) : null;
            if (!user.status) continue;
            if (user.status && user.status.emoji && statusFilter.includes(user.status.emoji)) {
                linguists.push({
                    tag: `@${user.username}`,
                    emoji: user.status.emoji,
                    status: user.status.text,
                    name: user.first_name + ' ' + user.last_name 
                });
            }
        };
    }
    return linguists;
}

function startVendorAvailabilityBot() {
    client.initialize(connectionUrl, mmToken);
}

module.exports = {
    startVendorAvailabilityBot
};