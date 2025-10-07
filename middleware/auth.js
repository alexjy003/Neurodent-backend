const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const patient = await Patient.findById(decoded.patientId).select('-password');
    
    if (!patient) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    // Set both req.patient and req.user for compatibility
    req.patient = patient;
    req.user = {
      patientId: patient._id,
      ...decoded
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;