const mongoose = require('mongoose');

const scheduleSlotSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  type: {
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
      'Weekend Morning',
      'Day Off'
    ]
  },
  description: {
    type: String,
    maxlength: 200
  },
  isAvailable: {
    type: Boolean,
    default: true
  }
});

const scheduleSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  weeklySchedule: {
    monday: [scheduleSlotSchema],
    tuesday: [scheduleSlotSchema],
    wednesday: [scheduleSlotSchema],
    thursday: [scheduleSlotSchema],
    friday: [scheduleSlotSchema],
    saturday: [scheduleSlotSchema],
    sunday: [scheduleSlotSchema]
  },
  totalHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for efficient querying
scheduleSchema.index({ doctorId: 1, weekStartDate: 1 });
scheduleSchema.index({ doctorId: 1, status: 1 });

// Virtual for formatted week range
scheduleSchema.virtual('weekRange').get(function() {
  const startDate = this.weekStartDate.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  const endDate = this.weekEndDate.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  return `${startDate} - ${endDate}`;
});

// Method to calculate total working hours
scheduleSchema.methods.calculateTotalHours = function() {
  let totalMinutes = 0;
  
  Object.values(this.weeklySchedule).forEach(daySlots => {
    daySlots.forEach(slot => {
      if (slot.type !== 'Day Off' && slot.isAvailable) {
        const start = new Date(`2000-01-01 ${slot.startTime}`);
        const end = new Date(`2000-01-01 ${slot.endTime}`);
        const diffMs = end - start;
        totalMinutes += diffMs / (1000 * 60);
      }
    });
  });
  
  this.totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  return this.totalHours;
};

// Method to format time to 12-hour format
scheduleSchema.methods.formatTimeTo12Hour = function(time24) {
  const [hours, minutes] = time24.split(':');
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${hour12}:${minutes} ${ampm}`;
};

// Method to get formatted schedule
scheduleSchema.methods.getFormattedSchedule = function() {
  const formatted = {};
  
  Object.entries(this.weeklySchedule).forEach(([day, slots]) => {
    formatted[day] = slots.map(slot => ({
      ...slot.toObject(),
      startTime12: this.formatTimeTo12Hour(slot.startTime),
      endTime12: this.formatTimeTo12Hour(slot.endTime),
      timeRange12: `${this.formatTimeTo12Hour(slot.startTime)} - ${this.formatTimeTo12Hour(slot.endTime)}`
    }));
  });
  
  return formatted;
};

// Static method to get current week dates
scheduleSchema.statics.getCurrentWeekDates = function(date = new Date()) {
  const currentDate = new Date(date);
  const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate Monday (start of week)
  const monday = new Date(currentDate);
  monday.setDate(currentDate.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  
  // Calculate Sunday (end of week)  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { weekStartDate: monday, weekEndDate: sunday };
};

module.exports = mongoose.model('Schedule', scheduleSchema);
