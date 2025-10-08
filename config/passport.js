const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Patient = require('../models/Patient');

passport.use('google', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:5000/api/auth/google/callback",
  passReqToCallback: true // This allows us to access req.session
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    console.log('🔍 Google OAuth strategy called');
    console.log('Profile ID:', profile.id);
    console.log('Profile Email:', profile.emails?.[0]?.value);
    console.log('Session data:', req.session);
    console.log('OAuth intent:', req.session ? req.session.oauthIntent : 'undefined');

    // Ensure we have required profile data
    if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
      console.error('❌ No email found in Google profile');
      return done(new Error('No email found in Google profile'), null);
    }

    const email = profile.emails[0].value;
    const profilePicture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

    console.log('👤 Google profile email:', email);
    console.log('🖼️ Google profile picture URL:', profilePicture);
    console.log('📸 Google profile photos array:', profile.photos);

    // Check if patient already exists with Google ID
    let patient = await Patient.findOne({ googleId: profile.id });

    if (patient) {
      console.log('✅ Found existing patient with Google ID');
      // Update profile picture if it's changed
      if (profilePicture && patient.profilePicture !== profilePicture) {
        patient.profilePicture = profilePicture;
        await patient.save();
      }
      return done(null, patient);
    }

    // Check if email already exists
    patient = await Patient.findOne({ email });

    if (patient) {
      console.log('✅ Found existing patient with email, linking Google account');
      // Link Google account to existing patient
      patient.googleId = profile.id;
      if (profilePicture) {
        patient.profilePicture = profilePicture;
      }
      patient.isEmailVerified = true; // Mark as verified since Google account is verified
      await patient.save();
      return done(null, patient);
    }

    // Get the OAuth intent from session
    const oauthIntent = req.session ? req.session.oauthIntent : 'signup';
    console.log('🔍 OAuth intent:', oauthIntent);

    // If this is a login attempt and no account exists, return error
    if (oauthIntent === 'login') {
      console.log('❌ Login attempt with non-existent Google account');
      return done(null, false, { message: 'No account found with this Google account. Please sign up first.' });
    }

    // Only create new patient if this is a signup attempt
    if (oauthIntent === 'signup') {
      console.log('✅ Creating new patient account for Google signup');
      patient = new Patient({
        googleId: profile.id,
        firstName: profile.name.givenName || 'Unknown',
        lastName: profile.name.familyName || 'User',
        email,
        profilePicture,
        isEmailVerified: true,
        agreeToTerms: true // Auto-agree for Google OAuth users
      });

      await patient.save();
      console.log('✅ New patient created:', patient._id);
      return done(null, patient);
    }

    // Fallback - should not reach here
    console.log('❌ Invalid OAuth flow');
    return done(null, false, { message: 'Invalid OAuth flow' });
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    console.error('Error stack:', error.stack);
    done(error, null);
  }
}));

passport.serializeUser((patient, done) => {
  done(null, patient.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const patient = await Patient.findById(id);
    done(null, patient);
  } catch (error) {
    done(error, null);
  }
});