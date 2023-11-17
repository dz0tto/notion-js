module.exports = function () {
    const { filterCRM, getPageBlocks, addMessageBlock } = require("./database.datalayer")();

    module.emailsCRM = async (req, res) => {
        if (req.body.secret == 'OURconnectorSECRET777') {
            var result = await filterCRM();
            res.json({results: result});
        } else {
            res.status(403).json({ error: "Forbidden" });
        }
    };

    module.pageBlocks = async (req, res) => {
        if (req.body.secret == 'OURconnectorSECRET777') {
            var result = await getPageBlocks(req);
            res.json({results: result});
        } else {
            res.status(403).json({ error: "Forbidden" });
        }
    };

    module.addMessage = async (req, res) => {
        if (req.body.secret == 'OURconnectorSECRET777') {
            var result = await addMessageBlock(req);
            res.json({results: result});
        } else {
            res.status(403).json({ error: "Forbidden" });
        }
    };
    return module;
}
