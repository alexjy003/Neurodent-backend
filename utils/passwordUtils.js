const crypto = require('crypto');

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 10)
 * @returns {string} Generated password
 */
function generateSecurePassword(length = 10) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';
  let password = '';
  
  // Ensure at least one character from each required type
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '@#$%&*';
  
  // Add at least one character from each required category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password to randomize character positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Generate a memorable but secure password
 * @returns {string} Generated password
 */
function generateMemorablePassword() {
  const adjectives = ['Smart', 'Quick', 'Bright', 'Strong', 'Swift', 'Bold', 'Sharp', 'Clear'];
  const nouns = ['Tiger', 'Eagle', 'Storm', 'Ocean', 'Mountain', 'River', 'Star', 'Fire'];
  const numbers = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const symbols = '@#$%&*';
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${adjective}${noun}${numbers}${symbol}`;
}

module.exports = {
  generateSecurePassword,
  generateMemorablePassword
};