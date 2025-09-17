const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  appointmentDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format in 24-hour
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format in 24-hour
  },
  slotType: {
    type: String,
    required: true,
    enum: [
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
      'Weekend Morning'
    ]
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  symptoms: {
    type: String,
    trim: true,
    maxlength: 500
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  bookingDate: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
appointmentSchema.index({ doctorId: 1, appointmentDate: 1, startTime: 1 });
appointmentSchema.index({ patientId: 1, appointmentDate: 1 });
appointmentSchema.index({ appointmentDate: 1, status: 1 });

// Compound unique index to prevent double booking of same slot
appointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, startTime: 1, endTime: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: { $nin: ['cancelled'] } }
  }
);

// Update lastUpdated before saving
appointmentSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Virtual for formatted appointment date
appointmentSchema.virtual('formattedDate').get(function() {
  // Use UTC methods to avoid timezone shifts
  const year = this.appointmentDate.getUTCFullYear();
  const month = this.appointmentDate.getUTCMonth();
  const day = this.appointmentDate.getUTCDate();
  
  // Create a new date in local timezone for formatting
  const localDate = new Date(year, month, day);
  
  return localDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for formatted time range
appointmentSchema.virtual('timeRange').get(function() {
  const formatTime = (time24) => {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${period}`;
  };
  
  return `${formatTime(this.startTime)} - ${formatTime(this.endTime)}`;
});

// Static method to check if a slot is available
appointmentSchema.statics.isSlotAvailable = async function(doctorId, appointmentDate, startTime, endTime) {
  const existingAppointment = await this.findOne({
    doctorId,
    appointmentDate: {
      $gte: new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate()),
      $lt: new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate() + 1)
    },
    startTime,
    endTime,
    status: { $ne: 'cancelled' }
  });
  
  return !existingAppointment;
};

// Static method to get doctor's appointments for a specific date
appointmentSchema.statics.getDoctorAppointments = async function(doctorId, date) {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  
  return this.find({
    doctorId,
    appointmentDate: {
      $gte: startOfDay,
      $lt: endOfDay
    },
    status: { $ne: 'cancelled' }
  }).sort({ startTime: 1 });
};

// Static method to get patient's appointments
appointmentSchema.statics.getPatientAppointments = async function(patientId, limit = 10) {
  return this.find({
    patientId,
    status: { $ne: 'cancelled' }
  })
  .populate('doctorId', 'firstName lastName specialization email')
  .sort({ appointmentDate: 1, startTime: 1 })
  .limit(limit);
};

// Static method to get upcoming appointments for a doctor
appointmentSchema.statics.getDoctorUpcomingAppointments = async function(doctorId, limit = 10) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return this.find({
    doctorId,
    appointmentDate: { $gte: today },
    status: { $in: ['scheduled', 'confirmed'] }
  })
  .populate('patientId', 'firstName lastName email phone')
  .sort({ appointmentDate: 1, startTime: 1 })
  .limit(limit);
};

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;