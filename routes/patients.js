const express = require('express');
const { validationResult } = require('express-validator');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');
const doctorAuth = require('../middleware/doctorAuth');
const { uploadSingle, handleUploadResponse } = require('../middleware/cloudinaryUpload');
const { cloudinary } = require('../config/cloudinary');

const router = express.Router();

// Get all patients (for doctors)
router.get('/', doctorAuth, async (req, res) => {
  try {
    console.log('🔍 Fetching all patients for doctor...');
    
    const patients = await Patient.find({})
      .select('-password -__v')
      .sort({ createdAt: -1 });
    
    console.log('✅ Successfully fetched patients:', patients.length);
    
    res.json({
      success: true,
      data: patients,
      message: `Found ${patients.length} patients`
    });
  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
      error: error.message
    });
  }
});

// Get single patient by ID (for doctors)
router.get('/:id', doctorAuth, async (req, res) => {
  try {
    console.log('🔍 Fetching patient by ID:', req.params.id);
    
    const patient = await Patient.findById(req.params.id)
      .select('-password -__v');
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }
    
    console.log('✅ Successfully fetched patient:', patient.firstName, patient.lastName);
    
    res.json({
      success: true,
      data: patient,
      message: 'Patient found successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient',
      error: error.message
    });
  }
});

// Upload patient profile image
router.post('/profile/image', auth, uploadSingle('profileImage'), handleUploadResponse, async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Delete old profile image from Cloudinary if it exists
    if (patient.profileImage && patient.profileImage.publicId) {
      try {
        await cloudinary.uploader.destroy(patient.profileImage.publicId);
        console.log('🗑️ Old profile image deleted from Cloudinary');
      } catch (error) {
        console.error('❌ Error deleting old profile image:', error);
        // Continue anyway, don't fail the upload
      }
    }

    // Add new image data if uploaded
    if (req.file) {
      console.log('📸 Profile image uploaded:', {
        path: req.file.path,
        filename: req.file.filename,
        originalname: req.file.originalname
      });
      
      patient.profileImage = {
        url: req.file.path,
        publicId: req.file.filename
      };
      
      await patient.save();

      console.log('✅ Profile image updated successfully');

      res.json({
        success: true,
        message: 'Profile image updated successfully',
        profileImage: patient.profileImage
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

  } catch (error) {
    console.error('❌ Error uploading profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading image',
      error: error.message
    });
  }
});

// Delete patient profile image
router.delete('/profile/image', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId);
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Delete image from Cloudinary if it exists
    if (patient.profileImage && patient.profileImage.publicId) {
      try {
        await cloudinary.uploader.destroy(patient.profileImage.publicId);
        console.log('🗑️ Profile image deleted from Cloudinary');
      } catch (error) {
        console.error('❌ Error deleting profile image from Cloudinary:', error);
      }
    }

    // Remove image data from patient record
    patient.profileImage = undefined;
    await patient.save();

    res.json({
      success: true,
      message: 'Profile image deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting image',
      error: error.message
    });
  }
});

module.exports = router;