module.exports = function (pool) {
    var module = {};
    

    const databaseController = require( "./database/database.controller")();

    const databaseDatalayer = require( "./database/database.datalayer")();


    const notionControllers = Object.assign(
        {},
        databaseController,
    );

    const notionDataAdapters = Object.assign(
        {},
        databaseDatalayer,
    );

    
    module.notionControllers = notionControllers;
    module.notionDataAdapters = notionDataAdapters;
    return module;
}