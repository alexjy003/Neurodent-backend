const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const path = require('path');

// Load environment variables with explicit path
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Debug environment variables
console.log('🔍 Environment check:');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'UNDEFINED');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL ? 'SET' : 'UNDEFINED');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'SET' : 'UNDEFINED');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const doctorRoutes = require('./routes/doctors');
const pharmacistRoutes = require('./routes/pharmacists');
const pharmacistAuthRoutes = require('./routes/pharmacistAuth');
const scheduleRoutes = require('./routes/schedules');
const appointmentRoutes = require('./routes/appointments');
const medicineRoutes = require('./routes/medicines');
const { verifyCloudinaryConfig } = require('./config/cloudinary');

// Initialize passport configuration
require('./config/passport');

const app = express();

// Middleware
app.use(cors({
  origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(url => url.trim()),
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
app.use('/api/schedules', scheduleRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medicines', medicineRoutes);

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