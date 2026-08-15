const express = require('express');
const {
    getAllContexts, addContext, setContextActiveById, updateCrumbByContextId,
} = require('../controllers/contexts.controller');

const router = express.Router();

router.get('/', getAllContexts);
router.post('/', addContext);
// Distinct paths: the two POSTs used to share '/', so the second was unreachable.
router.post('/:id/switch', setContextActiveById);
router.post('/:id/breadcrumb', updateCrumbByContextId);

module.exports = router;
