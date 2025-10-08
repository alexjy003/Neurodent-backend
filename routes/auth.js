const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const passport = require('passport');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Pharmacist = require('../models/Pharmacist');
const Admin = require('../models/Admin');
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

    console.log('📝 About to save patient:', {
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      isEmailVerified: patient.isEmailVerified,
      otpVerified: patient.otpVerified,
      agreeToTerms: patient.agreeToTerms
    });

    await patient.save();
    console.log('✅ Patient saved successfully with ID:', patient._id);

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
    console.error('❌ Registration error:', error);
    console.error('❌ Registration error stack:', error.stack);
    console.error('❌ Registration error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });
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

// Debug endpoint to check session
router.get('/debug-session', (req, res) => {
  console.log('🔍 Debug session endpoint hit');
  console.log('Session:', req.session);
  console.log('Query params:', req.query);
  res.json({
    session: req.session,
    queryParams: req.query,
    timestamp: new Date().toISOString()
  });
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
    console.log('📝 Session before setting intent:', req.session);
    // Store the intent in session to distinguish login vs signup
    req.session.oauthIntent = 'signup';
    console.log('📝 Session after setting intent:', req.session);
    console.log('📝 Request query params:', req.query);
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
    console.log('Error parameter:', req.query.error);

    // Check if there's an OAuth error
    if (req.query.error) {
      console.log('❌ OAuth error from Google:', req.query.error);
      const frontendUrl = process.env.FRONTEND_URL.split(',')[0].trim();
      return res.redirect(`${frontendUrl}/register?error=google_oauth_denied`);
    }

    // Check if we already processed this authorization code
    if (req.session && req.session.processedCode === req.query.code) {
      console.log('⚠️ Duplicate callback detected, redirecting to dashboard');
      const frontendUrl = process.env.FRONTEND_URL.split(',')[0].trim();
      return res.redirect(`${frontendUrl}/patient/dashboard`);
    }

    // Store the code to prevent duplicate processing
    if (req.session && req.query.code) {
      req.session.processedCode = req.query.code;
    }

    // Store state in session as backup
    if (req.query.state) {
      // Only update if session doesn't already have oauthIntent
      if (!req.session || !req.session.oauthIntent) {
        req.session.oauthIntent = req.query.state;
      }
    }

    next();
  },
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL.split(',')[0].trim()}/register?error=google_auth_failed`,
    failureMessage: true
  }),
  (req, res) => {
    try {
      console.log('🔍 Post-authentication callback');
      console.log('Req.user:', req.user ? 'Present' : 'Missing');
      console.log('User ID:', req.user ? req.user._id : 'N/A');
      console.log('User details:', req.user ? { email: req.user.email, firstName: req.user.firstName } : 'N/A');

      // Check if authentication failed (user is false)
      if (!req.user) {
        console.log('❌ Google OAuth authentication failed - no user');
        const frontendUrl = process.env.FRONTEND_URL.split(',')[0].trim();
        
        // Always redirect to register with error for failed authentication
        return res.redirect(`${frontendUrl}/register?error=google_auth_failed`);
      }

      console.log('✅ Google OAuth authentication successful');
      console.log('User:', req.user.firstName, req.user.email);

      // Generate token
      const token = generateToken(req.user._id);
      console.log('🔑 Token generated for user:', req.user._id);

      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL.split(',')[0].trim(); // Use only the first URL
      
      // Check OAuth intent from session or state parameter BEFORE clearing session
      const oauthIntent = req.session ? req.session.oauthIntent : (req.query.state || 'login');
      console.log('🔍 OAuth intent determined:', oauthIntent);
      console.log('🔍 Session oauthIntent:', req.session ? req.session.oauthIntent : 'undefined');
      console.log('🔍 Query state:', req.query.state);
      
      // Clear the OAuth intent and processed code from session AFTER getting the intent
      if (req.session) {
        delete req.session.oauthIntent;
        delete req.session.processedCode;
      }
      
      // Always redirect to patient dashboard for successful Google OAuth
      const redirectUrl = `${frontendUrl}/patient/dashboard?token=${token}`;
      console.log('🔄 Google OAuth successful, redirecting to patient dashboard:', redirectUrl);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Error in Google OAuth callback:', error);
      console.error('Error stack:', error.stack);
      const frontendUrl = process.env.FRONTEND_URL.split(',')[0].trim();
      res.redirect(`${frontendUrl}/register?error=google_auth_failed`);
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

// Verify token endpoint - Universal version
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }

    // Check if it's a mock admin token
    if (token.startsWith('admin_token_')) {
      const tokenParts = token.split('_');
      if (tokenParts.length >= 3) {
        const timestamp = parseInt(tokenParts[2]);
        const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);
        
        if (timestamp > eightHoursAgo) {
          return res.json({
            valid: true,
            user: {
              id: 'admin-1',
              firstName: 'Admin',
              lastName: 'User',
              email: 'admin@gmail.com',
              userType: 'admin'
            }
          });
        } else {
          return res.status(401).json({ valid: false, message: 'Admin token expired' });
        }
      } else {
        return res.status(401).json({ valid: false, message: 'Invalid admin token format' });
      }
    }

    // Try to verify as JWT token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      let user = null;
      let userType = null;

      // Check what type of token it is based on the decoded content
      if (decoded.patientId) {
        const patient = await Patient.findById(decoded.patientId).select('-password');
        if (patient) {
          console.log('🔍 Patient auth debug:', {
            patientName: `${patient.firstName} ${patient.lastName}`,
            profilePicture: patient.profilePicture,
            profileImageUrl: patient.profileImage?.url,
            hasProfilePicture: !!patient.profilePicture,
            hasProfileImageUrl: !!patient.profileImage?.url
          });
          
          user = {
            id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            phone: patient.phone,
            dateOfBirth: patient.dateOfBirth,
            profilePicture: patient.profilePicture || patient.profileImage?.url,
            userType: 'patient'
          };
          userType = 'patient';
        }
      } else if (decoded.doctorId) {
        const doctor = await Doctor.findById(decoded.doctorId).select('-password');
        if (doctor && doctor.availability === 'active') {
          user = {
            id: doctor._id,
            firstName: doctor.firstName,
            lastName: doctor.lastName,
            email: doctor.email,
            specialization: doctor.specialization,
            position: doctor.position,
            profileImage: doctor.profileImage,
            userType: 'doctor'
          };
          userType = 'doctor';
        }
      } else if (decoded.pharmacistId) {
        const pharmacist = await Pharmacist.findById(decoded.pharmacistId).select('-password');
        if (pharmacist && pharmacist.availability === 'Active') {
          user = {
            id: pharmacist._id,
            firstName: pharmacist.firstName,
            lastName: pharmacist.lastName,
            name: pharmacist.name,
            email: pharmacist.email,
            department: pharmacist.department,
            specialization: pharmacist.specialization,
            shift: pharmacist.shift,
            profileImage: pharmacist.profileImage,
            availability: pharmacist.availability,
            userType: 'pharmacist'
          };
          userType = 'pharmacist';
        }
      } else if (decoded.adminId) {
        // Handle regular admin JWT tokens if they exist
        user = {
          id: decoded.adminId,
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@gmail.com',
          role: 'admin',
          userType: 'admin'
        };
        userType = 'admin';
      }

      if (!user) {
        return res.status(401).json({ valid: false, message: 'User not found or inactive' });
      }

      console.log(`✅ Token verification successful for ${userType}:`, user.email);

      res.json({
        valid: true,
        user: user,
        // For backward compatibility, also include as 'patient' if it's a patient
        ...(userType === 'patient' && { patient: user })
      });

    } catch (jwtError) {
      console.error('❌ JWT verification failed:', jwtError.message);
      return res.status(401).json({ valid: false, message: 'Invalid token' });
    }

  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(401).json({ valid: false, message: 'Token verification failed' });
  }
});

// Universal Forgot password (for patients, doctors, and pharmacists)
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Always return success message for security (don't reveal if email exists)
    const successMessage = 'If an account with that email exists, we have sent a password reset code.';

    // Search for user across all user types
    let user = null;
    let userType = null;

    // Check in patients first
    user = await Patient.findOne({ email });
    if (user) {
      userType = 'patient';
    }

    // If not found in patients, check in doctors
    if (!user) {
      user = await Doctor.findOne({ email });
      if (user) {
        userType = 'doctor';
      }
    }

    // If not found in doctors, check in pharmacists
    if (!user) {
      user = await Pharmacist.findOne({ email });
      if (user) {
        userType = 'pharmacist';
      }
    }

    // If user not found in any collection, return success message (for security)
    if (!user) {
      return res.json({ message: successMessage });
    }

    // Check if patient has Google-only account (only applicable to patients)
    if (userType === 'patient' && !user.password && user.googleId) {
      return res.status(400).json({
        message: 'This account was created with Google. Please use "Continue with Google" to sign in.'
      });
    }

    // Check if patient account is verified (only applicable to patients)
    if (userType === 'patient' && !user.isEmailVerified) {
      return res.status(400).json({
        message: 'Account not verified. Please verify your email first.'
      });
    }

    // Generate password reset OTP
    const otp = user.generatePasswordResetOTP();
    await user.save({ validateBeforeSave: false });

    // Send password reset OTP email
    const emailResult = await emailService.sendPasswordResetOTP(
      user.email,
      otp,
      user.firstName
    );

    if (!emailResult.success) {
      console.error('Failed to send password reset OTP:', emailResult.error);
      return res.status(500).json({ message: 'Failed to send password reset code. Please try again.' });
    }

    console.log('📧 Password reset OTP sent to:', email, `(${userType})`);
    console.log('🔢 OTP:', otp); // For debugging - remove in production
    if (emailResult.previewUrl) {
      console.log('📧 Preview URL:', emailResult.previewUrl);
    }

    res.json({
      message: successMessage,
      userType: userType, // Include user type in response for frontend handling
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

// Check email verification status
router.get('/check-email-verification', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find patient with the email
    const patient = await Patient.findOne({ email });

    if (!patient) {
      return res.json({ verified: false, message: 'No patient found with this email' });
    }

    // Check if patient has verified OTP and is not fully registered yet
    if (patient.otpVerified && !patient.isEmailVerified) {
      return res.json({ verified: true, message: 'Email verified, ready for registration' });
    }

    // If patient is fully registered, they need to login instead
    if (patient.isEmailVerified && patient.password) {
      return res.json({ verified: false, message: 'Patient already registered, please login' });
    }

    return res.json({ verified: false, message: 'Email not verified' });

  } catch (error) {
    console.error('Check email verification error:', error);
    res.status(500).json({ message: 'Server error', verified: false });
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

// Universal Verify password reset OTP (for patients, doctors, and pharmacists)
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

    // Search for user across all user types with valid OTP
    let user = null;
    let userType = null;

    // Check in patients first
    user = await Patient.findOne({
      email,
      passwordResetOTPExpires: { $gt: Date.now() }
    });
    if (user) {
      userType = 'patient';
    }

    // If not found in patients, check in doctors
    if (!user) {
      user = await Doctor.findOne({
        email,
        passwordResetOTPExpires: { $gt: Date.now() }
      });
      if (user) {
        userType = 'doctor';
      }
    }

    // If not found in doctors, check in pharmacists
    if (!user) {
      user = await Pharmacist.findOne({
        email,
        passwordResetOTPExpires: { $gt: Date.now() }
      });
      if (user) {
        userType = 'pharmacist';
      }
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Verify OTP
    if (!user.verifyPasswordResetOTP(otp)) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    console.log('✅ Password reset OTP verified for:', email, `(${userType})`);

    res.json({
      message: 'Reset code verified successfully! You can now set a new password.',
      verified: true,
      userType: userType
    });

  } catch (error) {
    console.error('Verify password reset OTP error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Universal Reset password with OTP (for patients, doctors, and pharmacists)
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

    // Search for user across all user types with valid OTP
    let user = null;
    let userType = null;

    // Check in patients first
    user = await Patient.findOne({
      email,
      passwordResetOTPExpires: { $gt: Date.now() }
    });
    if (user) {
      userType = 'patient';
    }

    // If not found in patients, check in doctors
    if (!user) {
      user = await Doctor.findOne({
        email,
        passwordResetOTPExpires: { $gt: Date.now() }
      });
      if (user) {
        userType = 'doctor';
      }
    }

    // If not found in doctors, check in pharmacists
    if (!user) {
      user = await Pharmacist.findOne({
        email,
        passwordResetOTPExpires: { $gt: Date.now() }
      });
      if (user) {
        userType = 'pharmacist';
      }
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Verify OTP
    if (!user.verifyPasswordResetOTP(otp)) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    // Update password
    user.password = newPassword;
    user.clearPasswordResetOTP();
    await user.save();

    console.log('✅ Password reset successfully for:', email, `(${userType})`);

    res.json({
      message: 'Password reset successfully! You can now login with your new password.',
      userType: userType
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

// Generate JWT token for admin
const generateAdminToken = (adminId) => {
  return jwt.sign({ adminId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// ==================== UNIVERSAL LOGIN ROUTE ====================

// Universal login that checks all user types
router.post('/universal-login', [
  body('email').notEmpty().withMessage('Email or User ID is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  console.log('🔍 Universal login endpoint hit');
  console.log('🔍 Request body:', req.body);
  console.log('🔍 Request headers:', req.headers);
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    console.log('🔍 Universal login attempt:', { email, passwordLength: password?.length });

    // Try to find user in all collections
    let user = null;
    let userType = null;
    let token = null;

    // Check for hardcoded admin credentials (temporary solution)
    console.log('🔍 Checking admin credentials:', email === 'admin@gmail.com', password === 'Admin@123');
    if (email === 'admin@gmail.com' && password === 'Admin@123') {
      // Create mock admin user
      user = {
        _id: 'admin-1',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@gmail.com',
        role: 'admin'
      };
      userType = 'admin';
      // Use mock admin token format that the middleware expects
      token = `admin_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Check Doctor collection
    if (!user) {
      const doctor = await Doctor.findOne({ email });
      if (doctor && doctor.availability === 'active') {
        const isMatch = await doctor.comparePassword(password);
        if (isMatch) {
          user = doctor;
          userType = 'doctor';
          token = generateDoctorToken(doctor._id);
          // Update last login
          await doctor.updateLastLogin();
        }
      }
    }

    // Check Pharmacist collection
    if (!user) {
      const pharmacist = await Pharmacist.findOne({ email });
      if (pharmacist && pharmacist.availability === 'Active') {
        const isMatch = await pharmacist.comparePassword(password);
        if (isMatch) {
          user = pharmacist;
          userType = 'pharmacist';
          token = generatePharmacistToken(pharmacist._id);
          // Update last login
          await pharmacist.updateLastLogin();
        }
      }
    }

    // Check Patient collection
    if (!user) {
      console.log('🔍 Checking Patient collection for:', email);
      const patient = await Patient.findOne({ email });
      console.log('🔍 Patient found:', !!patient);
      if (patient) {
        console.log('🔍 Patient details:', {
          id: patient._id,
          email: patient.email,
          firstName: patient.firstName,
          hasPassword: !!patient.password
        });
        const isMatch = await patient.comparePassword(password);
        console.log('🔍 Password match result:', isMatch);
        if (isMatch) {
          user = patient;
          userType = 'patient';
          token = generateToken(patient._id);
          console.log('✅ Patient login successful, token generated');
        } else {
          console.log('❌ Patient password mismatch');
        }
      } else {
        console.log('❌ No patient found with email:', email);
      }
    }

    // If no user found in any collection
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Prepare user response based on type
    let userResponse = {};
    switch (userType) {
      case 'admin':
        userResponse = {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          userType: 'admin'
        };
        break;
      case 'doctor':
        userResponse = {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          specialization: user.specialization,
          position: user.position,
          profileImage: user.profileImage,
          userType: 'doctor'
        };
        break;
      case 'pharmacist':
        userResponse = {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.name,
          email: user.email,
          department: user.department,
          specialization: user.specialization,
          shift: user.shift,
          profileImage: user.profileImage,
          availability: user.availability,
          userType: 'pharmacist'
        };
        break;
      case 'patient':
        userResponse = {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          profilePicture: user.profilePicture,
          userType: 'patient'
        };
        break;
      default:
        userResponse = {
          id: user._id,
          email: user.email,
          userType: userType
        };
    }

    console.log(`✅ Universal login successful for ${userType}:`, userResponse.email);

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Universal login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
});

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

