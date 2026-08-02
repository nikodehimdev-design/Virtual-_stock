const router = require('express').Router();
const model = require('../Controller/aimodelcontroller');

router.post('/ai', model.getAIModel);




module.exports = router;