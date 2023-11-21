const { WebClient } = require('@slack/web-api');

class SlackNotifier {
  constructor(token) {
    this.slackClient = new WebClient(token);
  }

  async findUserByEmail(email) {
    try {
        const response = await this.slackClient.users.lookupByEmail({ email });
        return response.user.id;
    } catch (error) {
        console.error('Error finding user by email:', error);
    }
  }

  async sendMessageToUser(email, message) {
    if (email === '') return
    try {
        // check if email contains @levshagames.ru and replace by @levsha.eu
        if (email.includes('@levshagames.ru')) {
            email = email.replace('@levshagames.ru', '@levsha.eu')
        }
        const userId = await this.findUserByEmail(email);
        if (userId) {
            await this.slackClient.chat.postMessage({
            channel: userId,
            ...message
            });
        } else {
            console.error('User not found');
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
  }
}

module.exports = SlackNotifier;