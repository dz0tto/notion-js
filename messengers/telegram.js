const TelegramBot = require('node-telegram-bot-api');
const Path = require('path');
const Nconf = require('nconf');
Nconf
.env()
.file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));

// Replace with your bot token
const token = Nconf.get("TG_BRIDGE_BOT_TOKEN");


// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

const MattermostNotifier = require('../messengers/mm');
const mmUrl = Nconf.get("MATTERMOST_URL");
const mmUsername = Nconf.get("MATTERMOST_USERNAME");
const mmPassword = Nconf.get("MATTERMOST_PASSWORD");
const mattermostNotifier = new MattermostNotifier(mmUrl, mmUsername, mmPassword);

module.exports.startBot = function() {
  // Event listener for when the bot is added to a new group or chat
  bot.on('message', (msg) => {
    if (msg.new_chat_members) {
      const chatId = msg.chat.id;
      const chatTitle = msg.chat.title || msg.chat.username || msg.chat.first_name;
      const chatType = msg.chat.type;

      const mattermostMessage = `Телеграм бот MM-Bridge добавлен в новый чат: [${chatTitle}](https://t.me/${chatId}) (ID: ${chatId}, Type: ${chatType})`;

      mattermostNotifier.sendMessageToUser('dzotto@levsha.eu', mattermostMessage);
    }
  });

  // Simple command to check if the bot is running
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Bot is running!');
  });
  console.log('TG-Bot is running...');
};
