const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');

const authenticatePatient = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.replace('Bearer ', '') 
      : null;
    
    console.log('Patient auth - Token received:', token ? 'Yes' : 'No');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Patient auth - Token decoded:', { patientId: decoded.patientId });
    
    // Find patient in database
    const patient = await Patient.findById(decoded.patientId).select('-password');
    
    if (!patient) {
      console.log('Patient auth - Patient not found for ID:', decoded.patientId);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. Patient not found.' 
      });
    }

    console.log('Patient auth - Patient found:', patient.email);
    
    // Attach patient to request
    req.user = patient;
    next();
    
  } catch (error) {
    console.error('Patient authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token format.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token has expired.' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      message: 'Token verification failed.' 
    });
  }
};

module.exports = authenticatePatient;