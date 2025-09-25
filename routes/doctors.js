const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Doctor = require('../models/Doctor');
const Schedule = require('../models/Schedule');
const Appointment = require('../models/Appointment');
const { uploadSingle, handleUploadResponse } = require('../middleware/cloudinaryUpload');
const { deleteImage } = require('../config/cloudinary');
const emailService = require('../services/emailService');
const { generateDoctorPassword } = require('../utils/passwordGenerator');

// Helper function to get next available slot for a doctor
const getNextAvailableSlot = async (doctorId) => {
  try {
    // Start from tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check next 14 days
    for (let i = 0; i < 14; i++) {
      const checkDate = new Date(tomorrow);
      checkDate.setDate(tomorrow.getDate() + i);
      
      const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      // Find doctor's schedule for this date
      const schedules = await Schedule.find({
        doctorId,
        status: 'active'
      }).sort({ weekStartDate: -1 });
      
      let doctorSchedule = null;
      
      for (const schedule of schedules) {
        const weekStart = new Date(schedule.weekStartDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const checkDateOnly = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
        const weekStartOnly = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        const weekEndOnly = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
        
        if (checkDateOnly >= weekStartOnly && checkDateOnly <= weekEndOnly) {
          doctorSchedule = schedule;
          break;
        }
      }
      
      if (doctorSchedule && doctorSchedule.weeklySchedule[dayName] && doctorSchedule.weeklySchedule[dayName].length > 0) {
        const daySlots = doctorSchedule.weeklySchedule[dayName];
        
        // Get existing appointments for this date
        const existingAppointments = await Appointment.getDoctorAppointments(doctorId, checkDate);
        
        // Check each slot for availability
        for (const slot of daySlots) {
          if (slot.type === 'Day Off') continue;
          
          // Convert times to 24-hour format for comparison
          const startTime24 = slot.startTime.includes(' ') ? convertTo24Hour(slot.startTime) : slot.startTime;
          const endTime24 = slot.endTime.includes(' ') ? convertTo24Hour(slot.endTime) : slot.endTime;
          
          // Check if this slot is already booked
          const isBooked = existingAppointments.some(appointment => 
            appointment.startTime === startTime24 && appointment.endTime === endTime24
          );
          
          if (!isBooked) {
            // Found an available slot
            const formattedDate = checkDate.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: '2-digit', 
              day: '2-digit' 
            });
            const formattedTime = convertTo12Hour(startTime24);
            return `${formattedDate} ${formattedTime}`;
          }
        }
      }
    }
    
    return 'Not available';
  } catch (error) {
    console.error('Error getting next available slot:', error);
    return 'Not available';
  }
};

