const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Schedule = require('../models/Schedule');

async function removeNotesField() {
  try {
    console.log('Connecting to MongoDB...');
    
    // Remove notes field from all schedule documents
    const result = await Schedule.updateMany(
      {}, 
      { $unset: { notes: "" } }
    );
    
    console.log(`Updated ${result.modifiedCount} documents, removed notes field`);
    
    // Verify the field is removed
    const sampleDoc = await Schedule.findOne({});
    if (sampleDoc) {
      console.log('Sample document after update:', JSON.stringify(sampleDoc.toObject(), null, 2));
    }
    
    console.log('Notes field successfully removed from all schedule documents');
    process.exit(0);
  } catch (error) {
    console.error('Error removing notes field:', error);
    process.exit(1);
  }
}

removeNotesField();
