const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

const doctorAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔍 Doctor Auth Debug:');
    console.log('- Authorization header:', req.header('Authorization'));
    console.log('- Extracted token:', token ? token.substring(0, 20) + '...' : 'No token');
    
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔑 Decoded token:', decoded);
    
    const doctor = await Doctor.findById(decoded.doctorId).select('-password');
    console.log('👨‍⚕️ Found doctor:', doctor ? `${doctor.firstName} ${doctor.lastName} (${doctor._id})` : 'No doctor found');
    
    if (!doctor) {
      console.log('❌ Doctor not found for ID:', decoded.doctorId);
      return res.status(401).json({ 
        success: false,
        message: 'Token is not valid' 
      });
    }

    // Check if doctor account is still active
    if (doctor.availability !== 'active') {
      console.log('❌ Doctor account inactive:', doctor.availability);
      return res.status(403).json({ 
        success: false,
        message: 'Account has been deactivated' 
      });
    }

    console.log('✅ Doctor authentication successful');
    req.doctor = doctor;
    next();
  } catch (error) {
    console.error('❌ Doctor auth middleware error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Token is not valid' 
    });
  }
};

module.exports = doctorAuth;
