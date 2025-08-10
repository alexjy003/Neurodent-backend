const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

const doctorAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const doctor = await Doctor.findById(decoded.doctorId).select('-password');
    
    if (!doctor) {
      return res.status(401).json({ 
        success: false,
        message: 'Token is not valid' 
      });
    }

    // Check if doctor account is still active
    if (doctor.availability !== 'active') {
      return res.status(403).json({ 
        success: false,
        message: 'Account has been deactivated' 
      });
    }

    req.doctor = doctor;
    next();
  } catch (error) {
    console.error('Doctor auth middleware error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Token is not valid' 
    });
  }
};

module.exports = doctorAuth;
