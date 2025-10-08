const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Schedule = require('../models/Schedule');
const { body, validationResult } = require('express-validator');
const authenticatePatient = require('../middleware/authenticatePatient');
const doctorAuth = require('../middleware/doctorAuth');
const emailService = require('../services/emailService');

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

// Get appointments for a specific patient (for doctors)
router.get('/patient/:patientId', doctorAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    console.log('🔍 Fetching appointments for patient:', patientId);
    
    const appointments = await Appointment.find({ patientId })
      .populate('doctorId', 'firstName lastName specialization')
      .sort({ appointmentDate: -1, startTime: -1 });
    
    console.log('✅ Successfully fetched patient appointments:', appointments.length);
    
    res.json({
      success: true,
      appointments: appointments,
      message: `Found ${appointments.length} appointments for patient`
    });
  } catch (error) {
    console.error('❌ Error fetching patient appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient appointments',
      error: error.message
    });
  }
});

// Get doctor's available time slots for a specific date
router.get('/doctor/:doctorId/slots/:date', authenticatePatient, async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    
    console.log(`Fetching slots for doctor ${doctorId} on date ${date}`);
    
    // Parse date more carefully to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const appointmentDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)); // Noon UTC to avoid timezone shifts
    
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
    
    let bookingDate = new Date(appointmentDate);
    
    // Ensure the date is set to local timezone to avoid timezone shifts
    if (appointmentDate.includes('T')) {
      // If ISO string with time component, use as is
      bookingDate = new Date(appointmentDate);
    } else {
      // If date string without time (YYYY-MM-DD), parse as local date and set to noon UTC to avoid timezone shifts
      const [year, month, day] = appointmentDate.split('-').map(Number);
      bookingDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)); // Noon UTC to avoid timezone shifts
    }
    
    // Check if the date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingDateLocal = new Date(bookingDate);
    bookingDateLocal.setHours(0, 0, 0, 0);
    
    if (bookingDateLocal < today) {
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
    
    // Send booking confirmation email
    const emailData = {
      patientEmail: appointment.patientId.email,
      patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
      doctorName: `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
      specialization: appointment.doctorId.specialization,
      appointmentDate: appointment.appointmentDate,
      timeRange: appointment.timeRange,
      slotType: appointment.slotType,
      symptoms: appointment.symptoms
    };
    
    // Send email asynchronously (don't wait for completion to avoid delaying response)
    emailService.sendAppointmentBookingConfirmation(emailData)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✅ Booking confirmation email sent successfully');
        } else {
          console.error('❌ Failed to send booking confirmation email:', emailResult.error);
        }
      })
      .catch((emailError) => {
        console.error('❌ Error sending booking confirmation email:', emailError);
      });
    
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
    
    const formattedAppointments = appointments.map(appointment => {
      // Format date properly for frontend using UTC components
      const year = appointment.appointmentDate.getUTCFullYear();
      const month = String(appointment.appointmentDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(appointment.appointmentDate.getUTCDate()).padStart(2, '0');
      const formattedDateString = `${year}-${month}-${day}`;
      
      return {
        id: appointment._id,
        doctorId: appointment.doctorId._id,
        doctorName: `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
        specialization: appointment.doctorId.specialization,
        date: appointment.formattedDate,
        appointmentDate: formattedDateString,
        timeRange: appointment.timeRange,
        slotType: appointment.slotType,
        status: appointment.status,
        symptoms: appointment.symptoms,
        bookingDate: appointment.bookingDate
      };
    });
    
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
    console.log('Doctor object from middleware:', req.doctor);
    const doctorId = req.doctor._id;
    console.log('Doctor ID:', doctorId);
    const { limit = 20, status = 'all', date = null, appointmentType = 'upcoming' } = req.query;
    
    let filter = { doctorId };
    
    // Get today's date for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Filter by status
    if (status !== 'all') {
      if (status === 'pending') {
        filter.status = { $in: ['scheduled', 'confirmed'] };
        
        // For pending appointments, separate upcoming and past
        if (appointmentType === 'upcoming') {
          filter.appointmentDate = { $gte: today };
        } else if (appointmentType === 'past') {
          filter.appointmentDate = { $lt: today };
        }
      } else {
        filter.status = status;
      }
    }
    
    // Filter by date if specified
    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      filter.appointmentDate = { $gte: startDate, $lte: endDate };
    }
    
    const appointments = await Appointment.find(filter)
      .populate('patientId', 'firstName lastName email phone dateOfBirth gender profilePicture profileImage')
      .sort({ appointmentDate: 1, startTime: 1 })
      .limit(parseInt(limit));
    
    console.log('🔍 Backend Debug:');
    console.log('- Doctor ID:', doctorId);
    console.log('- Status filter:', status);
    console.log('- Appointment type:', appointmentType);
    console.log('- Date filter:', date);
    console.log('- Final filter object:', JSON.stringify(filter, null, 2));
    console.log('- Found appointments count:', appointments.length);
    
    // Debug each appointment's patient gender data
    appointments.forEach((apt, index) => {
      console.log(`🎯 Appointment ${index + 1} Gender Debug:`, {
        appointmentId: apt._id,
        patientName: `${apt.patientId.firstName} ${apt.patientId.lastName}`,
        patientId: apt.patientId._id,
        patientIdObject: apt.patientId,
        gender: apt.patientId.gender,
        genderType: typeof apt.patientId.gender,
        hasGender: !!apt.patientId.gender,
        appointmentStatus: apt.status,
        appointmentDate: apt.appointmentDate
      });
    });
    
    console.log('\n🔍 Sample populated patient object:');
    if (appointments.length > 0) {
      console.log(JSON.stringify(appointments[0].patientId, null, 2));
    }
    
    // Format date properly for frontend using UTC components
    const formattedAppointments = appointments.map(appointment => {
      const year = appointment.appointmentDate.getUTCFullYear();
      const month = String(appointment.appointmentDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(appointment.appointmentDate.getUTCDate()).padStart(2, '0');
      const formattedDateString = `${year}-${month}-${day}`;
      
      // Calculate patient age if dateOfBirth is available
      let age = null;
      if (appointment.patientId.dateOfBirth) {
        const birthDate = new Date(appointment.patientId.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }
      
      // Debug: Check patient profile picture fields
      console.log('🔍 Patient profile picture debug:', {
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
        profilePicture: appointment.patientId.profilePicture,
        profileImageUrl: appointment.patientId.profileImage?.url,
        hasProfilePicture: !!appointment.patientId.profilePicture,
        hasProfileImageUrl: !!appointment.patientId.profileImage?.url
      });
      
      // Use profileImage.url if profilePicture is not available, or vice versa
      const patientProfilePicture = appointment.patientId.profilePicture || appointment.patientId.profileImage?.url;
      
      return {
        id: appointment._id,
        patientId: {
          _id: appointment.patientId._id,
          firstName: appointment.patientId.firstName,
          lastName: appointment.patientId.lastName,
          email: appointment.patientId.email,
          phone: appointment.patientId.phone,
          gender: appointment.patientId.gender,
          profilePicture: appointment.patientId.profilePicture,
          profileImage: appointment.patientId.profileImage
        },
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
        patientEmail: appointment.patientId.email,
        patientPhone: appointment.patientId.phone,
        patientAge: age,
        patientGender: appointment.patientId.gender,
        patientProfilePicture: patientProfilePicture,
        date: appointment.formattedDate,
        appointmentDate: formattedDateString,
        timeRange: appointment.timeRange,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        slotType: appointment.slotType,
        status: appointment.status,
        symptoms: appointment.symptoms,
        notes: appointment.notes,
        bookingDate: appointment.bookingDate,
        isEmergency: appointment.isEmergency || false
      };
    });
    
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
    }).populate('doctorId', 'firstName lastName specialization email')
      .populate('patientId', 'firstName lastName email phone');
    
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
    
    // Store appointment data for email before cancellation
    const emailData = {
      patientEmail: appointment.patientId.email,
      patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
      doctorName: `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
      specialization: appointment.doctorId.specialization,
      appointmentDate: appointment.appointmentDate,
      timeRange: appointment.timeRange,
      slotType: appointment.slotType
    };
    
    appointment.status = 'cancelled';
    await appointment.save();
    
    // Send cancellation notification email
    emailService.sendAppointmentCancellationNotification(emailData)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✅ Cancellation notification email sent successfully');
        } else {
          console.error('❌ Failed to send cancellation notification email:', emailResult.error);
        }
      })
      .catch((emailError) => {
        console.error('❌ Error sending cancellation notification email:', emailError);
      });
    
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

// Reschedule appointment (for patients)
router.patch('/reschedule/:appointmentId', [
  authenticatePatient,
  body('newDate').isISO8601().withMessage('Valid new date is required'),
  body('newStartTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid new start time is required (HH:MM format)'),
  body('newEndTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid new end time is required (HH:MM format)'),
  body('newSlotType').notEmpty().withMessage('New slot type is required')
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

    const { appointmentId } = req.params;
    const { newDate, newStartTime, newEndTime, newSlotType } = req.body;
    const patientId = req.user._id;
    
    // Find the original appointment
    const originalAppointment = await Appointment.findOne({
      _id: appointmentId,
      patientId,
      status: { $in: ['scheduled', 'confirmed'] }
    }).populate('doctorId', 'firstName lastName specialization email')
      .populate('patientId', 'firstName lastName email phone');
    
    if (!originalAppointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or cannot be rescheduled'
      });
    }
    
    // Check if original appointment is at least 2 hours in the future
    const originalDateTime = new Date(`${originalAppointment.appointmentDate.toISOString().split('T')[0]}T${originalAppointment.startTime}`);
    const twoHoursFromNow = new Date();
    twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);
    
    if (originalDateTime < twoHoursFromNow) {
      return res.status(400).json({
        success: false,
        message: 'Appointments can only be rescheduled at least 2 hours in advance'
      });
    }
    
    // Parse the new date properly to avoid timezone issues
    let newAppointmentDate;
    if (newDate.includes('T')) {
      newAppointmentDate = new Date(newDate);
    } else {
      const [year, month, day] = newDate.split('-').map(Number);
      newAppointmentDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)); // Noon UTC to avoid timezone shifts
    }
    
    // Check if the new slot is still available
    const isAvailable = await Appointment.isSlotAvailable(originalAppointment.doctorId._id, newAppointmentDate, newStartTime, newEndTime);
    
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: 'New time slot not available. Another patient may have booked it.'
      });
    }
    
    // Store original appointment data for email
    const oldAppointmentData = {
      date: originalAppointment.appointmentDate,
      timeRange: originalAppointment.timeRange
    };
    
    // Update the appointment with new details
    originalAppointment.appointmentDate = newAppointmentDate;
    originalAppointment.startTime = newStartTime;
    originalAppointment.endTime = newEndTime;
    originalAppointment.slotType = newSlotType;
    originalAppointment.status = 'scheduled'; // Reset status if it was confirmed
    
    await originalAppointment.save();
    
    // Send reschedule notification email
    const emailData = {
      patientEmail: originalAppointment.patientId.email,
      patientName: `${originalAppointment.patientId.firstName} ${originalAppointment.patientId.lastName}`,
      doctorName: `Dr. ${originalAppointment.doctorId.firstName} ${originalAppointment.doctorId.lastName}`,
      specialization: originalAppointment.doctorId.specialization,
      oldDate: oldAppointmentData.date,
      oldTimeRange: oldAppointmentData.timeRange,
      newDate: originalAppointment.appointmentDate,
      newTimeRange: originalAppointment.timeRange,
      slotType: originalAppointment.slotType,
      symptoms: originalAppointment.symptoms
    };
    
    emailService.sendAppointmentRescheduleNotification(emailData)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✅ Reschedule notification email sent successfully');
        } else {
          console.error('❌ Failed to send reschedule notification email:', emailResult.error);
        }
      })
      .catch((emailError) => {
        console.error('❌ Error sending reschedule notification email:', emailError);
      });
    
    res.json({
      success: true,
      message: 'Appointment rescheduled successfully',
      appointment: {
        id: originalAppointment._id,
        doctorName: `Dr. ${originalAppointment.doctorId.firstName} ${originalAppointment.doctorId.lastName}`,
        specialization: originalAppointment.doctorId.specialization,
        date: originalAppointment.formattedDate,
        timeRange: originalAppointment.timeRange,
        slotType: originalAppointment.slotType,
        status: originalAppointment.status
      }
    });
    
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Error rescheduling appointment',
      error: error.message
    });
  }
});

// Start appointment (doctor action)
router.patch('/doctor/start/:appointmentId', doctorAuth, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const doctorId = req.doctor._id;
    
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId,
      status: { $in: ['scheduled', 'confirmed'] }
    }).populate('patientId', 'firstName lastName email');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or cannot be started'
      });
    }
    
    // Update appointment status to confirmed (started)
    appointment.status = 'confirmed';
    await appointment.save();
    
    res.json({
      success: true,
      message: 'Appointment started successfully',
      appointment: {
        id: appointment._id,
        status: appointment.status,
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
      }
    });
    
  } catch (error) {
    console.error('Error starting appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting appointment',
      error: error.message
    });
  }
});

// Complete appointment (doctor action)
router.patch('/doctor/complete/:appointmentId', [
  doctorAuth,
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
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
    
    const { appointmentId } = req.params;
    const { notes } = req.body;
    const doctorId = req.doctor._id;
    
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId,
      status: { $in: ['confirmed', 'scheduled'] }
    }).populate('patientId', 'firstName lastName email');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or cannot be completed'
      });
    }
    
    // Update appointment status and notes
    appointment.status = 'completed';
    if (notes) {
      appointment.notes = notes;
    }
    await appointment.save();
    
    res.json({
      success: true,
      message: 'Appointment completed successfully',
      appointment: {
        id: appointment._id,
        status: appointment.status,
        notes: appointment.notes,
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
      }
    });
    
  } catch (error) {
    console.error('Error completing appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing appointment',
      error: error.message
    });
  }
});

// Update appointment details (doctor action)
router.patch('/doctor/update/:appointmentId', [
  doctorAuth,
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters'),
  body('symptoms').optional().trim().isLength({ max: 500 }).withMessage('Symptoms must be less than 500 characters'),
  body('isEmergency').optional().isBoolean().withMessage('Emergency flag must be boolean')
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
    
    const { appointmentId } = req.params;
    const { notes, symptoms, isEmergency } = req.body;
    const doctorId = req.doctor._id;
    
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId
    }).populate('patientId', 'firstName lastName email');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }
    
    // Update appointment details
    if (notes !== undefined) appointment.notes = notes;
    if (symptoms !== undefined) appointment.symptoms = symptoms;
    if (isEmergency !== undefined) appointment.isEmergency = isEmergency;
    
    await appointment.save();
    
    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: {
        id: appointment._id,
        notes: appointment.notes,
        symptoms: appointment.symptoms,
        isEmergency: appointment.isEmergency,
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
      }
    });
    
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating appointment',
      error: error.message
    });
  }
});

// Get available time slots for doctor (for reschedule)
router.get('/doctor/available-slots', doctorAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const doctorId = req.doctor._id; // Fixed: using req.doctor instead of req.user
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    console.log(`🔍 Fetching available slots for doctor ${doctorId} on ${date}`);

    // Find doctor's schedule for the day
    const requestDate = new Date(date);
    console.log(`📅 Raw date input: "${date}"`);
    console.log(`📅 Parsed Date object: ${requestDate}`);
    console.log(`📅 Date is valid: ${!isNaN(requestDate.getTime())}`);
    
    const dayOfWeek = requestDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    console.log(`📅 Day of week: ${dayOfWeek}`);
    console.log(`👨‍⚕️ Doctor ID: ${doctorId}`);

    // First, find any schedule for this doctor
    const allSchedules = await Schedule.find({ doctorId });
    console.log(`📋 Found ${allSchedules.length} schedules for doctor`);
    
    // Find doctor's schedule - get the most recent active schedule
    let schedule = await Schedule.findOne({ 
      doctorId, 
      status: 'active' 
    }).sort({ createdAt: -1 }); // Sort by newest first

    if (!schedule) {
      console.log(`❌ No active schedule found for doctor ${doctorId}`);
      return res.json({
        success: true,
        data: { availableSlots: [] },
        message: 'No schedule found for this day'
      });
    }

    console.log(`📋 Found schedule for doctor (created: ${schedule.createdAt}), checking weeklySchedule`);
    const daySchedule = schedule.weeklySchedule[dayOfWeek];
    console.log(`📅 Day schedule for ${dayOfWeek}:`, daySchedule);
    
    if (!daySchedule || daySchedule.length === 0) {
      console.log(`❌ Doctor is not working on ${dayOfWeek}`);
      return res.json({
        success: true,
        data: { availableSlots: [] },
        message: `Doctor is not working on ${dayOfWeek}`
      });
    }

    console.log(`✅ Doctor has ${daySchedule.length} slots on ${dayOfWeek}`);
    console.log(`📋 Raw daySchedule data:`, JSON.stringify(daySchedule, null, 2));

    // Show exact scheduled time slots as they are
    const allSlots = [];
    
    for (const scheduleSlot of daySchedule) {
      console.log(`🔍 Examining schedule slot:`, {
        startTime: scheduleSlot.startTime,
        endTime: scheduleSlot.endTime,
        type: scheduleSlot.type,
        isAvailable: scheduleSlot.isAvailable
      });
      
      if (scheduleSlot.isAvailable && scheduleSlot.type !== 'Day Off') {
        console.log(`📅 Processing slot: ${scheduleSlot.startTime} - ${scheduleSlot.endTime} (${scheduleSlot.type})`);
        
        // Use the exact time slot as scheduled by the doctor
        const formattedSlot = `${convertTo12Hour(scheduleSlot.startTime)} - ${convertTo12Hour(scheduleSlot.endTime)}`;
        allSlots.push(formattedSlot);
        
        console.log(`✅ Added scheduled slot: ${formattedSlot}`);
      } else {
        console.log(`❌ Skipped slot: isAvailable=${scheduleSlot.isAvailable}, type=${scheduleSlot.type}`);
      }
    }
    
    console.log(`📅 Generated ${allSlots.length} slots based on doctor's exact schedule`);

    // Find existing appointments for this date
    const existingAppointments = await Appointment.find({
      doctorId,
      appointmentDate: new Date(date), // Use appointmentDate instead of date
      status: { $in: ['scheduled', 'confirmed'] } // Remove 'rescheduled' since it's not a valid status
    });

    console.log(`🔍 Found ${existingAppointments.length} existing appointments for ${date}`);
    if (existingAppointments.length > 0) {
      console.log(`📋 Existing appointments:`, existingAppointments.map(apt => ({
        timeRange: apt.timeRange,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status
      })));
    }

    // Remove booked slots
    const bookedSlots = existingAppointments.map(apt => apt.timeRange);
    const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));

    console.log(`✅ Generated ${allSlots.length} total slots, ${bookedSlots.length} booked, ${availableSlots.length} available`);
    console.log(`📋 All generated slots:`, allSlots);
    console.log(`📋 Booked slots:`, bookedSlots);
    console.log(`📋 Available slots:`, availableSlots);

    res.json({
      success: true,
      data: { availableSlots }
    });

  } catch (error) {
    console.error('❌ Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available slots',
      error: error.message
    });
  }
});

