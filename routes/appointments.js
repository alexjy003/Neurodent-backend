const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Schedule = require('../models/Schedule');
const { body, validationResult } = require('express-validator');
const authenticatePatient = require('../middleware/authenticatePatient');
const doctorAuth = require('../middleware/doctorAuth');

// Helper function to convert 12-hour time to 24-hour format
const convertTo24Hour = (time12h) => {
  // Handle already 24-hour format
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

// Helper function to convert 24-hour time to 12-hour format
const convertTo12Hour = (time24h) => {
  const [hours, minutes] = time24h.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${period}`;
};

// Get doctor's available time slots for a specific date
router.get('/doctor/:doctorId/slots/:date', authenticatePatient, async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    
    console.log(`Fetching slots for doctor ${doctorId} on date ${date}`);
    
    // Parse date more carefully to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day); // month is 0-indexed
    console.log(`Parsed appointment date: ${appointmentDate.toISOString()}`);
    
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }
    
    // Check if the date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);
    
    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book appointments for past dates'
      });
    }
    
    // Get the day name
    const dayName = appointmentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    console.log(`Day name for ${date}: ${dayName}`);
    
    // Find doctor's schedule that covers this date
    const schedules = await Schedule.find({
      doctorId,
      status: 'active'
    }).sort({ weekStartDate: -1 });
    
    console.log(`Found ${schedules.length} active schedules for doctor ${doctorId}`);
    
    let doctorSchedule = null;
    
    // Find the most recent schedule that covers this date
    for (const schedule of schedules) {
      const weekStart = new Date(schedule.weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      // Use date-only comparison to avoid timezone issues
      const appointmentDateOnly = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());
      const weekStartOnly = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      const weekEndOnly = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
      
      console.log(`Checking schedule: ${weekStartOnly.toISOString().split('T')[0]} to ${weekEndOnly.toISOString().split('T')[0]}`);
      console.log(`Appointment date: ${appointmentDateOnly.toISOString().split('T')[0]}`);
      
      if (appointmentDateOnly >= weekStartOnly && appointmentDateOnly <= weekEndOnly) {
        doctorSchedule = schedule;
        console.log(`Found matching schedule for week starting ${weekStartOnly.toISOString().split('T')[0]}`);
        break;
      }
    }
    
    if (!doctorSchedule || !doctorSchedule.weeklySchedule[dayName] || doctorSchedule.weeklySchedule[dayName].length === 0) {
      console.log(`No schedule found for ${dayName}. Schedule exists: ${!!doctorSchedule}, Day slots exist: ${!!(doctorSchedule && doctorSchedule.weeklySchedule[dayName])}`);
      if (doctorSchedule) {
        console.log(`Available days in schedule:`, Object.keys(doctorSchedule.weeklySchedule));
      }
      return res.json({
        success: false,
        message: "Time slots not scheduled by the doctor",
        availableSlots: []
      });
    }
    
    // Get scheduled time slots for this day
    const daySlots = doctorSchedule.weeklySchedule[dayName];
    console.log(`Day slots for ${dayName}:`, JSON.stringify(daySlots, null, 2));
    
    // Get existing appointments for this doctor on this date
    const existingAppointments = await Appointment.getDoctorAppointments(doctorId, appointmentDate);
    
    console.log(`Found ${daySlots.length} scheduled slots and ${existingAppointments.length} existing appointments`);
    
    // Create available slots by checking against existing appointments
    const availableSlots = [];
    
    for (const slot of daySlots) {
      if (slot.type === 'Day Off') {
        continue; // Skip day off slots
      }
      
      // Convert times to 24-hour format for comparison
      const startTime24 = slot.startTime.includes(' ') ? convertTo24Hour(slot.startTime) : slot.startTime;
      const endTime24 = slot.endTime.includes(' ') ? convertTo24Hour(slot.endTime) : slot.endTime;
      
      console.log(`Processing slot: ${slot.startTime} - ${slot.endTime} => ${startTime24} - ${endTime24}`);
      
      // Check if this slot is already booked
      const isBooked = existingAppointments.some(appointment => 
        appointment.startTime === startTime24 && appointment.endTime === endTime24
      );
      
      availableSlots.push({
        id: `${dayName}_${startTime24}_${endTime24}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startTime24: startTime24,
        endTime24: endTime24,
        type: slot.type,
        isAvailable: !isBooked,
        status: isBooked ? 'booked' : 'available'
      });
    }
    
    console.log(`Generated ${availableSlots.length} available slots:`, JSON.stringify(availableSlots, null, 2));

    res.json({
      success: true,
      availableSlots,
      date: appointmentDate.toISOString().split('T')[0],
      doctorId,
      totalSlots: availableSlots.length,
      availableCount: availableSlots.filter(slot => slot.isAvailable).length
    });  } catch (error) {
    console.error('Error fetching doctor slots:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available slots',
      error: error.message
    });
  }
});