// Helper function to convert 24-hour time to 12-hour format
const convertTo12Hour = (time24h) => {
  const [hours, minutes] = time24h.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${period}`;
};

// Helper function to convert 12-hour time to 24-hour format
const convertTo24Hour = (time12h) => {
  if (!time12h.includes(' ')) {
    return time12h;
  }
  
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  
  hours = parseInt(hours, 10);
  
  if (modifier === 'AM') {
    if (hours === 12) {
      hours = 0;
    }
  } else { // PM
    if (hours !== 12) {
      hours += 12;
    }
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

// Get all doctors
router.get('/', async (req, res) => {
  try {
    const doctors = await Doctor.find().select('-password').sort({ createdAt: -1 });
    
    // Add next available slot for each doctor
    const doctorsWithSlots = await Promise.all(
      doctors.map(async (doctor) => {
        const nextSlot = await getNextAvailableSlot(doctor._id);
        return {
          ...doctor.toObject(),
          nextAvailableSlot: nextSlot
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        doctors: doctorsWithSlots,
        total: doctorsWithSlots.length
      }
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching doctors',
      error: error.message
    });
  }
});

// Get doctor by ID
router.get('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select('-password');
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    res.json({
      success: true,
      data: { doctor }
    });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching doctor',
      error: error.message
    });
  }
});

// Add new doctor
router.post('/', uploadSingle('profileImage'), handleUploadResponse, [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Valid gender is required'),
  body('specialization').trim().notEmpty().withMessage('Specialization is required'),
  body('experience').trim().notEmpty().withMessage('Experience is required'),
  body('position').isIn(['Junior Doctor', 'Senior Doctor', 'Specialist', 'Consultant', 'Head of Department']).withMessage('Valid position is required')
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
      firstName, lastName, email, phone, dateOfBirth,
      gender, specialization, experience, position, bio
    } = req.body;

    // Check if doctor already exists
    const existingDoctor = await Doctor.findByEmail(email);
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: 'Doctor with this email already exists'
      });
    }

    // Generate secure password for the doctor
    const generatedPassword = generateDoctorPassword();

    // Try to send email with credentials first
    const emailResult = await emailService.sendDoctorCredentialsEmail(
      email, 
      `${firstName} ${lastName}`, 
      generatedPassword
    );

    // If email sending fails, don't create the doctor account
    if (!emailResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to send credentials email. Please verify the email address exists and try again.',
        error: emailResult.error
      });
    }

    // Create doctor data with generated password
    const doctorData = {
      firstName,
      lastName,
      email,
      password: generatedPassword, // This will be hashed by the Doctor schema pre-save middleware
      phone,
      dateOfBirth,
      gender,
      specialization,
      experience,
      position,
      bio: bio || ''
    };

    // Add profile image if uploaded
    if (req.uploadResult && req.uploadResult.success) {
      doctorData.profileImage = req.uploadResult.url;
    }

    const doctor = new Doctor(doctorData);
    await doctor.save();

    // Log success message for admin
    console.log(`📧 Doctor credentials sent successfully to: ${email}`);
    if (emailResult.previewUrl) {
      console.log(`🔗 Email preview URL: ${emailResult.previewUrl}`);
    }

    res.status(201).json({
      success: true,
      message: 'Doctor added successfully! Login credentials have been sent to the provided email address.',
      data: {
        doctor: {
          id: doctor._id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          phone: doctor.phone,
          specialization: doctor.specialization,
          position: doctor.position,
          profileImage: doctor.profileImage,
          availability: doctor.availability
        },
        emailSent: true,
        emailPreviewUrl: emailResult.previewUrl // For development/testing
      }
    });

  } catch (error) {
    console.error('Error adding doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding doctor',
      error: error.message
    });
  }
});

// Update doctor
router.put('/:id', uploadSingle('profileImage'), handleUploadResponse, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('dateOfBirth').optional().isISO8601().withMessage('Valid date of birth is required'),
  body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Valid gender is required'),
  body('specialization').optional().trim().notEmpty().withMessage('Specialization cannot be empty'),
  body('experience').optional().trim().notEmpty().withMessage('Experience cannot be empty'),
  body('position').optional().isIn(['Junior Doctor', 'Senior Doctor', 'Specialist', 'Consultant', 'Head of Department']).withMessage('Valid position is required'),
  body('availability').optional().isIn(['active', 'inactive']).withMessage('Valid availability status is required')
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

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Update fields
    const updateFields = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender', 'specialization', 'experience', 'position', 'bio', 'availability'];
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        doctor[field] = req.body[field];
      }
    });

    // Handle profile image update
    if (req.uploadResult && req.uploadResult.success) {
      // Delete old image if exists
      if (doctor.profileImage) {
        const publicId = doctor.profileImage.split('/').pop().split('.')[0];
        await deleteImage(`neurodent/${publicId}`);
      }
      doctor.profileImage = req.uploadResult.url;
    }

    doctor.updatedAt = new Date();
    await doctor.save();

    res.json({
      success: true,
      message: 'Doctor updated successfully',
      data: { doctor }
    });
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating doctor',
      error: error.message
    });
  }
});

// Delete doctor
router.delete('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Delete profile image if exists
    if (doctor.profileImage) {
      const publicId = doctor.profileImage.split('/').pop().split('.')[0];
      await deleteImage(`neurodent/${publicId}`);
    }

    await Doctor.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Doctor deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting doctor',
      error: error.message
    });
  }
});

// Toggle doctor availability
router.patch('/:id/availability', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    doctor.availability = doctor.availability === 'active' ? 'inactive' : 'active';
    doctor.updatedAt = new Date();
    await doctor.save();

    res.json({
      success: true,
      message: `Doctor ${doctor.availability === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: { doctor }
    });
  } catch (error) {
    console.error('Error updating doctor availability:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating doctor availability',
      error: error.message
    });
  }
});

module.exports = router;