// Patient Profile Routes

// Get patient profile
router.get('/patient/profile', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.patientId).select('-password -resetPasswordToken -passwordResetOTP -emailVerificationOTP');
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    res.json({
      success: true,
      patient: patient
    });

  } catch (error) {
    console.error('Error fetching patient profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update patient profile
router.put('/patient/profile', auth, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('dateOfBirth').optional().custom((value) => {
    if (!value) return true; // Allow empty values
    // Accept both ISO string and date-only format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (dateRegex.test(value) || isoRegex.test(value)) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      return true;
    }
    throw new Error('Date must be in YYYY-MM-DD or ISO format');
  }),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Invalid gender'),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zipCode').optional().trim()
], async (req, res) => {
  try {
    console.log('🔍 Profile update request received:', {
      body: req.body,
      userPatientId: req.user?.patientId
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Profile update validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const allowedUpdates = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender', 'address', 'city', 'state', 'zipCode'];
    const updates = {};

    // Only include fields that are in allowedUpdates and present in request
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Check if email is being updated and if it already exists
    if (updates.email) {
      const existingPatient = await Patient.findOne({ 
        email: updates.email, 
        _id: { $ne: req.user.patientId } 
      });
      
      if (existingPatient) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use by another patient'
        });
      }
    }

    const patient = await Patient.findByIdAndUpdate(
      req.user.patientId,
      updates,
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -passwordResetOTP -emailVerificationOTP');

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      patient: patient
    });

  } catch (error) {
    console.error('Error updating patient profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Verify token and return current user
router.get('/verify', auth, async (req, res) => {
  try {
    // Get user data based on the auth middleware result
    const patient = await Patient.findById(req.user.patientId)
      .select('-password -resetPasswordToken -passwordResetOTP -emailVerificationOTP');
    
    if (!patient) {
      return res.status(404).json({
        valid: false,
        message: 'Patient not found'
      });
    }

    res.json({
      valid: true,
      user: {
        id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        address: patient.address,
        city: patient.city,
        state: patient.state,
        zipCode: patient.zipCode,
        profilePicture: patient.profilePicture,
        userType: 'patient'
      }
    });

  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({
      valid: false,
      message: 'Server error'
    });
  }
});

module.exports = router;