const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));


const { MattermostBot } = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmToken = Nconf.get("MATTERMOST_VENDOR_AVAILABILITY_BOT");

//const mmToken = Nconf.get("TEST_MATTERMOST_VENDOR_AVAILABILITY_BOT");
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
        let message = await bot.sendMessageAsBot(channelId, text, null, respondToRootId);
        return message;
    } catch (error) {
        console.error(`Error: ${error}`);
        return null;
    }
}

async function updateMessage(messageId, text) {
    let message = await bot.mattermostClient.updatePost({id: messageId, message: text});
    return message;
}

client.addMessageListener(async (msg) => {
    let message = msg.data;
    message.message = message.post ? JSON.parse(message.post) : {}  ;
    // Check for mention and if it's direct message to bot
    if (msg.event === 'posted' && message.mentions?.includes(bot.botUserId)) {
        const messageObj = message.message;

        const respondToRootId = message.channel_type === 'D' 
            ? '' 
            : messageObj.root_id === '' ? messageObj.id : messageObj.root_id;
        const channelId = messageObj.channel_id;
        //post ethemeral message to user
        let startTime = new Date();
        let tempMessage = await postInThread(channelId, respondToRootId, "Hello, starting to fetch availability...");

        console.log(message);

        let ulist = await bot.getUsersInTeam('external-team'); // Fetch users in the team

        if (!ulist || !ulist.length) {
            //delete ephemeral message
            await updateMessage(tempMessage.id, "Failed fetching users.");
        } else {
            //delete ephemeral message
            await updateMessage(tempMessage.id, "Got the list of linguists...");
        }

        const defaultStatusFilter = ["large_green_circle", "large_yellow_circle"];
        const linguists = await parseUsers(ulist, defaultStatusFilter);

        const green = linguists.filter(u => u.emoji === "large_green_circle");
        const yellow = linguists.filter(u => u.emoji === "large_yellow_circle");

        //delete ephemeral message
        let endTime = new Date();
        let time = (endTime - startTime) / 1000;
        await updateMessage(tempMessage.id, `Done in ${time} seconds`);

        if (green.length) {
            await postInThread(channelId, respondToRootId, `Found ${green.length} :large_green_circle: available ${green.length === 1 ? 'linguist' : 'linguists'}:`);
            let response = "";
            response += `| Username | Name | Status |\n|--------|------|-----------|\n`; // Table header
            green.forEach(u => {
                response += `| ${u.tag} ${u.online} | ${u.name} | ${u.status ? u.status : ' - '} |\n`; // Add green users
            });
            await postInThread(channelId, respondToRootId, response);
        }
        
        if (yellow.length) {
            await postInThread(channelId, respondToRootId, `Found ${yellow.length} :large_yellow_circle: partially available ${yellow.length === 1 ? 'linguist' : 'linguists'}:`);
            let response = "";
            response += `| Username | Name | Status |\n|--------|--------|-----------|\n`; // Table header
            yellow.forEach(u => {
                response += `| ${u.tag} ${u.online} | ${u.name} | ${u.status ? u.status : ' - '} |\n`; // Add yellow users
            });
            await postInThread(channelId, respondToRootId, response);
        }

        if (green.length < 1 && yellow.length < 1) {
            await postInThread(channelId, respondToRootId, "No linguists found.");
        }
    }
});

async function parseUsers(members, statusFilter) {
    const linguists = [];

    for (const m of members) {
        const user = m;
        if (user) {
            if (user.delete_at !== 0) continue; // Skip deleted users
            user.status = user.props?.customStatus ? JSON.parse(user.props.customStatus) : null;
            if (!user.status) continue;

            if (user.status && user.status.emoji && statusFilter.includes(user.status.emoji)) {
                linguists.push({
                    id: user.id,
                    tag: `@${user.username}`,
                    emoji: user.status.emoji,
                    status: user.status.text,
                    name: user.first_name + ' ' + user.last_name,
                });
            }
        }
    }
    const currentStatuses = await bot.mattermostClient.getStatusesByIds(linguists.map(v => v.id));
    linguists.forEach(v => {
        // Check if the user is online
        const user = currentStatuses.find(s => s.user_id === v.id);
        const isOnline = user.status === 'online' ? ':green_heart:' : user.status === 'away' ?':yellow_heart:' : ':white_heart:';
        v.online = isOnline;
    });
    //sort linguists by online status, green first, yellow second, white last
    linguists.sort((a, b) => {
        if (a.online === ':green_heart:') return -1;
        if (b.online === ':green_heart:') return 1;
        if (a.online === ':yellow_heart:') return -1;
        if (b.online === ':yellow_heart:') return 1;
        return 0;
    });
    return linguists;
}

function startVendorAvailabilityBot() {
    client.initialize(connectionUrl, mmToken);
    bot.initializeBotUser();
}

module.exports = {
    startVendorAvailabilityBot
};