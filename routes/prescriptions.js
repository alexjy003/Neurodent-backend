const express = require('express');
const mongoose = require('mongoose');
const { validationResult, body } = require('express-validator');
const Prescription = require('../models/Prescription');
const doctorAuth = require('../middleware/doctorAuth');
const grokAIService = require('../services/grokAIService');
const PDFService = require('../services/pdfService');

const router = express.Router();

// Validation rules for creating prescription
const prescriptionValidation = [
  body('appointmentId')
    .notEmpty()
    .withMessage('Appointment ID is required'),
    // Removed strict MongoDB ObjectId validation since appointment IDs might not be ObjectIds
  
  body('patientId')
    .optional()
    .custom((value) => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid patient ID format');
      }
      return true;
    }),
  
  body('patientName')
    .trim()
    .notEmpty()
    .withMessage('Patient name is required'),
  
  body('diagnosis')
    .trim()
    .notEmpty()
    .withMessage('Diagnosis is required')
    .isLength({ max: 500 })
    .withMessage('Diagnosis cannot exceed 500 characters'),
  
  body('medications')
    .isArray({ min: 1 })
    .withMessage('At least one medication is required'),
  
  body('medications.*.name')
    .trim()
    .notEmpty()
    .withMessage('Medication name is required'),
  
  body('medications.*.dosage')
    .trim()
    .notEmpty()
    .withMessage('Medication dosage is required'),
  
  body('medications.*.duration')
    .trim()
    .notEmpty()
    .withMessage('Medication duration is required'),
  
  body('generalInstructions')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('General instructions cannot exceed 1000 characters'),
  
  body('symptoms')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Symptoms cannot exceed 1000 characters'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// POST /api/prescriptions/generate-ai - Generate AI prescription
router.post('/generate-ai', doctorAuth, [
  body('symptoms')
    .trim()
    .notEmpty()
    .withMessage('Patient symptoms are required'),
  
  body('patientName')
    .trim()
    .notEmpty()
    .withMessage('Patient name is required'),
  
  body('patientAge')
    .optional()
    .isInt({ min: 0, max: 150 })
    .withMessage('Patient age must be a valid number')
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

    const { symptoms, patientName, patientAge, medicalHistory, allergies } = req.body;

    console.log('🤖 Generating AI prescription for:', {
      patientName,
      symptoms: symptoms.substring(0, 50) + '...',
      patientAge
    });

    // Generate AI prescription using Grok
    const aiResult = await grokAIService.generatePrescription({
      symptoms,
      patientName,
      patientAge,
      medicalHistory,
      allergies
    });

    if (!aiResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate AI prescription',
        error: aiResult.error
      });
    }

    // Calculate follow-up date
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + aiResult.data.followUpDays);

    const prescriptionData = {
      diagnosis: aiResult.data.diagnosis,
      medications: aiResult.data.medications,
      generalInstructions: aiResult.data.generalInstructions,
      followUpDate: followUpDate.toISOString().split('T')[0],
      isAIGenerated: true,
      aiModel: aiResult.aiModel,
      warnings: aiResult.data.warnings,
      homeRemedies: aiResult.data.homeRemedies
    };

    res.json({
      success: true,
      message: 'AI prescription generated successfully',
      data: prescriptionData,
      meta: {
        aiModel: aiResult.aiModel,
        tokensUsed: aiResult.tokensUsed,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error generating AI prescription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI prescription',
      error: error.message
    });
  }
});

// POST /api/prescriptions - Create a new prescription
router.post('/', doctorAuth, prescriptionValidation, async (req, res) => {
  try {
    console.log('📥 Received prescription request:', {
      appointmentId: req.body.appointmentId,
      patientName: req.body.patientName,
      diagnosis: req.body.diagnosis,
      medicationCount: req.body.medications?.length,
      doctorId: req.doctor._id
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Clean up the data before saving
    const prescriptionData = {
      appointmentId: req.body.appointmentId,
      patientName: req.body.patientName.trim(),
      diagnosis: req.body.diagnosis.trim(),
      medications: req.body.medications.map(med => ({
        name: med.name.trim(),
        dosage: med.dosage.trim(),
        duration: med.duration.trim(),
        instructions: med.instructions ? med.instructions.trim() : '',
        frequency: med.frequency ? med.frequency.trim() : ''
      })),
      doctorId: req.doctor._id,
      generalInstructions: req.body.generalInstructions ? req.body.generalInstructions.trim() : '',
      symptoms: req.body.symptoms ? req.body.symptoms.trim() : '',
      notes: req.body.notes ? req.body.notes.trim() : '',
      isAIGenerated: req.body.isAIGenerated || false,
      status: 'active',
      prescriptionDate: new Date()
    };

    // Add optional fields if provided
    if (req.body.patientId && mongoose.Types.ObjectId.isValid(req.body.patientId)) {
      prescriptionData.patientId = req.body.patientId;
    }
    
    if (req.body.patientAge && !isNaN(req.body.patientAge)) {
      prescriptionData.patientAge = parseInt(req.body.patientAge);
    }
    
    if (req.body.followUpDate) {
      prescriptionData.followUpDate = new Date(req.body.followUpDate);
    }
    
    if (req.body.aiModel) {
      prescriptionData.aiModel = req.body.aiModel;
    }

    console.log('💾 Creating prescription with data:', prescriptionData);

    const prescription = new Prescription(prescriptionData);
    const savedPrescription = await prescription.save();

    console.log('✅ Prescription saved successfully with ID:', savedPrescription._id);

    // Try to populate the saved prescription, but don't fail if population fails
    let populatedPrescription;
    try {
      populatedPrescription = await Prescription.findById(savedPrescription._id)
        .populate('doctorId', 'firstName lastName specialization');
      
      // Only populate patientId if it's a valid ObjectId
      if (savedPrescription.patientId && mongoose.Types.ObjectId.isValid(savedPrescription.patientId)) {
        populatedPrescription = await Prescription.findById(savedPrescription._id)
          .populate('patientId', 'firstName lastName age')
          .populate('doctorId', 'firstName lastName specialization');
      }
    } catch (populateError) {
      console.log('⚠️ Population failed, returning unpopulated prescription:', populateError.message);
      populatedPrescription = savedPrescription;
    }

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      data: populatedPrescription
    });

  } catch (error) {
    console.error('❌ Error creating prescription:', error);
    console.error('Error stack:', error.stack);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Prescription already exists for this appointment'
      });
    }

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      console.log('❌ Mongoose validation errors:', validationErrors);
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
});

