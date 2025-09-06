const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const passport = require('passport');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Pharmacist = require('../models/Pharmacist');
const auth = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Generate JWT token
const generateToken = (patientId) => {
  return jwt.sign({ patientId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Register patient
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('agreeToTerms').equals('true').withMessage('You must agree to terms')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, password, phone, dateOfBirth, agreeToTerms } = req.body;

    // Check if patient already exists
    let existingPatient = await Patient.findOne({ email });

    if (existingPatient && existingPatient.isEmailVerified && existingPatient.password) {
      return res.status(400).json({ message: 'Patient already exists with this email' });
    }

    // Check if OTP is verified
    if (!existingPatient || !existingPatient.otpVerified) {
      return res.status(400).json({
        message: 'Email not verified. Please verify your email address first.',
        requiresVerification: true
      });
    }

    // Update existing patient record or create new one
    let patient;
    if (existingPatient) {
      // Update the temporary patient record created during OTP verification
      existingPatient.firstName = firstName;
      existingPatient.lastName = lastName;
      existingPatient.password = password;
      existingPatient.phone = phone;
      existingPatient.dateOfBirth = dateOfBirth;
      existingPatient.agreeToTerms = agreeToTerms;
      existingPatient.isEmailVerified = true; // Now mark as fully verified
      existingPatient.clearEmailVerificationOTP(); // Clear OTP data
      existingPatient.otpVerified = undefined; // Clear temporary OTP verification flag
      patient = existingPatient;
    } else {
      // This shouldn't happen if verification flow is followed
      patient = new Patient({
        firstName,
        lastName,
        email,
        password,
        phone,
        dateOfBirth,
        agreeToTerms,
        isEmailVerified: true
      });
    }

    await patient.save();

    // Generate token
    const token = generateToken(patient._id);

    res.status(201).json({
      message: 'Patient registered successfully',
      token,
      patient: {
        id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login patient
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find patient
    const patient = await Patient.findOne({ email });
    if (!patient) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await patient.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(patient._id);

    res.json({
      message: 'Login successful',
      token,
      patient: {
        id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Google OAuth routes
router.get('/google',
  (req, res, next) => {
    console.log('🔐 Google OAuth login initiated');
    // Store the intent in session to distinguish login vs signup
    req.session.oauthIntent = 'login';
    next();
  },
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account', // Force account selection screen
    accessType: 'offline',
    state: 'login' // Add state parameter to track intent
  })
);

// Alternative route for forcing new account signup
router.get('/google/signup',
  (req, res, next) => {
    console.log('📝 Google OAuth signup initiated');
    // Store the intent in session to distinguish login vs signup
    req.session.oauthIntent = 'signup';
    next();
  },
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account consent', // Force account selection AND consent screen
    accessType: 'offline',
    state: 'signup' // Add state parameter to track intent
  })
);

router.get('/google/callback',
  (req, res, next) => {
    console.log('🔍 Google OAuth callback received');
    console.log('Query params:', req.query);
    console.log('State parameter:', req.query.state);
    console.log('OAuth intent from session:', req.session ? req.session.oauthIntent : 'unknown');

    // Store state in session as backup
    if (req.query.state) {
      req.session.oauthIntent = req.query.state;
    }

    next();
  },
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
    failureMessage: true
  }),
  (req, res) => {
    try {
      // Check if authentication failed (user is false)
      if (!req.user) {
        console.log('❌ Google OAuth authentication failed - no user');
        const oauthIntent = req.session ? req.session.oauthIntent : 'login';

        if (oauthIntent === 'login') {
          // Redirect to login with specific error for non-existent account
          return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_not_found`);
        } else {
          // Redirect to register with error
          return res.redirect(`${process.env.FRONTEND_URL}/register?error=google_signup_failed`);
        }
      }

      console.log('✅ Google OAuth authentication successful');
      console.log('User:', req.user);

      // Generate token
      const token = generateToken(req.user._id);
      console.log('🔑 Token generated for user:', req.user._id);

      // Clear the OAuth intent from session
      if (req.session) {
        delete req.session.oauthIntent;
      }

      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL}/patient/dashboard?token=${token}`;
      console.log('🔄 Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Error in Google OAuth callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
    }
  }
);

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      patient: {
        id: req.patient._id,
        firstName: req.patient.firstName,
        lastName: req.patient.lastName,
        email: req.patient.email,
        phone: req.patient.phone,
        dateOfBirth: req.patient.dateOfBirth,
        profilePicture: req.patient.profilePicture,
        isVerified: req.patient.isVerified,
        createdAt: req.patient.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Logout (client-side token removal, but we can track this server-side if needed)
router.post('/logout', auth, async (req, res) => {
  try {
    // In a more advanced implementation, you might want to blacklist the token
    // For now, we'll just send a success response as the client will remove the token
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify token endpoint
router.get('/verify', auth, async (req, res) => {
  try {
    res.json({
      valid: true,
      patient: {
        id: req.patient._id,
        firstName: req.patient.firstName,
        lastName: req.patient.lastName,
        email: req.patient.email
      }
    });
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});

// Forgot password
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find patient by email
    const patient = await Patient.findOne({ email });

    // Always return success message for security (don't reveal if email exists)
    const successMessage = 'If an account with that email exists, we have sent a password reset code.';

    if (!patient) {
      return res.json({ message: successMessage });
    }

    // Check if patient has a password (not Google-only account)
    if (!patient.password && patient.googleId) {
      return res.status(400).json({
        message: 'This account was created with Google. Please use "Continue with Google" to sign in.'
      });
    }

    // Check if patient account is verified
    if (!patient.isEmailVerified) {
      return res.status(400).json({
        message: 'Account not verified. Please verify your email first.'
      });
    }

    // Generate password reset OTP
    const otp = patient.generatePasswordResetOTP();
    await patient.save({ validateBeforeSave: false });

    // Send password reset OTP email
    const emailResult = await emailService.sendPasswordResetOTP(
      patient.email,
      otp,
      patient.firstName
    );

    if (!emailResult.success) {
      console.error('Failed to send password reset OTP:', emailResult.error);
      return res.status(500).json({ message: 'Failed to send password reset code. Please try again.' });
    }

    console.log('📧 Password reset OTP sent to:', email);
    console.log('🔢 OTP:', otp); // For debugging - remove in production
    if (emailResult.previewUrl) {
      console.log('📧 Preview URL:', emailResult.previewUrl);
    }

    res.json({
      message: successMessage,
      ...(process.env.NODE_ENV !== 'production' && emailResult.previewUrl && {
        previewUrl: emailResult.previewUrl
      })
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Send email verification OTP
router.post('/send-verification-otp', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('firstName').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, firstName } = req.body;

    // Check if email already exists and is verified
    const existingPatient = await Patient.findOne({ email });
    if (existingPatient && existingPatient.isEmailVerified && existingPatient.password) {
      return res.status(400).json({
        message: 'Email is already registered and verified. Please use the login page.'
      });
    }

    // Generate OTP - store in memory/cache instead of database
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP temporarily (in a real app, use Redis or similar)
    // For now, we'll still use database but with minimal data
    let patient = existingPatient;
    if (!patient) {
      // Create minimal temporary record for OTP verification only
      patient = new Patient({
        email,
        firstName: firstName || 'User',
        lastName: 'Temp',
        isEmailVerified: false,
        emailVerificationOTP: otp,
        emailVerificationOTPExpires: otpExpires
      });
    } else {
      // Update existing record with new OTP
      patient.emailVerificationOTP = otp;
      patient.emailVerificationOTPExpires = otpExpires;
      patient.isEmailVerified = false; // Reset verification status
    }

    await patient.save({ validateBeforeSave: false });

    // Send OTP email
    console.log('🔄 Attempting to send OTP email...');
    console.log('📧 Email:', email);
    console.log('🔢 OTP:', otp);
    console.log('👤 First Name:', firstName || 'User');

    const emailResult = await emailService.sendEmailVerificationOTP(
      email,
      otp,
      firstName || 'User'
    );

    console.log('📧 Email service result:', emailResult);

    if (!emailResult.success) {
      console.error('Failed to send verification OTP:', emailResult.error);
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    console.log('✅ Email verification OTP sent successfully to:', email);
    console.log('📨 Message ID:', emailResult.messageId);
    if (emailResult.previewUrl) {
      console.log('📧 Preview URL:', emailResult.previewUrl);
    }

    res.json({
      message: 'Verification code sent to your email address.',
      ...(process.env.NODE_ENV !== 'production' && emailResult.previewUrl && {
        previewUrl: emailResult.previewUrl
      })
    });

  } catch (error) {
    console.error('Send verification OTP error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Verify email OTP
router.post('/verify-email-otp', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;

    // Find patient with email and valid OTP
    const patient = await Patient.findOne({
      email,
      emailVerificationOTPExpires: { $gt: Date.now() }
    });

    if (!patient) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    // Verify OTP
    if (!patient.verifyEmailOTP(otp)) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Mark OTP as verified but don't set isEmailVerified yet (will be set during registration)
    patient.otpVerified = true; // Add this field to track OTP verification
    await patient.save({ validateBeforeSave: false });

    console.log('✅ OTP verified successfully for:', email);

    res.json({
      message: 'Email verified successfully! You can now complete your registration.',
      verified: true
    });

  } catch (error) {
    console.error('Verify email OTP error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Debug endpoint to test OTP email (remove in production)
router.post('/debug-send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Generate a test OTP
    const testOTP = '123456';

    // Send OTP email directly
    const emailResult = await emailService.sendEmailVerificationOTP(
      email,
      testOTP,
      'Test User'
    );

    if (!emailResult.success) {
      return res.status(500).json({
        message: 'Failed to send test OTP',
        error: emailResult.error
      });
    }

    res.json({
      message: 'Test OTP sent successfully',
      email: email,
      otp: testOTP, // Only for testing
      messageId: emailResult.messageId,
      ...(emailResult.previewUrl && { previewUrl: emailResult.previewUrl })
    });

  } catch (error) {
    console.error('Debug send OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify password reset OTP
router.post('/verify-password-reset-otp', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;

    // Find patient with email and valid OTP
    const patient = await Patient.findOne({
      email,
      passwordResetOTPExpires: { $gt: Date.now() }
    });

    if (!patient) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Verify OTP
    if (!patient.verifyPasswordResetOTP(otp)) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    console.log('✅ Password reset OTP verified for:', email);

    res.json({
      message: 'Reset code verified successfully! You can now set a new password.',
      verified: true
    });

  } catch (error) {
    console.error('Verify password reset OTP error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Reset password with OTP
router.post('/reset-password-with-otp', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp, newPassword } = req.body;

    // Find patient with email and valid OTP
    const patient = await Patient.findOne({
      email,
      passwordResetOTPExpires: { $gt: Date.now() }
    });

    if (!patient) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Verify OTP
    if (!patient.verifyPasswordResetOTP(otp)) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    // Update password
    patient.password = newPassword;
    patient.clearPasswordResetOTP();
    await patient.save();

    console.log('✅ Password reset successfully for:', email);

    res.json({
      message: 'Password reset successfully! You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password with OTP error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Reset password (legacy token-based - keep for compatibility)
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    // Find patient with valid reset token
    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const patient = await Patient.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!patient) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password
    patient.password = password;
    patient.resetPasswordToken = undefined;
    patient.resetPasswordExpires = undefined;
    await patient.save();

    // Send confirmation email
    const emailResult = await emailService.sendPasswordResetConfirmation(
      patient.email,
      patient.firstName
    );

    if (emailResult.previewUrl) {
      console.log('📧 Confirmation email preview URL:', emailResult.previewUrl);
    }

    console.log('✅ Password reset successful for:', patient.email);

    res.json({
      message: 'Password reset successful. You can now log in with your new password.',
      ...(process.env.NODE_ENV !== 'production' && emailResult.previewUrl && {
        confirmationEmailPreview: emailResult.previewUrl
      })
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ==================== DOCTOR AUTHENTICATION ROUTES ====================

// Generate JWT token for doctor
const generateDoctorToken = (doctorId) => {
  return jwt.sign({ doctorId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Generate JWT token for pharmacist
const generatePharmacistToken = (pharmacistId) => {
  return jwt.sign({ pharmacistId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Doctor login
router.post('/doctor/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
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

    const { email, password } = req.body;

    // Find doctor by email
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (doctor.availability !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the administrator.',
        accountStatus: 'inactive'
      });
    }

    // Check password
    const isMatch = await doctor.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await doctor.updateLastLogin();

    // Generate token
    const token = generateDoctorToken(doctor._id);

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      token,
      doctor: {
        id: doctor._id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        email: doctor.email,
        specialization: doctor.specialization,
        position: doctor.position,
        profileImage: doctor.profileImage
      }
    });

  } catch (error) {
    console.error('Doctor login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
});

// Doctor logout (optional - mainly for clearing server-side sessions if needed)
router.post('/doctor/logout', async (req, res) => {
  try {
    // In a JWT-based system, logout is mainly handled client-side
    // But we can add any server-side cleanup here if needed
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Doctor logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// ==================== PHARMACIST AUTHENTICATION ROUTES ====================

// Pharmacist login
router.post('/pharmacist/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
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

    const { email, password } = req.body;

    // Find pharmacist by email
    const pharmacist = await Pharmacist.findOne({ email });
    if (!pharmacist) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (pharmacist.availability !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the administrator.',
        accountStatus: 'inactive'
      });
    }

    // Check password
    const isMatch = await pharmacist.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await pharmacist.updateLastLogin();

    // Generate token
    const token = generatePharmacistToken(pharmacist._id);

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      token,
      pharmacist: {
        id: pharmacist._id,
        firstName: pharmacist.firstName,
        lastName: pharmacist.lastName,
        name: pharmacist.name,
        email: pharmacist.email,
        department: pharmacist.department,
        specialization: pharmacist.specialization,
        shift: pharmacist.shift,
        profileImage: pharmacist.profileImage
      }
    });

  } catch (error) {
    console.error('Pharmacist login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
});

// Pharmacist logout
router.post('/pharmacist/logout', async (req, res) => {
  try {
    // In a JWT-based system, logout is mainly handled client-side
    // But we can add any server-side cleanup here if needed
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Pharmacist logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

module.exports = router;