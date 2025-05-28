const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Question = require('../models/Question');
const Table = require('../models/Table');
const middleware = require('../middleware/auth');

/**
 * GET /admin/users
 * List all users (excluding passwords)
 */
router.get('/users', middleware, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /admin/questions
 * List all questions
 */
router.get('/questions', middleware, async (req, res) => {
  try {
    const questions = await Question.find({}, '-__v');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

/**
 * GET /admin/ladders
 * List all ladders (tables)
 */
router.get('/ladders', middleware, async (req, res) => {
  try {
    const ladders = await Table.find({}, '-__v');
    res.json(ladders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ladders' });
  }
});

/**
 * DELETE /admin/users/:username
 * Delete a user and remove their username from all questions' solved_by arrays
 */
router.delete('/users/:username', middleware, async (req, res) => {
  const username = req.params.username;

  try {
    // Delete user
    const user = await User.findOneAndDelete({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove username from all questions' solved_by arrays
    await Question.updateMany(
      { solved_by: username },
      { $pull: { solved_by: username } }
    );

    res.json({ message: `User "${username}" deleted and removed from all solved_by lists.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

/**
 * DELETE /admin/questions/:id
 * Delete a question and remove it from all ladders' questions arrays
 */
router.delete('/questions/:id', middleware, async (req, res) => {
  const questionId = Number(req.params.id);

  try {
    // Delete question
    const question = await Question.findOneAndDelete({ question_id: questionId });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Remove question id from all tables' questions arrays
    await Table.updateMany(
      { questions: questionId },
      { $pull: { questions: questionId } }
    );

    res.json({ message: `Question with id ${questionId} deleted and removed from all ladders.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question: ' + err.message });
  }
});

/**
 * DELETE /admin/ladders/:id
 * Delete a ladder/table by table_id
 */
router.delete('/ladders/:id', middleware, async (req, res) => {
  const tableId = Number(req.params.id);

  try {
    const ladder = await Table.findOneAndDelete({ table_id: tableId });
    if (!ladder) {
      return res.status(404).json({ error: 'Ladder not found' });
    }

    res.json({ message: `Ladder with id ${tableId} deleted.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete ladder: ' + err.message });
  }
});

module.exports = router;