const mongoose = require('mongoose');
require('dotenv').config();
const Doctor = require('./models/Doctor');

async function checkDoctors() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const doctors = await Doctor.find({}, 'firstName lastName email availability').limit(3);
    console.log('📋 Sample doctors in database:');
    doctors.forEach(doc => {
      console.log(`- ${doc.firstName} ${doc.lastName} (${doc.email}) - Status: ${doc.availability}`);
    });
    
    await mongoose.disconnect();
    console.log('✅ Database check complete');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDoctors();