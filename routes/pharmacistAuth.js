const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Pharmacist = require('../models/Pharmacist');

// Pharmacist login
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find pharmacist by email
    const pharmacist = await Pharmacist.findOne({ email });
    if (!pharmacist) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if pharmacist is active
    if (pharmacist.availability !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'Your account is currently inactive. Please contact your administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, pharmacist.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    pharmacist.lastLogin = new Date();
    await pharmacist.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: pharmacist._id, 
        email: pharmacist.email,
        role: 'pharmacist',
        firstName: pharmacist.firstName,
        lastName: pharmacist.lastName
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' } // 8 hour token for work shift
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        pharmacist: {
          id: pharmacist._id,
          firstName: pharmacist.firstName,
          lastName: pharmacist.lastName,
          name: pharmacist.name,
          email: pharmacist.email,
          phone: pharmacist.phone,
          department: pharmacist.department,
          specialization: pharmacist.specialization,
          shift: pharmacist.shift,
          profileImage: pharmacist.profileImage,
          availability: pharmacist.availability
        }
      }
    });

  } catch (error) {
    console.error('Pharmacist login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// Get current pharmacist profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const pharmacist = await Pharmacist.findById(decoded.id).select('-password');

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacist not found'
      });
    }

    if (pharmacist.availability !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    res.json({
      success: true,
      data: {
        pharmacist: {
          id: pharmacist._id,
          firstName: pharmacist.firstName,
          lastName: pharmacist.lastName,
          name: pharmacist.name,
          email: pharmacist.email,
          phone: pharmacist.phone,
          department: pharmacist.department,
          specialization: pharmacist.specialization,
          shift: pharmacist.shift,
          profileImage: pharmacist.profileImage,
          availability: pharmacist.availability
        }
      }
    });

  } catch (error) {
    console.error('Get pharmacist profile error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

module.exports = router;
