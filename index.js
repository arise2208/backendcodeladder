require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const app = express();
const port = process.env.PORT;
const User = require('./models/User');
const Question = require('./models/Question');
const Table = require('./models/Table');
const middleware = require('./middleware/auth');

app.use(express.json());
const cors = require('cors');
app.use(cors());

const authroute = require('./routes/authentication');
app.use('/authen', authroute);

const protectedRoutes = require('./routes/protected');
app.use('/protected', protectedRoutes);

const authenticateToken = require('./middleware/auth');
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const codechefRoute = require('./routes/codechef');
app.use('/api', codechefRoute);


mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

app.get('/', (req, res) => {
  res.send('Hello World!');
});


// Users list (protected)
app.get('/userslist', middleware, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "❌ Failed to fetch users" });
  }
});

// Problem set (protected)
app.get('/problemset', middleware, async (req, res) => {
  try {
    const questions = await Question.find({}, '-_id -__v');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: "❌ Failed to fetch users" });
  }
});

// User profile (protected)
app.get('/user/:userid', middleware, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.userid }).populate('tables');
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "❌ Failed to fetch user: " + err.message });
  }
});

// Add question (protected)
app.post('/addquestion', middleware, async (req, res) => {
  try {
    const { title, link, tags } = req.body;
    if (!title || !link) {
      return res.status(400).json({ error: 'Title and link are required.' });
    }

    // Check for duplicate link
    const exists = await Question.findOne({ link: link.trim() });
    if (exists) {
      return res.status(400).json({ error: 'A question with this link already exists.' });
    }

    const newQuestion = new Question({
      title,
      link: link.trim(),
      tags: Array.isArray(tags) ? tags : [],
    });
    await newQuestion.save();

    return res.json({ message: 'Question added successfully!', question: newQuestion });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create table (protected)
app.post('/createtable', middleware, async (req, res) => {
  try {
    const { table_title, user } = req.body;

    if (!table_title || !user) {
      return res.status(400).json({ error: "Table title and creator are required" });
    }
    const table = new Table({
      table_title,
      questions: [],
      user: [user],
    });

    await table.save();
    res.status(201).json({ message: "✅ Table created successfully", table });
  } catch (error) {
    res.status(500).json({ error: "❌ Server error: " + error.message });
  }
});

// Get ladders (protected)
app.post('/ladders', middleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username is required" });

    const ladders = await Table.find({ user: username });

    res.json(ladders);
  } catch (error) {
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Edit table (protected)
app.patch('/edittable', middleware, async (req, res) => {
  try {
    const { table_id, questionIds, action } = req.body;

    if (!table_id || !Array.isArray(questionIds) || questionIds.length === 0 || !action) {
      return res.status(400).json({ error: "table_id, non-empty questionIds array, and action ('add' or 'remove') are required" });
    }

    const table = await Table.findOne({ table_id });
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    if (action === 'add') {
      questionIds.forEach(qId => {
        if (!table.questions.includes(qId)) {
          table.questions.push(qId);
        }
      });
    } else if (action === 'remove') {
      table.questions = table.questions.filter(qId => !questionIds.includes(qId));
    } else {
      return res.status(400).json({ error: "Invalid action, must be 'add' or 'remove'" });
    }
    await table.save();
    res.json({ message: "Table updated successfully", table });
  } catch (error) {
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Get ladder details (protected)
app.get('/ladder/:table_id', middleware, async (req, res) => {
  try {
    const { table_id } = req.params;
    const ladder = await Table.findOne({ table_id: Number(table_id) });
    if (!ladder) return res.status(404).json({ error: 'Ladder not found' });
    res.json(ladder);
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get question details (protected)
app.get('/question/:question_id', middleware, async (req, res) => {
  try {
    const id = req.params.question_id;

    const question = await Question.findOne({ question_id: Number(id) });

    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Copy table (protected)
app.post('/copytable', middleware, async (req, res) => {
  try {
    const { source_table_id, new_table_title, new_user_id } = req.body;

    if (!source_table_id || !new_table_title || !new_user_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const sourceTable = await Table.findOne({ table_id: source_table_id });
    if (!sourceTable) {
      return res.status(404).json({ error: "Source table not found" });
    }

    const newTable = new Table({
      table_title: new_table_title,
      questions: [...new Set(sourceTable.questions)],
      user: [new_user_id]
    });

    await newTable.save();

    res.status(201).json({ message: "✅ Table copied successfully", table: newTable });

  } catch (error) {
    res.status(500).json({ error: "❌ Server error: " + error.message });
  }
});

// Delete ladder (protected)
app.delete('/deleteladder', middleware, async (req, res) => {
  try {
    const { table_id, user_id } = req.body;

    if (!table_id || !user_id) {
      return res.status(400).json({ error: "table_id and user_id are required" });
    }

    // Find the table
    const table = await Table.findOne({ table_id: table_id });
    if (!table) {
      return res.status(404).json({ error: "Ladder not found" });
    }

    // Check if user has permission to delete (is in the user array)
    if (!table.user.includes(user_id)) {
      return res.status(403).json({ error: "You don't have permission to delete this ladder" });
    }

    // Delete the table
    await Table.deleteOne({ table_id: table_id });

    res.status(200).json({ message: "✅ Ladder deleted successfully" });

  } catch (error) {
    res.status(500).json({ error: "❌ Server error: " + error.message });
  }
});

// Add collaborator (protected)
app.post('/collabtable', middleware, async (req, res) => {
  try {
    const { source_table_id, new_user_id } = req.body;

    if (!source_table_id || !new_user_id) {
      return res.status(400).json({ error: 'source_table_id and new_user_id are required' });
    }

    // Find the table by table_id
    const table = await Table.findOne({ table_id: source_table_id });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Check if new_user_id already exists in user array
    if (table.user.includes(new_user_id)) {
      return res.status(400).json({ error: 'User already added to this table' });
    }

    // Add new user to the user array
    table.user.push(new_user_id);

    // Save updated table
    await table.save();

    return res.status(200).json({ message: 'User added successfully', users: table.user });
  } catch (error) {
    console.error('Error adding user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove collaborator (protected)
app.post('/removecollab', middleware, async (req, res) => {
  try {
    const { source_table_id, user_to_remove } = req.body;

    if (!source_table_id || !user_to_remove) {
      return res.status(400).json({ error: 'source_table_id and user_to_remove are required' });
    }

    // Find the table
    const table = await Table.findOne({ table_id: source_table_id });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Check if the user is the owner (cannot remove the owner)
    if (table.user[0] === user_to_remove) {
      return res.status(403).json({ error: 'Cannot remove the owner of the ladder' });
    }

    // Check if the user exists in the collaborators
    if (!table.user.includes(user_to_remove)) {
      return res.status(400).json({ error: 'User not found in this ladder' });
    }

    // Remove user
    table.user = table.user.filter(u => u !== user_to_remove);

    // Save changes
    await table.save();

    return res.status(200).json({ message: 'User removed successfully', users: table.user });
  } catch (error) {
    console.error('Error removing user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark question as solved (protected)
app.patch('/markquestion', middleware, async (req, res) => {
  try {
    const { questionid, user } = req.body;
    console.log(req.body);

    // Check for missing input
    if (!questionid || !user) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the question by its custom ID
    const question = await Question.findOne({ question_id: questionid });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const userToBe = await User.findOne({ username: user });
    if (!userToBe) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!question.solved_by.includes(userToBe.username)) {
      question.solved_by.push(userToBe.username);
      await question.save();
    }

    res.status(200).json({ message: "✅ Question marked as solved by user", question });

  } catch (error) {
    res.status(500).json({ error: "❌ Server error: " + error.message });
  }
});

// Unmark question as solved (protected)
app.patch('/unmarkquestion', middleware, async (req, res) => {
  try {
    const { questionid, user } = req.body;

    // Validate input
    if (!questionid || !user) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the question
    const question = await Question.findOne({ question_id: questionid });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Find the user
    const userToBe = await User.findOne({ username: user });
    if (!userToBe) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove the user from the solved_by array if present
    const index = question.solved_by.indexOf(userToBe.username);
    if (index !== -1) {
      question.solved_by.splice(index, 1);
      await question.save();
    }

    res.status(200).json({ message: "✅ Question unmarked for user", question });

  } catch (error) {
    res.status(500).json({ error: "❌ Server error: " + error.message });
  }
});

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
