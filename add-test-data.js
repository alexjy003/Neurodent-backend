const mongoose = require('mongoose');
const Doctor = require('./models/Doctor');
const Pharmacist = require('./models/Pharmacist');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function addTestData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if test doctor already exists
    const existingDoctor = await Doctor.findOne({ email: 'test.doctor@example.com' });
    
    if (!existingDoctor) {
      // Add test doctor
      const testDoctor = new Doctor({
        firstName: 'Dr. John',
        lastName: 'Smith',
        email: 'test.doctor@example.com',
        password: 'password123', // Will be hashed automatically
        phone: '1234567890',
        dateOfBirth: new Date('1980-01-01'),
        gender: 'male',
        specialization: 'General Dentistry',
        experience: '10 years',
        position: 'Senior Doctor',
        bio: 'Experienced general dentist with 10 years of practice.',
        availability: 'active'
      });

      await testDoctor.save();
      console.log('Test doctor added successfully');
    } else {
      console.log('Test doctor already exists');
    }

    // Check if test pharmacist already exists
    const existingPharmacist = await Pharmacist.findOne({ email: 'test.pharmacist@example.com' });
    
    if (!existingPharmacist) {
      // Add test pharmacist
      const testPharmacist = new Pharmacist({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'test.pharmacist@example.com',
        password: 'password123', // Will be hashed automatically
        phone: '1234567891',
        dateOfBirth: new Date('1985-05-15'),
        gender: 'Female',
        shift: 'Full-time',
        department: 'Pharmacy',
        specialization: 'Clinical Pharmacy',
        availability: 'Active'
      });

      await testPharmacist.save();
      console.log('Test pharmacist added successfully');
    } else {
      console.log('Test pharmacist already exists');
    }

    // Get counts
    const doctorCount = await Doctor.countDocuments();
    const pharmacistCount = await Pharmacist.countDocuments();
    
    console.log(`Total doctors: ${doctorCount}`);
    console.log(`Total pharmacists: ${pharmacistCount}`);

  } catch (error) {
    console.error('Error adding test data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

addTestData();