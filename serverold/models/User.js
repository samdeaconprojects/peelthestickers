const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  // ... other fields like password, etc.
});

const User = mongoose.model('User', userSchema);

module.exports = User;
