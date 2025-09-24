// Test route for Grok AI service without authentication
const express = require('express');
const router = express.Router();
const grokAIService = require('../services/grokAIService');

// Test route - no authentication required
router.post('/test-ai', async (req, res) => {
  try {
    console.log('🧪 Test AI endpoint called with:', req.body);
    
    const { symptoms, medicalHistory, currentMedications } = req.body;
    
    if (!symptoms) {
      return res.status(400).json({
        success: false,
        message: 'Symptoms are required'
      });
    }
    
    const result = await grokAIService.generatePrescription({
      symptoms,
      medicalHistory: medicalHistory || 'No significant medical history',
      currentMedications: currentMedications || 'None'
    });
    
    console.log('🎯 AI Service Result:', result);
    
    res.json({
      success: true,
      message: 'AI prescription generated successfully',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Test AI endpoint error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate AI prescription',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;