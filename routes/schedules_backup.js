const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Schedule = require('../models/Schedule');
const Doctor = require('../models/Doctor');
const jwt = require('jsonwebtoken');

// Middleware to authenticate doctor
const authenticateDoctor = async (req, res, n  body('slots.*.type')
    .notEmpty()
    .withMessage('Schedule type is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Schedule type must be between 1 and 100 characters'), {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('Schedule auth - Token received:', token ? 'Yes' : 'No'); // Debug log
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('Schedule auth - Token decoded:', { doctorId: decoded.doctorId }); // Debug log
    
    // Check if token has doctorId (from doctor login)
    if (!decoded.doctorId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor authentication required.'
      });
    }

    const doctor = await Doctor.findById(decoded.doctorId).select('-password');
    console.log('Schedule auth - Doctor found:', doctor ? doctor.email : 'Not found'); // Debug log
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    if (doctor.availability !== 'active') {
      console.log('Schedule auth - Doctor availability:', doctor.availability); // Debug log
      return res.status(401).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    req.doctor = doctor;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Get current week schedule for authenticated doctor
router.get('/current-week', authenticateDoctor, async (req, res) => {
  try {
    const { weekStartDate, weekEndDate } = Schedule.getCurrentWeekDates();
    
    let schedule = await Schedule.findOne({
      doctorId: req.doctor._id,
      weekStartDate: { $lte: weekStartDate },
      weekEndDate: { $gte: weekEndDate },
      status: 'active'
    });

    // If no schedule exists, create a default one
    if (!schedule) {
      schedule = new Schedule({
        doctorId: req.doctor._id,
        weekStartDate,
        weekEndDate,
        weeklySchedule: {
          monday: [],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: []
        }
      });
      await schedule.save();
    }

    res.json({
      success: true,
      data: {
        schedule: {
          _id: schedule._id,
          weekStartDate: schedule.weekStartDate,
          weekEndDate: schedule.weekEndDate,
          weekRange: schedule.weekRange,
          weeklySchedule: schedule.getFormattedSchedule(),
          totalHours: schedule.totalHours,
          status: schedule.status,
          notes: schedule.notes,
          updatedAt: schedule.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error fetching current week schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching schedule',
      error: error.message
    });
  }
});

// Get schedule for specific week
router.get('/week/:startDate', authenticateDoctor, async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    let schedule = await Schedule.findOne({
      doctorId: req.doctor._id,
      weekStartDate: { $lte: startDate },
      weekEndDate: { $gte: endDate },
      status: 'active'
    });

    if (!schedule) {
      // Create empty schedule for the requested week
      schedule = new Schedule({
        doctorId: req.doctor._id,
        weekStartDate: startDate,
        weekEndDate: endDate,
        weeklySchedule: {
          monday: [],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: []
        }
      });
      await schedule.save();
    }

    res.json({
      success: true,
      data: {
        schedule: {
          _id: schedule._id,
          weekStartDate: schedule.weekStartDate,
          weekEndDate: schedule.weekEndDate,
          weekRange: schedule.weekRange,
          weeklySchedule: schedule.getFormattedSchedule(),
          totalHours: schedule.totalHours,
          status: schedule.status,
          notes: schedule.notes,
          updatedAt: schedule.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error fetching week schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching schedule',
      error: error.message
    });
  }
});

// Update/Create schedule for a specific week
router.put('/week', authenticateDoctor, [
  body('weekStartDate')
    .isISO8601()
    .withMessage('Valid week start date is required'),
  body('weeklySchedule')
    .isObject()
    .withMessage('Weekly schedule must be an object'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
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

    const { weekStartDate, weeklySchedule, notes } = req.body;
    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    // Prevent editing past weeks and current week if it's after 5 PM on any past day
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay() + 1); // Start of current week (Monday)
    currentWeekStart.setHours(0, 0, 0, 0);

    // Check if trying to edit a past week
    if (startDate < currentWeekStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit schedules for past weeks.'
      });
    }

    // For current week, check if trying to edit past days
    if (startDate.getTime() === currentWeekStart.getTime()) {
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const currentHour = today.getHours();
      const currentDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1; // Convert Sunday=0 to be index 6
      
      for (const [dayName, slots] of Object.entries(weeklySchedule)) {
        const dayIndex = dayNames.indexOf(dayName.toLowerCase());
        if (dayIndex === -1) continue;
        
        // Don't allow editing past days
        if (dayIndex < currentDayIndex) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${dayName}'s schedule as it is in the past.`
          });
        }
        
        // Don't allow editing today's schedule if it's after 5 PM
        if (dayIndex === currentDayIndex && currentHour >= 17 && slots.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit today's schedule after 5:00 PM.`
          });
        }
      }
    }

    // Validate schedule slots
    for (const [day, slots] of Object.entries(weeklySchedule)) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({
          success: false,
          message: `Schedule for ${day} must be an array`
        });
      }

      for (const slot of slots) {
        if (!slot.startTime || !slot.endTime || !slot.type) {
          return res.status(400).json({
            success: false,
            message: `Invalid slot data for ${day}`
          });
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Invalid time format for ${day}. Use HH:MM format.`
          });
        }

        // Validate start time is before end time
        const start = new Date(`2000-01-01 ${slot.startTime}`);
        const end = new Date(`2000-01-01 ${slot.endTime}`);
        if (start >= end) {
          return res.status(400).json({
            success: false,
            message: `Start time must be before end time for ${day}`
          });
        }
      }
    }

    let schedule = await Schedule.findOne({
      doctorId: req.doctor._id,
      weekStartDate: { $lte: startDate },
      weekEndDate: { $gte: endDate },
      status: 'active'
    });

    if (schedule) {
      // Update existing schedule
      schedule.weeklySchedule = weeklySchedule;
      schedule.notes = notes || '';
      schedule.calculateTotalHours();
    } else {
      // Create new schedule
      schedule = new Schedule({
        doctorId: req.doctor._id,
        weekStartDate: startDate,
        weekEndDate: endDate,
        weeklySchedule,
        notes: notes || ''
      });
      schedule.calculateTotalHours();
    }

    await schedule.save();

    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data: {
        schedule: {
          _id: schedule._id,
          weekStartDate: schedule.weekStartDate,
          weekEndDate: schedule.weekEndDate,
          weekRange: schedule.weekRange,
          weeklySchedule: schedule.getFormattedSchedule(),
          totalHours: schedule.totalHours,
          status: schedule.status,
          notes: schedule.notes,
          updatedAt: schedule.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating schedule',
      error: error.message
    });
  }
});

// Add/Update a specific day schedule
router.put('/day/:day', authenticateDoctor, [
  body('weekStartDate')
    .isISO8601()
    .withMessage('Valid week start date is required'),
  body('slots')
    .isArray()
    .withMessage('Slots must be an array'),
  body('slots.*.startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('slots.*.endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('slots.*.type')
    .isIn([
      'Morning Consultations',
      'Afternoon Procedures', 
      'Evening Consultations',
      'Surgery',
      'Emergency',
      'Full Day Clinic',
      'Morning Session',
      'Extended Afternoon',
      'Short Afternoon',
      'Half Day',
      'Weekend Morning',
      'Day Off'
    ])
    .withMessage('Invalid schedule type')
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

    const { day } = req.params;
    const { weekStartDate, slots } = req.body;
    
    // Calculate the specific date for the day being edited
    const weekStart = new Date(weekStartDate);
    const dayIndex = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(day.toLowerCase());
    const specificDate = new Date(weekStart);
    specificDate.setDate(weekStart.getDate() + dayIndex);
    
    // Prevent editing past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (specificDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit past schedules. Please select a future date.'
      });
    }
    
    // Prevent editing today's schedule after 5 PM
    const now = new Date();
    if (specificDate.toDateString() === now.toDateString() && now.getHours() >= 17) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit today\'s schedule after 5:00 PM. Please schedule for tomorrow or later.'
      });
    }
    
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(day.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day. Must be one of: ' + validDays.join(', ')
      });
    }

    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    let schedule = await Schedule.findOne({
      doctorId: req.doctor._id,
      weekStartDate: { $lte: startDate },
      weekEndDate: { $gte: endDate },
      status: 'active'
    });

    if (!schedule) {
      // Create new schedule if it doesn't exist
      schedule = new Schedule({
        doctorId: req.doctor._id,
        weekStartDate: startDate,
        weekEndDate: endDate,
        weeklySchedule: {
          monday: [],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: []
        }
      });
    }

    // Update the specific day
    schedule.weeklySchedule[day.toLowerCase()] = slots;
    schedule.calculateTotalHours();
    
    await schedule.save();

    res.json({
      success: true,
      message: `${day} schedule updated successfully`,
      data: {
        schedule: {
          _id: schedule._id,
          weekStartDate: schedule.weekStartDate,
          weekEndDate: schedule.weekEndDate,
          weekRange: schedule.weekRange,
          weeklySchedule: schedule.getFormattedSchedule(),
          totalHours: schedule.totalHours,
          status: schedule.status,
          notes: schedule.notes,
          updatedAt: schedule.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error updating day schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating day schedule',
      error: error.message
    });
  }
});

// Get all schedules for the doctor (with pagination)
router.get('/history', authenticateDoctor, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const schedules = await Schedule.find({
      doctorId: req.doctor._id
    })
    .sort({ weekStartDate: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Schedule.countDocuments({
      doctorId: req.doctor._id
    });

    const formattedSchedules = schedules.map(schedule => ({
      _id: schedule._id,
      weekStartDate: schedule.weekStartDate,
      weekEndDate: schedule.weekEndDate,
      weekRange: schedule.weekRange,
      totalHours: schedule.totalHours,
      status: schedule.status,
      updatedAt: schedule.updatedAt
    }));

    res.json({
      success: true,
      data: {
        schedules: formattedSchedules,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching schedule history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching schedule history',
      error: error.message
    });
  }
});

// Delete a schedule
router.delete('/:scheduleId', authenticateDoctor, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({
      _id: req.params.scheduleId,
      doctorId: req.doctor._id
    });

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    // Instead of deleting, archive the schedule
    schedule.status = 'archived';
    await schedule.save();

    res.json({
      success: true,
      message: 'Schedule archived successfully'
    });
  } catch (error) {
    console.error('Error archiving schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while archiving schedule',
      error: error.message
    });
  }
});

module.exports = router;
