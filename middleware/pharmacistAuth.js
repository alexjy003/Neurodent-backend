const jwt = require('jsonwebtoken');
const Pharmacist = require('../models/Pharmacist');

const pharmacistAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pharmacist = await Pharmacist.findById(decoded.pharmacistId).select('-password');
    
    if (!pharmacist) {
      return res.status(401).json({ 
        success: false,
        message: 'Token is not valid' 
      });
    }

    // Check if pharmacist account is still active
    if (pharmacist.availability !== 'Active') {
      return res.status(403).json({ 
        success: false,
        message: 'Account has been deactivated' 
      });
    }

    req.pharmacist = pharmacist;
    next();
  } catch (error) {
    console.error('Pharmacist auth middleware error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Token is not valid' 
    });
  }
};

module.exports = pharmacistAuth;