// GET /api/prescriptions/doctor/my-prescriptions - Get doctor's prescriptions
router.get('/doctor/my-prescriptions', doctorAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { doctorId: req.doctor._id };

    // Filter by status
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.prescriptionDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // Search by patient name
    if (req.query.search) {
      query.patientName = { $regex: req.query.search, $options: 'i' };
    }

    const prescriptions = await Prescription.find(query)
      .populate('appointmentId', 'date timeRange')
      .populate('patientId', 'firstName lastName age profilePicture profileImage')
      .sort({ prescriptionDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Prescription.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      prescriptions,
      pagination: {
        currentPage: page,
        totalPages,
        totalPrescriptions: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Error fetching prescriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

// GET /api/prescriptions/patient/:patientId - Get patient's prescriptions
router.get('/patient/:patientId', doctorAuth, async (req, res) => {
  try {
    const prescriptions = await Prescription.findByPatient(req.params.patientId);

    res.json({
      success: true,
      prescriptions
    });

  } catch (error) {
    console.error('❌ Error fetching patient prescriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient prescriptions',
      error: error.message
    });
  }
});

// GET /api/prescriptions/:id - Get specific prescription
router.get('/:id', doctorAuth, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('appointmentId', 'date timeRange symptoms')
      .populate('patientId', 'firstName lastName age medicalHistory')
      .populate('doctorId', 'firstName lastName specialization');

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Check if doctor owns this prescription
    if (prescription.doctorId._id.toString() !== req.doctor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: prescription
    });

  } catch (error) {
    console.error('❌ Error fetching prescription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescription',
      error: error.message
    });
  }
});

// PATCH /api/prescriptions/:id - Update prescription
router.patch('/:id', doctorAuth, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Check if doctor owns this prescription
    if (prescription.doctorId.toString() !== req.doctor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const allowedUpdates = ['diagnosis', 'medications', 'generalInstructions', 'followUpDate', 'status', 'notes'];
    const updates = {};

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    Object.assign(prescription, updates);
    await prescription.save();

    const updatedPrescription = await Prescription.findById(prescription._id)
      .populate('appointmentId', 'date timeRange')
      .populate('patientId', 'firstName lastName age')
      .populate('doctorId', 'firstName lastName specialization');

    res.json({
      success: true,
      message: 'Prescription updated successfully',
      data: updatedPrescription
    });

  } catch (error) {
    console.error('❌ Error updating prescription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prescription',
      error: error.message
    });
  }
});

// DELETE /api/prescriptions/:id - Delete prescription
router.delete('/:id', doctorAuth, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Check if doctor owns this prescription
    if (prescription.doctorId.toString() !== req.doctor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await Prescription.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Prescription deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting prescription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete prescription',
      error: error.message
    });
  }
});

// GET /api/prescriptions/:id/pdf - Download prescription as PDF
router.get('/:id/pdf', doctorAuth, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('patientId', 'firstName lastName age')
      .populate('doctorId', 'firstName lastName specialization specialty');

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Verify the prescription belongs to the requesting doctor
    if (prescription.doctorId._id.toString() !== req.doctor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    console.log('📄 Generating PDF for prescription:', prescription._id);

    // Generate professional PDF using PDFService
    const pdfBuffer = await PDFService.generatePrescriptionPDF(
      prescription, 
      prescription.doctorId, 
      prescription.patientId
    );

    // Set proper PDF headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Send the PDF buffer
    res.send(pdfBuffer);

    console.log('✅ PDF generated and sent successfully');

  } catch (error) {
    console.error('❌ Error generating prescription PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate prescription PDF',
      error: error.message
    });
  }
});

module.exports = router;