// Book an appointment
router.post('/book', [
  authenticatePatient,
  body('doctorId').isMongoId().withMessage('Valid doctor ID is required'),
  body('appointmentDate').isISO8601().withMessage('Valid appointment date is required'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time is required (HH:MM format)'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time is required (HH:MM format)'),
  body('slotType').notEmpty().withMessage('Slot type is required'),
  body('symptoms').optional().trim().isLength({ max: 500 }).withMessage('Symptoms must be less than 500 characters')
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
    
    const { doctorId, appointmentDate, startTime, endTime, slotType, symptoms } = req.body;
    const patientId = req.user._id;
    
    console.log(`Booking appointment: Patient ${patientId}, Doctor ${doctorId}, Date ${appointmentDate}, Time ${startTime}-${endTime}`);
    console.log(`Start time: "${startTime}", End time: "${endTime}", Slot type: "${slotType}"`);
    
    // Map generic "Available" slot type to specific appointment type based on time
    let appointmentSlotType = slotType;
    if (slotType === 'Available') {
      const startHour = parseInt(startTime.split(':')[0]);
      if (startHour < 12) {
        appointmentSlotType = 'Morning Consultations';
      } else if (startHour < 17) {
        appointmentSlotType = 'Afternoon Procedures';
      } else {
        appointmentSlotType = 'Evening Consultations';
      }
    }
    
    console.log(`Mapped slot type from "${slotType}" to "${appointmentSlotType}"`);
    
    const bookingDate = new Date(appointmentDate);
    
    // Check if the date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    bookingDate.setHours(0, 0, 0, 0);
    
    if (bookingDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book appointments for past dates'
      });
    }
    
    // Check if the slot is still available
    const isAvailable = await Appointment.isSlotAvailable(doctorId, bookingDate, startTime, endTime);
    
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: 'Time slot not available. Another patient may have booked it.'
      });
    }
    
    // Validate that the start time is before end time
    const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
    
    if (startMinutes >= endMinutes) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time range. Start time must be before end time.'
      });
    }
    
    // Create the appointment
    const appointment = new Appointment({
      patientId,
      doctorId,
      appointmentDate: bookingDate,
      startTime,
      endTime,
      slotType: appointmentSlotType,
      symptoms: symptoms || '',
      status: 'scheduled'
    });
    
    await appointment.save();
    
    // Populate doctor and patient information for response
    await appointment.populate('doctorId', 'firstName lastName specialization email');
    await appointment.populate('patientId', 'firstName lastName email phone');
    
    console.log(`Appointment successfully created with ID: ${appointment._id}`);
    
    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: {
        id: appointment._id,
        doctorName: `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
        specialization: appointment.doctorId.specialization,
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
        date: appointment.formattedDate,
        timeRange: appointment.timeRange,
        slotType: appointment.slotType,
        status: appointment.status,
        symptoms: appointment.symptoms
      }
    });
    
  } catch (error) {
    console.error('Error booking appointment:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Time slot not available. Another patient may have booked it.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error booking appointment',
      error: error.message
    });
  }
});

// Get patient's appointments
router.get('/my-appointments', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.user._id;
    const { limit = 10, status = 'all' } = req.query;
    
    let filter = { patientId };
    
    if (status !== 'all') {
      filter.status = status;
    } else {
      filter.status = { $ne: 'cancelled' };
    }
    
    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'firstName lastName specialization email')
      .sort({ appointmentDate: 1, startTime: 1 })
      .limit(parseInt(limit));
    
    const formattedAppointments = appointments.map(appointment => ({
      id: appointment._id,
      doctorName: `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
      specialization: appointment.doctorId.specialization,
      date: appointment.formattedDate,
      appointmentDate: appointment.appointmentDate.toISOString().split('T')[0],
      timeRange: appointment.timeRange,
      slotType: appointment.slotType,
      status: appointment.status,
      symptoms: appointment.symptoms,
      bookingDate: appointment.bookingDate
    }));
    
    res.json({
      success: true,
      appointments: formattedAppointments,
      count: formattedAppointments.length
    });
    
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments',
      error: error.message
    });
  }
});

// Get doctor's appointments (for doctor dashboard)
router.get('/doctor/my-appointments', doctorAuth, async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const { limit = 10, status = 'scheduled' } = req.query;
    
    let filter = { doctorId };
    
    if (status !== 'all') {
      filter.status = status;
    }
    
    const appointments = await Appointment.find(filter)
      .populate('patientId', 'firstName lastName email phone')
      .sort({ appointmentDate: 1, startTime: 1 })
      .limit(parseInt(limit));
    
    const formattedAppointments = appointments.map(appointment => ({
      id: appointment._id,
      patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
      patientEmail: appointment.patientId.email,
      patientPhone: appointment.patientId.phone,
      date: appointment.formattedDate,
      appointmentDate: appointment.appointmentDate.toISOString().split('T')[0],
      timeRange: appointment.timeRange,
      slotType: appointment.slotType,
      status: appointment.status,
      symptoms: appointment.symptoms,
      bookingDate: appointment.bookingDate
    }));
    
    res.json({
      success: true,
      appointments: formattedAppointments,
      count: formattedAppointments.length
    });
    
  } catch (error) {
    console.error('Error fetching doctor appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments',
      error: error.message
    });
  }
});

// Cancel appointment (for patients)
router.patch('/cancel/:appointmentId', authenticatePatient, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const patientId = req.user._id;
    
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId,
      status: { $in: ['scheduled', 'confirmed'] }
    });
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or cannot be cancelled'
      });
    }
    
    // Check if appointment is at least 2 hours in the future
    const appointmentDateTime = new Date(`${appointment.appointmentDate.toISOString().split('T')[0]}T${appointment.startTime}`);
    const twoHoursFromNow = new Date();
    twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);
    
    if (appointmentDateTime < twoHoursFromNow) {
      return res.status(400).json({
        success: false,
        message: 'Appointments can only be cancelled at least 2 hours in advance'
      });
    }
    
    appointment.status = 'cancelled';
    await appointment.save();
    
    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling appointment',
      error: error.message
    });
  }
});

module.exports = router;