const express = require('express');
const router = express.Router();

// You don't need to require your Mongoose model anymore.

router.get('/email/:username', async (req, res) => {
  // Access the MongoDB client from app.locals
  const db = req.app.locals.db;

  try {
    // Access your "users" collection and find one document based on username
    const user = await db.collection('users').findOne({ username: req.params.username });

    if (user) {
      res.json({ email: user.email });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
