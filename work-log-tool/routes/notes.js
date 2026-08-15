const express = require('express');
const {
    getFilteredNotes, addNote, editNote, deleteNote, retranscribe,
} = require('../controllers/notes.controller');

const router = express.Router();

router.get('/', getFilteredNotes);
router.post('/', addNote);
router.patch('/:id', editNote);
router.delete('/:id', deleteNote);
router.post('/:id/retranscribe', retranscribe);

module.exports = router;
