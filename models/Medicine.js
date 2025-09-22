const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Medicine name is required'],
    trim: true,
    maxlength: [100, 'Medicine name cannot exceed 100 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Antibiotics',
      'Painkillers',
      'Anti-inflammatory',
      'Antiseptic',
      'Anesthetic',
      'Dental Filling',
      'Dental Cement',
      'Oral Care',
      'Surgical',
      'Vitamins',
      'Other'
    ]
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Unit price cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR']
  },
  stockQuantity: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock quantity cannot be negative'],
    default: 0
  },
  minStockLevel: {
    type: Number,
    required: [true, 'Minimum stock level is required'],
    min: [0, 'Minimum stock level cannot be negative'],
    default: 10
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  manufacturer: {
    type: String,
    required: [true, 'Manufacturer is required'],
    trim: true,
    maxlength: [100, 'Manufacturer name cannot exceed 100 characters']
  },
  image: {
    url: {
      type: String,
      trim: true
    },
    publicId: {
      type: String,
      trim: true
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
medicineSchema.index({ name: 1 });
medicineSchema.index({ category: 1 });
medicineSchema.index({ expiryDate: 1 });
medicineSchema.index({ stockQuantity: 1 });

// Virtual for checking if medicine is expired
medicineSchema.virtual('isExpired').get(function() {
  return this.expiryDate < new Date();
});

// Virtual for checking if medicine is low in stock
medicineSchema.virtual('isLowStock').get(function() {
  return this.stockQuantity <= this.minStockLevel;
});

// Virtual for checking if medicine is out of stock
medicineSchema.virtual('isOutOfStock').get(function() {
  return this.stockQuantity === 0;
});

// Virtual for days until expiry
medicineSchema.virtual('daysUntilExpiry').get(function() {
  const now = new Date();
  const diffTime = this.expiryDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to ensure data consistency
medicineSchema.pre('save', function(next) {
  next();
});

// Static method to find medicines that need restocking
medicineSchema.statics.findLowStock = function() {
  return this.find({
    $expr: { $lte: ['$stockQuantity', '$minStockLevel'] }
  });
};

// Static method to find expired medicines
medicineSchema.statics.findExpired = function() {
  return this.find({
    expiryDate: { $lt: new Date() }
  });
};

// Static method to find medicines expiring soon (within 30 days)
medicineSchema.statics.findExpiringSoon = function(days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    expiryDate: { 
      $gte: new Date(),
      $lte: futureDate 
    }
  });
};

// Instance method to restock medicine
medicineSchema.methods.restock = function(quantity, updatedBy) {
  this.stockQuantity += quantity;
  this.lastUpdatedBy = updatedBy;
  
  return this.save();
};

// Instance method to reduce stock
medicineSchema.methods.reduceStock = function(quantity, updatedBy) {
  if (this.stockQuantity < quantity) {
    throw new Error('Insufficient stock');
  }
  
  this.stockQuantity -= quantity;
  this.lastUpdatedBy = updatedBy;
  
  return this.save();
};

// Ensure virtual fields are serialized
medicineSchema.set('toJSON', { virtuals: true });
medicineSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Medicine', medicineSchema);