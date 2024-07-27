const NotionHQ = require("@notionhq/client");
const { get } = require("lodash");

module.exports = function () {

    const Path = require('path');
    const Nconf = require('nconf');
    Nconf
        .env()
    .file(Path.join(Path.dirname(require.main.filename), 'credentials.json'));

    const notion = new NotionHQ.Client({ auth:  Nconf.get("NOTION_KEY") })

    // const databaseId = Nconf.get("NOTION_SALES_DATABASE_ID");

    module.filterCRM = async () => {
        try {
          var arrEmails = [];
          var notEndFlag = true;
          var next_cursor = false;
          while (notEndFlag) {
            var result = await getEmail(next_cursor);
            notEndFlag = result.has_more;
            next_cursor = result.has_more ? result.next_cursor : false;
            for (var i = 0; i < result.results.length; i++){
              arrEmails.push({
                id: result.results[i].id,
                email:  result.results[i].properties["DM (email)"].email
              });
            }
          }
          return arrEmails;
        } catch (error) {
          console.error(error.body)
        }
    }

    async function getEmail(next_cursor) {
      var options = {
        database_id: databaseId,
        filter: {
          "and": [
            {
              property: "Status",
              select: {
                does_not_equal : "Работаем",
              },
            }, 
            {
              property: "DM (email)",
              text: {
                is_not_empty : true,
              },
            }, 
            {
              property: "DM (email)",
              text: {
                contains : "@",
              },
            }
          ]
        },
      }
      if (next_cursor) options.start_cursor = next_cursor;
      return notion.databases.query(options);
    }

    module.updateDatabase = async (updatedDatabase) => {
      try {
        var result = await notion.databases.update(updatedDatabase);
        return result;
      } catch (error) {
        console.error(error.body)
      }
    }

    module.updatePage = async (updatedPage) => {
      try {
        var result = await notion.pages.update(updatedPage);
        return result;
      } catch (error) {
        console.error(error.body)
      }
    }

    module.createPage = async (newPage) => {
      try {
        var result = await notion.pages.create(newPage);
        return result;
      } catch (error) {
        console.error(error.body)
      }
    }

    module.getPageByID = async (pageId) => {
      try {
        var result = await notion.pages.retrieve({ page_id: pageId });
        return result
      } catch (error) {
        console.error(error.body)
      }
    }

    module.getPageByPropertyID = async (databaseId, propertyId) => {
      try {
          var notEndFlag = true;
          var next_cursor = false;
          while (notEndFlag) {
              var result = await getPageFilter(null, databaseId, next_cursor);
              notEndFlag = result.has_more;
              next_cursor = result.has_more ? result.next_cursor : false;
              for (var i = 0; i < result.results.length; i++){
                  if (result.results[i].properties["ID"].unique_id.number.toString() === propertyId) {
                      return result.results[i];
                  }
              }
          }
          return false;
      } catch (error) {
          console.error(error.body)
          return "error"
      }
  }

    module.getPageTitleByIDnName = async (pageId, property) => {
      try {
        var result = await notion.pages.retrieve({ page_id: pageId });
        return result.properties[property] && result.properties[property].title ? result.properties[property].title[0].plain_text: "";
      } catch (error) {
        console.error(error.body)
        return "";
      }
    }

    module.getPageTitleID = async (pageId) => {
      try {
        var result = await notion.pages.retrieve({ page_id: pageId });
        let pageTitle = "";
        for (const prop in result.properties) {
          if (result.properties[prop].title) {
              pageTitle = result.properties[prop].title[0].plain_text;
              break;
          }
      }
        return pageTitle
      } catch (error) {
        console.error(error.body)
        return "";
      }
    }

    module.deletePageByID = async (pageId) => {
      try {
        var result = await notion.pages.update({ page_id: pageId, archived: true });
        return result;
      } catch (error) {
        console.error(error.body)
        return false;
      }
    }

    module.getEmailByPageID = async (pageId, property) => {
      try {
        var result = await notion.pages.retrieve({ page_id: pageId });
        // check if property is array
        if (Array.isArray(result.properties[property].people)) {
          return result.properties[property].people.map((item) => {
            return item.person.email
          })
        } else {
          return result.properties[property] && result.properties[property].person ? [ result.properties[property].person.email ] : [];
        }
        
      } catch (error) {
        console.error(error.body)
      }
    }

    module.getPageBlocks = async (req) => {
      try {
        var arrBlocks = [];
        var notEndFlag = true;
        var next_cursor = false;
        while (notEndFlag) {
          var result = await getPageBlocks(req.body.pageId, next_cursor);
          notEndFlag = result.has_more;
          next_cursor = result.has_more ? result.next_cursor : false;
          for (var i = 0; i < result.results.length; i++){
            arrBlocks.push(result.results[i]);
          }
        }
        return arrBlocks;
      } catch (error) {
        console.error(error.body)
      }
    }

    async function getOneLevelBlocks (pageID) {
      try {
        var arrBlocks = [];
        var notEndFlag = true;
        var next_cursor = false;
        while (notEndFlag) {
          var result = await getPageBlocks(pageID, next_cursor);
          notEndFlag = result.has_more;
          next_cursor = result.has_more ? result.next_cursor : false;
          for (var i = 0; i < result.results.length; i++){
            arrBlocks.push(result.results[i]);
          }
        }
        return arrBlocks;
      } catch (error) {
        console.error(error.body)
      }
    }

    module.getAllLevelChildren = async (pageID) => {
       try {
        let arrBlocks = await getOneLevelBlocks(pageID);
        if (!arrBlocks) return [];
        for (let i = 0; i < arrBlocks.length; i++) {
          if (arrBlocks[i].has_children) {
            arrBlocks[i].children = await getOneLevelBlocks(arrBlocks[i].id);
          }
        }
        return arrBlocks;
       } catch (error) {
          console.error(error.body)
       }    
    }

    async function getPageBlocks(pageID, next_cursor) {
      var options = {
        block_id: pageID
      }
      if (next_cursor) options.start_cursor = next_cursor;
      if (!pageID) return [""]
      return notion.blocks.children.list(options);
    }


    module.addMessageBlock = async (req) => {
      try {
        var content = [{
          object: "block",
          type: "toggle",
          toggle: {
            "text": [
              {
                  "type": "text",
                  "text": {
                      "content": req.body.date + " | ",
                      "link": null
                  }
              },
              {
                  "type": "text",
                  "text": {
                      "content": req.body.sender,
                      "link": null
                  },
                  "annotations": {
                      "bold": true,
                      "italic": false,
                      "strikethrough": false,
                      "underline": false,
                      "code": false,
                      "color": "default"
                  }
              },
              {
                  "type": "text",
                  "text": {
                      "content": " | ",
                      "link": null
                  }
              },
              {
                  "type": "text",
                  "text": {
                      "content": req.body.theme + " | ",
                      "link": null
                  },
                  "annotations": {
                      "bold": false,
                      "italic": true,
                      "strikethrough": false,
                      "underline": false,
                      "code": false,
                      "color": "default"
                  }
              },
              {
                  "type": "text",
                  "text": {
                      "content": req.body.shortBody,
                      "link": null
                  }
              }
             ],
            children: [
              {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                  "text": [
                    {
                      "type": "text",
                      "text": {
                        "content": req.body.message
                      }
                    }
                  ]
                }
              }
            ]
          }
        }];
        var result = await appendPageBlocks(req.body.pageId, content);
        return result;
      } catch (error) {
        console.error(error.body)
      }
    }


    async function appendPageBlocks(pageID, content) {
      var options = {
        block_id: pageID,
        children: content
      }
      if (!pageID) return [""]
      return notion.blocks.children.append(options);
    }


    module.getClientsSoldCRM = async (pm) => {
      try {
        var arrCodes = [];
        var notEndFlag = (pm != "");
        var next_cursor = false;
        while (notEndFlag) {
          var result = await getClientsCodes(pm, next_cursor);
          notEndFlag = result.has_more;
          next_cursor = result.has_more ? result.next_cursor : false;
          for (var i = 0; i < result.results.length; i++){
            arrCodes.push({
              client:  result.results[i].properties["Код клиента"].rich_text[0].plain_text
            });
          }
        }
        return arrCodes;
      } catch (error) {
        console.error(error.body)
      }
  }

  async function getClientsCodes(pm, next_cursor) {
    var options = {
      database_id: databaseId,
      filter: {
        "and": [
          {
            property: "Status",
            select: {
              equals : "Работаем",
            },
          }, 
          {
            property: "Код клиента",
            text: {
              is_not_empty : true,
            },
          }, 
          {
            property: "Ответственный",
            people: {
              contains : pm,
            },
          }
        ]
      },
    }
    if (next_cursor) options.start_cursor = next_cursor;
    return notion.databases.query(options);
  }

  module.getPagesFilter = async (filter, dbId) => {
    try {
      var arrPages = [];
      var notEndFlag = (dbId != "");
      var next_cursor = false;
      while (notEndFlag) {
        var result = await getPageFilter(filter, dbId, next_cursor);
        notEndFlag = result.has_more;
        next_cursor = result.has_more ? result.next_cursor : false;
        for (var i = 0; i < result.results.length; i++){
          arrPages.push(result.results[i]);
        }
      }
      return arrPages;
    } catch (error) {
      console.error(error.body)
    }
  }

  getPageFilter = async function (filter, dbId, next_cursor) {
    var options = {
      database_id: dbId
    }
    if (filter) options.filter = filter;
    if (next_cursor) options.start_cursor = next_cursor;
    return notion.databases.query(options);
  }


  module.getUserID = async (name) => {
    try {
      var userID = '';
      var notEndFlag = true;
      var next_cursor = false;
      while (notEndFlag) {
        var result = await getUsers(name, next_cursor);
        notEndFlag = result.has_more;
        next_cursor = result.has_more ? result.next_cursor : false;
        for (var i = 0; i < result.results.length; i++){
          if (result.results[i].name === name) {
            userID = result.results[i].id;
            notEndFlag = false;
            break;
          }
        }
      }
      return userID;
    } catch (error) {
      console.error(error.body)
    }
  }

  module.getUser = async (id) => {
    try {
      var user = await notion.users.retrieve({ user_id: id });
      return user;
    } catch (error) {
      console.error(error.body)
    }
  }

async function getUsers(name, next_cursor) {
  var options = {
  }
  if (next_cursor) options.start_cursor = next_cursor;
  return notion.users.list(options)
}



    return module;
}