// Doctor reschedule appointment
router.patch('/doctor/reschedule/:appointmentId', [
  doctorAuth,
  body('newDate').notEmpty().withMessage('New date is required'),
  body('newTimeSlot').notEmpty().withMessage('New time slot is required'),
  body('reason').optional().isString()
], async (req, res) => {
  try {
    console.log('🔄 Reschedule request received:');
    console.log('- Appointment ID:', req.params.appointmentId);
    console.log('- Request body:', req.body);
    console.log('- Doctor:', req.doctor._id);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { appointmentId } = req.params;
    const { newDate, newTimeSlot, reason } = req.body;
    const doctorId = req.doctor._id; // Fixed: using req.doctor instead of req.user

    console.log(`🔄 Doctor ${doctorId} rescheduling appointment ${appointmentId}`);

    // Find the appointment
    console.log(`🔍 Looking for appointment with ID: ${appointmentId} and doctorId: ${doctorId}`);
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId
    }).populate('patientId', 'firstName lastName email');

    console.log(`📋 Found appointment:`, appointment ? 'Yes' : 'No');
    if (appointment) {
      console.log(`📋 Appointment details:`, {
        id: appointment._id,
        currentDate: appointment.appointmentDate,
        currentTime: appointment.timeRange,
        status: appointment.status
      });
    }

    if (!appointment) {
      console.log(`❌ Appointment not found with ID ${appointmentId} for doctor ${doctorId}`);
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if the new time slot is available
    console.log(`🔍 Checking for conflicts on ${newDate} at ${newTimeSlot}`);
    const conflictingAppointment = await Appointment.findOne({
      doctorId,
      appointmentDate: new Date(newDate),
      timeRange: newTimeSlot,
      status: { $in: ['scheduled', 'confirmed', 'rescheduled'] },
      _id: { $ne: appointmentId } // Exclude current appointment
    });

    console.log(`⚠️ Conflicting appointment found:`, conflictingAppointment ? 'Yes' : 'No');

    if (conflictingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is already booked'
      });
    }

    // Store original appointment details for email
    const originalDate = appointment.appointmentDate;
    const originalTimeRange = appointment.timeRange;

    // Parse the new time slot to extract start and end times
    const [startTimeStr, endTimeStr] = newTimeSlot.split(' - ');
    
    console.log(`🔄 Parsing time slot "${newTimeSlot}":`, {
      startTimeStr,
      endTimeStr
    });
    
    const newStartTime = convertTo24Hour(startTimeStr);
    const newEndTime = convertTo24Hour(endTimeStr);

    console.log(`🔄 Converting time slot "${newTimeSlot}" to:`, {
      startTime: newStartTime,
      endTime: newEndTime
    });

    // Store original values for comparison
    const originalStartTime = appointment.startTime;
    const originalEndTime = appointment.endTime;

    // Determine appropriate slotType based on time (clinic hours: 9 AM - 8 PM)
    const determineSlotType = (startTime) => {
      const hour = parseInt(startTime.split(':')[0], 10);
      
      if (hour >= 9 && hour < 12) {
        return 'Morning Consultations';
      } else if (hour >= 12 && hour < 15) {
        return 'Afternoon Procedures';
      } else if (hour >= 15 && hour < 17) {
        return 'Extended Afternoon';
      } else if (hour >= 17 && hour < 20) {
        return 'Evening Consultations';
      } else {
        // For times outside clinic hours (before 9 AM or after 8 PM)
        return 'Emergency';
      }
    };

    const newSlotType = determineSlotType(newStartTime);

    // Update the appointment - using correct field names
    appointment.appointmentDate = new Date(newDate);
    appointment.startTime = newStartTime;
    appointment.endTime = newEndTime;
    appointment.slotType = newSlotType; // Update slotType based on new time
    appointment.status = 'confirmed'; // Keep status as confirmed instead of rescheduled
    appointment.rescheduleReason = reason || 'Rescheduled by doctor';
    appointment.rescheduledAt = new Date();

    console.log(`🔄 Before save - Old vs New appointment data:`, {
      oldStartTime: originalStartTime,
      oldEndTime: originalEndTime,
      oldSlotType: appointment.slotType, // This will show the old value before update
      newStartTime: appointment.startTime,
      newEndTime: appointment.endTime,
      newSlotType: newSlotType
    });

    await appointment.save();

    console.log(`✅ After save - Updated appointment:`, {
      savedStartTime: appointment.startTime,
      savedEndTime: appointment.endTime,
      savedSlotType: appointment.slotType,
      timeRange: appointment.timeRange,
      status: appointment.status
    });

    console.log(`✅ Appointment rescheduled successfully from ${originalDate} ${originalTimeRange} to ${newDate} ${newTimeSlot}`);

    // Send email notification to patient (wrapped in try-catch to prevent failure)
    try {
      console.log('📧 Attempting to send reschedule notification email...');
      await emailService.sendAppointmentRescheduleNotification({
        patientEmail: appointment.patientId.email,
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
        doctorName: `${req.doctor.firstName} ${req.doctor.lastName}`,
        specialization: req.doctor.specialization || 'Dentist',
        oldDate: originalDate,
        oldTimeRange: originalTimeRange,
        newDate: new Date(newDate),
        newTimeRange: newTimeSlot,
        slotType: appointment.slotType || 'General',
        symptoms: appointment.symptoms || ''
      });
      console.log('📧 Reschedule notification email sent to patient');
    } catch (emailError) {
      console.error('❌ Error sending reschedule email:', emailError);
      console.error('❌ Email error details:', emailError.stack);
      // Don't fail the reschedule if email fails - just log the error
    }

    console.log('🎉 Sending success response to frontend...');

    res.json({
      success: true,
      message: 'Appointment rescheduled successfully',
      appointment: {
        id: appointment._id,
        appointmentDate: appointment.appointmentDate,
        timeRange: appointment.timeRange,
        status: appointment.status,
        patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
        rescheduleReason: appointment.rescheduleReason
      }
    });

  } catch (error) {
    console.error('❌ Error rescheduling appointment:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    
    res.status(500).json({
      success: false,
      message: 'Error rescheduling appointment',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;