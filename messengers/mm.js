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

class MattermostBot {
  constructor(url, botToken) {
    this.mattermostClient = new Client4();
    this.mattermostClient.setUrl(url);
    this.mattermostClient.setToken(botToken);
    this.botUserId = null;
  }

  async initializeBotUser() {
    try {
      const botUser = await this.mattermostClient.getMe();
      this.botUserId = botUser.id;
    } catch (error) {
      console.error('Error initializing bot user:', error);
    }
  }

  async sendMessageAsBot(channelId, message, attachments, respondToRootId) {
    try {
      let post = {
        message: message
      }
      if (channelId !== '') {
        post.channel_id = channelId
      }
      if (attachments) {
        post.attachments = attachments;
      }
      if (respondToRootId) {
        post.root_id = respondToRootId;
      }
      const msg = await this.mattermostClient.createPost(post);
      return msg;
    } catch (error) {
      console.error('Error sending message as bot: ', error);
      return null;
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

  async findUserById(userId) {
    try {
      const user = await this.mattermostClient.getUser(userId);
      return user;
    } catch (error) {
      console.error('Error finding user by id:', error);
      return null;
    }
  }

  async getUserStatus(userId) {
    try {
      const status = await this.mattermostClient.getStatus(userId);
      return status;
    } catch (error) {
      console.error('Error getting user status:', error);
      return null;
    }
  }

  async getUsersInTeam(teamName) {
    try {
        const team = await this.mattermostClient.getTeamByName(teamName);
        // get all users in the team with pages
        const users = await this.mattermostClient.getProfilesInTeam(team.id, 0, 400);
        return users;
    } catch (error) {
        console.error('Error fetching users in team:', error);
        return [];
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
        if (!this.botUserId) {
          await this.initializeBotUser();
        }
        const directChannel = await this.mattermostClient.createDirectChannel([this.botUserId, userId]);
        await this.sendMessageAsBot(directChannel.id, message);
      } else {
        console.error('User not found');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}

module.exports = { MattermostNotifier, MattermostBot }; 