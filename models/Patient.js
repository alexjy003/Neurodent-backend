const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const patientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password is not required for:
      // 1. Google users (have googleId)
      // 2. During email verification process (has emailVerificationOTP and not verified yet)
      return !this.googleId && !(this.emailVerificationOTP && !this.isEmailVerified);
    }
  },
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: {
      values: ['male', 'female', 'other', 'prefer-not-to-say'],
      message: 'Gender must be one of: male, female, other, prefer-not-to-say'
    },
    required: false,
    default: undefined
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  zipCode: {
    type: String,
    trim: true
  },
  profileImage: {
    url: {
      type: String,
      trim: true
    },
    publicId: {
      type: String,
      trim: true
    }
  },
  googleId: {
    type: String,
    sparse: true
  },
  profilePicture: {
    type: String
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  agreeToTerms: {
    type: Boolean,
    required: true,
    default: false
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  passwordResetOTP: {
    type: String
  },
  passwordResetOTPExpires: {
    type: Date
  },
  emailVerificationOTP: {
    type: String
  },
  emailVerificationOTPExpires: {
    type: Date
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  otpVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Hash password before saving
patientSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
patientSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate password reset token
patientSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');

  // Generate token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Set expire time (10 minutes)
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;

  // Return unhashed token
  return resetToken;
};

// Check if reset token is valid
patientSchema.methods.isResetTokenValid = function(token) {
  const crypto = require('crypto');

  // Hash the provided token
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Check if token matches and hasn't expired
  return this.resetPasswordToken === hashedToken && this.resetPasswordExpires > Date.now();
};

// Generate email verification OTP
patientSchema.methods.generateEmailVerificationOTP = function() {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set OTP and expiration (10 minutes)
  this.emailVerificationOTP = otp;
  this.emailVerificationOTPExpires = Date.now() + 10 * 60 * 1000;

  return otp;
};

// Verify email OTP
patientSchema.methods.verifyEmailOTP = function(otp) {
  return this.emailVerificationOTP === otp && this.emailVerificationOTPExpires > Date.now();
};

// Clear email verification OTP
patientSchema.methods.clearEmailVerificationOTP = function() {
  this.emailVerificationOTP = undefined;
  this.emailVerificationOTPExpires = undefined;
  this.isEmailVerified = true;
};

// Generate password reset OTP
patientSchema.methods.generatePasswordResetOTP = function() {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set OTP and expiration (10 minutes)
  this.passwordResetOTP = otp;
  this.passwordResetOTPExpires = Date.now() + 10 * 60 * 1000;

  return otp;
};

// Verify password reset OTP
patientSchema.methods.verifyPasswordResetOTP = function(otp) {
  return this.passwordResetOTP === otp && this.passwordResetOTPExpires > Date.now();
};

// Clear password reset OTP
patientSchema.methods.clearPasswordResetOTP = function() {
  this.passwordResetOTP = undefined;
  this.passwordResetOTPExpires = undefined;
};

module.exports = mongoose.model('Patient', patientSchema);