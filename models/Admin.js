const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  firstName: {
    type: String,
    default: 'Admin'
  },
  lastName: {
    type: String,
    default: 'User'
  },
  email: {
    type: String,
    default: 'admin@gmail.com'
  },
  role: {
    type: String,
    default: 'admin'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Admin', adminSchema);