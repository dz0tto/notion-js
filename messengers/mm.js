const { Client4 } = require('@mattermost/client');

class MattermostNotifier {
    constructor(url, username, password) {
        this.mattermostClient = new Client4();
        this.mattermostClient.setUrl(url);
        this.loginAndGetToken(username, password);
    }

    async loginAndGetToken(username, password) {
        try {
            const { id: userId } = await this.mattermostClient.login(username, password);
            const token = this.mattermostClient.getToken();
            this.mattermostClient.setToken(token);
            this.mattermostClient.userId = userId;
        } catch (error) {
            console.error('Error logging in and getting token:', error);
        }
    }

  async findUserByEmail(email) {
    try {
      const user = await this.mattermostClient.getUserByEmail(email);
      return user.id;
    } catch (error) {
      console.error('Error finding user by email:', error);
    }
  }

  async sendMessageToUser(email, message) {
    if (email === '') return;
    try {
      // check if email contains @levshagames.ru and replace by @levsha.eu
      if (email.includes('@levshagames.ru')) {
        email = email.replace('@levshagames.ru', '@levsha.eu');
      }
      const userId = await this.findUserByEmail(email);
      if (userId) {
        const directChannel = await this.mattermostClient.createDirectChannel([this.mattermostClient.userId, userId]);
        await this.mattermostClient.createPost({
          channel_id: directChannel.id,
          message: message
        });
      } else {
        console.error('User not found');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async sendMessageToChannel(channelName, message) {
    try {
      const channel = await this.mattermostClient.getChannelByNameAndTeamName('levsha', channelName);
      if (channel) {
        await this.mattermostClient.createPost({
          channel_id: channel.id,
          message: message
        });
      } else {
        console.error('Channel not found');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}

module.exports = MattermostNotifier;