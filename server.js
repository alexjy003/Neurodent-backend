const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const doctorRoutes = require('./routes/doctors');
const pharmacistRoutes = require('./routes/pharmacists');
const pharmacistAuthRoutes = require('./routes/pharmacistAuth');
const { verifyCloudinaryConfig } = require('./config/cloudinary');
require('./config/passport');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL.split(',').map(url => url.trim()),
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/pharmacists', pharmacistRoutes);
app.use('/api/pharmacist-auth', pharmacistAuthRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Verify Cloudinary configuration
verifyCloudinaryConfig();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});