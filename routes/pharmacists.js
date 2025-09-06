const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Pharmacist = require('../models/Pharmacist');
const { uploadSingle, handleUploadResponse } = require('../middleware/cloudinaryUpload');
const { deleteImage } = require('../config/cloudinary');

// Get all pharmacists
router.get('/', async (req, res) => {
  try {
    const pharmacists = await Pharmacist.find().select('-password').sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: {
        pharmacists,
        total: pharmacists.length
      }
    });
  } catch (error) {
    console.error('Error fetching pharmacists:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pharmacists',
      error: error.message
    });
  }
});

// Get pharmacist by ID
router.get('/:id', async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findById(req.params.id).select('-password');
    
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacist not found'
      });
    }
    
    res.json({
      success: true,
      data: { pharmacist }
    });
  } catch (error) {
    console.error('Error fetching pharmacist:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pharmacist',
      error: error.message
    });
  }
});

// Add new pharmacist
router.post('/', uploadSingle('profileImage'), handleUploadResponse, [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('phone')
    .matches(/^\d{10}$/)
    .withMessage('Phone number must be exactly 10 digits'),
  body('dateOfBirth')
    .isISO8601()
    .withMessage('Valid date of birth is required')
    .custom((value) => {
      const today = new Date();
      const birthDate = new Date(value);
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18 || age > 65) {
        throw new Error('Age must be between 18 and 65 years');
      }
      return true;
    }),
  body('gender')
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Valid gender is required'),
  body('shift')
    .isIn(['Morning', 'Evening', 'Night', 'Full-time'])
    .withMessage('Valid shift is required'),
  body('specialization')
    .trim()
    .notEmpty()
    .withMessage('Specialization is required')
    .isLength({ max: 100 })
    .withMessage('Specialization cannot exceed 100 characters'),
  body('availability')
    .optional()
    .isIn(['Active', 'Inactive'])
    .withMessage('Valid availability status is required')
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

    const {
      firstName, lastName, email, password, phone, dateOfBirth,
      gender, shift, specialization, availability
    } = req.body;

    // Check if pharmacist already exists
    const existingPharmacist = await Pharmacist.findByEmail(email);
    if (existingPharmacist) {
      return res.status(400).json({
        success: false,
        message: 'Pharmacist with this email already exists'
      });
    }

    // Check for duplicate phone number
    const existingPhone = await Pharmacist.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'Pharmacist with this phone number already exists'
      });
    }

    // Create pharmacist data
    const pharmacistData = {
      firstName,
      lastName,
      email,
      password,
      phone,
      dateOfBirth,
      gender,
      shift,
      department: 'Pharmacy',
      specialization,
      availability: availability || 'Active'
    };

    // Add profile image if uploaded
    if (req.uploadResult && req.uploadResult.success) {
      pharmacistData.profileImage = req.uploadResult.url;
    }

    const pharmacist = new Pharmacist(pharmacistData);
    await pharmacist.save();

    res.status(201).json({
      success: true,
      message: 'Pharmacist added successfully',
      data: {
        pharmacist: {
          id: pharmacist._id,
          firstName: pharmacist.firstName,
          lastName: pharmacist.lastName,
          name: pharmacist.name,
          email: pharmacist.email,
          phone: pharmacist.phone,
          dateOfBirth: pharmacist.dateOfBirth,
          gender: pharmacist.gender,
          shift: pharmacist.shift,
          department: pharmacist.department,
          specialization: pharmacist.specialization,
          profileImage: pharmacist.profileImage,
          availability: pharmacist.availability,
          createdAt: pharmacist.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Error adding pharmacist:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding pharmacist',
      error: error.message
    });
  }
});

