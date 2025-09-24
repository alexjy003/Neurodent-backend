const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Medication name is required'],
    trim: true
  },
  dosage: {
    type: String,
    required: [true, 'Dosage is required'],
    trim: true
  },
  duration: {
    type: String,
    required: [true, 'Duration is required'],
    trim: true
  },
  instructions: {
    type: String,
    trim: true
  },
  frequency: {
    type: String,
    trim: true
  }
});

const prescriptionSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: [true, 'Appointment ID is required']
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: [true, 'Patient ID is required']
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: [true, 'Doctor ID is required']
  },
  patientName: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true
  },
  patientAge: {
    type: Number,
    min: [0, 'Age cannot be negative']
  },
  diagnosis: {
    type: String,
    required: [true, 'Diagnosis is required'],
    trim: true,
    maxlength: [500, 'Diagnosis cannot exceed 500 characters']
  },
  symptoms: {
    type: String,
    trim: true,
    maxlength: [1000, 'Symptoms cannot exceed 1000 characters']
  },
  medications: [medicationSchema],
  generalInstructions: {
    type: String,
    trim: true,
    maxlength: [1000, 'General instructions cannot exceed 1000 characters']
  },
  followUpDate: {
    type: Date
  },
  isAIGenerated: {
    type: Boolean,
    default: false
  },
  aiModel: {
    type: String,
    trim: true
  },
  prescriptionDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Indexes for better query performance
prescriptionSchema.index({ appointmentId: 1 });
prescriptionSchema.index({ patientId: 1 });
prescriptionSchema.index({ doctorId: 1 });
prescriptionSchema.index({ prescriptionDate: -1 });
prescriptionSchema.index({ status: 1 });

// Virtual for prescription age in days
prescriptionSchema.virtual('prescriptionAge').get(function() {
  return Math.floor((new Date() - this.prescriptionDate) / (1000 * 60 * 60 * 24));
});

// Static method to find prescriptions by patient
prescriptionSchema.statics.findByPatient = function(patientId) {
  return this.find({ patientId })
    .populate('appointmentId', 'date timeRange')
    .populate('doctorId', 'firstName lastName specialization')
    .sort({ prescriptionDate: -1 });
};

// Static method to find prescriptions by doctor
prescriptionSchema.statics.findByDoctor = function(doctorId) {
  return this.find({ doctorId })
    .populate('appointmentId', 'date timeRange')
    .populate('patientId', 'firstName lastName age')
    .sort({ prescriptionDate: -1 });
};

// Instance method to add medication
prescriptionSchema.methods.addMedication = function(medication) {
  this.medications.push(medication);
  return this.save();
};

// Instance method to update status
prescriptionSchema.methods.updateStatus = function(status) {
  this.status = status;
  return this.save();
};

// Ensure virtual fields are serialized
prescriptionSchema.set('toJSON', { virtuals: true });
prescriptionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);
