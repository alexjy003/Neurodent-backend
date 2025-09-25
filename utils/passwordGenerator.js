const crypto = require('crypto');

/**
 * Generate a secure random password
 * @param {number} length - Length of the password (default: 12)
 * @param {object} options - Options for password generation
 * @returns {string} - Generated password
 */
const generatePassword = (length = 12, options = {}) => {
  const {
    includeUppercase = true,
    includeLowercase = true,
    includeNumbers = true,
    includeSymbols = true,
    excludeAmbiguous = true
  } = options;

  let charset = '';
  
  if (includeLowercase) {
    charset += excludeAmbiguous ? 'abcdefghijkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
  }
  
  if (includeUppercase) {
    charset += excludeAmbiguous ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  }
  
  if (includeNumbers) {
    charset += excludeAmbiguous ? '23456789' : '0123456789';
  }
  
  if (includeSymbols) {
    charset += '!@#$%^&*';
  }

  if (charset === '') {
    throw new Error('At least one character set must be included');
  }

  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }

  return password;
};

/**
 * Generate a doctor-friendly password (readable and secure)
 * @returns {string} - Generated password
 */
const generateDoctorPassword = () => {
  return generatePassword(10, {
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: false,
    excludeAmbiguous: true
  });
};

/**
 * Generate a simple numeric OTP
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} - Generated OTP
 */
const generateOTP = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
};

/**
 * Generate a secure token for password reset
 * @returns {string} - Generated token
 */
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = {
  generatePassword,
  generateDoctorPassword,
  generateOTP,
  generateSecureToken
};