// Update pharmacist
router.put('/:id', uploadSingle('profileImage'), handleUploadResponse, [
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty')
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty')
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('phone')
    .optional()
    .matches(/^\d{10}$/)
    .withMessage('Phone number must be exactly 10 digits'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Valid date of birth is required')
    .custom((value) => {
      const today = new Date();
      const birthDate = new Date(value);
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18 || age > 65) {
        throw new Error('Age must be between 18 and 65 years');
      }
      return true;
    }),
  body('gender')
    .optional()
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Valid gender is required'),
  body('shift')
    .optional()
    .isIn(['Morning', 'Evening', 'Night', 'Full-time'])
    .withMessage('Valid shift is required'),
  body('specialization')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Specialization cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Specialization cannot exceed 100 characters'),
  body('availability')
    .optional()
    .isIn(['Active', 'Inactive'])
    .withMessage('Valid availability status is required')
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

    const pharmacist = await Pharmacist.findById(req.params.id);
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacist not found'
      });
    }

    // Check for duplicate email (excluding current pharmacist)
    if (req.body.email && req.body.email !== pharmacist.email) {
      const existingEmail = await Pharmacist.findOne({ 
        email: req.body.email.toLowerCase(),
        _id: { $ne: pharmacist._id }
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Another pharmacist with this email already exists'
        });
      }
    }

    // Check for duplicate phone (excluding current pharmacist)
    if (req.body.phone && req.body.phone !== pharmacist.phone) {
      const existingPhone = await Pharmacist.findOne({ 
        phone: req.body.phone,
        _id: { $ne: pharmacist._id }
      });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: 'Another pharmacist with this phone number already exists'
        });
      }
    }

    // Update fields
    const updateFields = [
      'firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 
      'gender', 'shift', 'specialization', 'availability'
    ];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        pharmacist[field] = req.body[field];
      }
    });

    // Handle password update
    if (req.body.password) {
      pharmacist.password = req.body.password;
    }

    // Handle profile image update
    if (req.uploadResult && req.uploadResult.success) {
      // Delete old image if exists
      if (pharmacist.profileImage) {
        try {
          const publicId = pharmacist.profileImage.split('/').pop().split('.')[0];
          await deleteImage(`neurodent/${publicId}`);
        } catch (deleteError) {
          console.error('Error deleting old image:', deleteError);
        }
      }
      pharmacist.profileImage = req.uploadResult.url;
    }

    pharmacist.updatedAt = new Date();
    await pharmacist.save();

    res.json({
      success: true,
      message: 'Pharmacist updated successfully',
      data: { 
        pharmacist: {
          id: pharmacist._id,
          firstName: pharmacist.firstName,
          lastName: pharmacist.lastName,
          name: pharmacist.name,
          email: pharmacist.email,
          phone: pharmacist.phone,
          dateOfBirth: pharmacist.dateOfBirth,
          gender: pharmacist.gender,
          shift: pharmacist.shift,
          department: pharmacist.department,
          specialization: pharmacist.specialization,
          profileImage: pharmacist.profileImage,
          availability: pharmacist.availability,
          updatedAt: pharmacist.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error updating pharmacist:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating pharmacist',
      error: error.message
    });
  }
});

// Delete pharmacist
router.delete('/:id', async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findById(req.params.id);
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacist not found'
      });
    }

    // Delete profile image if exists
    if (pharmacist.profileImage) {
      try {
        const publicId = pharmacist.profileImage.split('/').pop().split('.')[0];
        await deleteImage(`neurodent/${publicId}`);
      } catch (deleteError) {
        console.error('Error deleting image:', deleteError);
      }
    }

    await Pharmacist.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Pharmacist deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting pharmacist:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting pharmacist',
      error: error.message
    });
  }
});

// Toggle pharmacist availability
router.patch('/:id/availability', async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findById(req.params.id);
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacist not found'
      });
    }

    pharmacist.availability = pharmacist.availability === 'Active' ? 'Inactive' : 'Active';
    pharmacist.updatedAt = new Date();
    await pharmacist.save();

    res.json({
      success: true,
      message: `Pharmacist ${pharmacist.availability === 'Active' ? 'activated' : 'deactivated'} successfully`,
      data: { pharmacist }
    });
  } catch (error) {
    console.error('Error updating pharmacist availability:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating pharmacist availability',
      error: error.message
    });
  }
});

// Get pharmacist statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalPharmacists = await Pharmacist.countDocuments();
    const activePharmacists = await Pharmacist.countDocuments({ availability: 'Active' });
    const inactivePharmacists = await Pharmacist.countDocuments({ availability: 'Inactive' });
    
    // Pharmacists by shift
    const shiftDistribution = await Pharmacist.aggregate([
      {
        $group: {
          _id: '$shift',
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent hires (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentHires = await Pharmacist.countDocuments({
      hireDate: { $gte: thirtyDaysAgo }
    });

    res.json({
      success: true,
      data: {
        total: totalPharmacists,
        active: activePharmacists,
        inactive: inactivePharmacists,
        recentHires,
        shiftDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching pharmacist statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics',
      error: error.message
    });
  }
});

module.exports = router;
