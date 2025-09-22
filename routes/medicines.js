const express = require('express');
const { validationResult, body, query } = require('express-validator');
const Medicine = require('../models/Medicine');
const Admin = require('../models/Admin');
const adminAuth = require('../middleware/adminAuth');
const { uploadSingle, handleUploadResponse } = require('../middleware/cloudinaryUpload');
const { cloudinary } = require('../config/cloudinary');

const router = express.Router();

// Validation rules for creating/updating medicine
const medicineValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Medicine name is required')
    .isLength({ max: 100 })
    .withMessage('Medicine name cannot exceed 100 characters'),
  
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn([
      'Antibiotics', 'Painkillers', 'Anti-inflammatory', 'Antiseptic',
      'Anesthetic', 'Dental Filling', 'Dental Cement', 'Oral Care',
      'Surgical', 'Vitamins', 'Other'
    ])
    .withMessage('Invalid category'),
  
  body('unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a positive number'),
  
  body('stockQuantity')
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a non-negative integer'),
  
  body('minStockLevel')
    .isInt({ min: 0 })
    .withMessage('Minimum stock level must be a non-negative integer'),
  
  body('expiryDate')
    .isISO8601()
    .withMessage('Invalid expiry date format')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),
  
  body('manufacturer')
    .trim()
    .notEmpty()
    .withMessage('Manufacturer is required')
    .isLength({ max: 100 })
    .withMessage('Manufacturer name cannot exceed 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

// GET /api/medicines - Get all medicines with filtering and pagination
router.get('/', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('sortBy').optional().isIn(['name', 'category', 'unitPrice', 'stockQuantity', 'expiryDate', 'createdAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
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

    const {
      page = 1,
      limit = 20,
      category,
      search,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (category) filter.category = category;
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute queries
    const [medicines, total] = await Promise.all([
      Medicine.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'firstName lastName')
        .populate('lastUpdatedBy', 'firstName lastName'),
      Medicine.countDocuments(filter)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        medicines,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage
        }
      }
    });

  } catch (error) {
    console.error('Error fetching medicines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicines',
      error: error.message
    });
  }
});

// GET /api/medicines/stats - Get medicine inventory statistics
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [
      totalMedicines,
      expiredMedicines,
      outOfStockMedicines,
      lowStockMedicines,
      expiringSoonMedicines
    ] = await Promise.all([
      Medicine.countDocuments(),
      Medicine.findExpired().countDocuments(),
      Medicine.countDocuments({ stockQuantity: 0 }),
      Medicine.countDocuments({
        $expr: { $lte: ['$stockQuantity', '$minStockLevel'] }
      }),
      Medicine.countDocuments({
        expiryDate: { 
          $gte: new Date(),
          $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        }
      })
    ]);

    // Calculate total inventory value
    const inventoryValue = await Medicine.aggregate([
      { $match: { stockQuantity: { $gt: 0 } } },
      { $group: { _id: null, totalValue: { $sum: { $multiply: ['$unitPrice', '$stockQuantity'] } } } }
    ]);

    const totalValue = inventoryValue.length > 0 ? inventoryValue[0].totalValue : 0;

    res.json({
      success: true,
      data: {
        totalMedicines,
        expiredMedicines,
        outOfStockMedicines,
        lowStockMedicines,
        expiringSoonMedicines,
        totalInventoryValue: totalValue
      }
    });

  } catch (error) {
    console.error('Error fetching medicine stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicine statistics',
      error: error.message
    });
  }
});

// GET /api/medicines/low-stock - Get medicines with low stock
router.get('/low-stock', adminAuth, async (req, res) => {
  try {
    const lowStockMedicines = await Medicine.findLowStock()
      .populate('createdBy', 'firstName lastName')
      .sort({ stockQuantity: 1 });

    res.json({
      success: true,
      data: lowStockMedicines
    });

  } catch (error) {
    console.error('Error fetching low stock medicines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock medicines',
      error: error.message
    });
  }
});

// GET /api/medicines/expiring-soon - Get medicines expiring soon
router.get('/expiring-soon', adminAuth, [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
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

    const days = parseInt(req.query.days) || 30;
    
    const expiringSoonMedicines = await Medicine.findExpiringSoon(days)
      .populate('createdBy', 'firstName lastName')
      .sort({ expiryDate: 1 });

    res.json({
      success: true,
      data: expiringSoonMedicines
    });

  } catch (error) {
    console.error('Error fetching expiring medicines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expiring medicines',
      error: error.message
    });
  }
});

// GET /api/medicines/:id - Get a specific medicine
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    res.json({
      success: true,
      data: medicine
    });

  } catch (error) {
    console.error('Error fetching medicine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicine',
      error: error.message
    });
  }
});

// POST /api/medicines - Create a new medicine
router.post('/', adminAuth, uploadSingle('image'), handleUploadResponse, medicineValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if medicine with same name already exists (case-insensitive)
    const existingMedicine = await Medicine.findOne({
      name: { $regex: new RegExp(`^${req.body.name.trim()}$`, 'i') }
    });

    if (existingMedicine) {
      return res.status(400).json({
        success: false,
        message: 'Medicine with this name already exists'
      });
    }

    // Find or create admin user
    let adminUser = await Admin.findOne({ email: 'admin@gmail.com' });
    if (!adminUser) {
      adminUser = new Admin({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@gmail.com',
        role: 'admin'
      });
      await adminUser.save();
    }

    const medicineData = {
      ...req.body,
      currency: 'INR', // Force currency to INR (Rupees)
      createdBy: adminUser._id // Use the admin user's ObjectId
    };

    // Add image data if uploaded
    if (req.file) {
      console.log('📸 Image file uploaded:', {
        path: req.file.path,
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      
      medicineData.image = {
        url: req.file.path,
        publicId: req.file.filename
      };
      
      console.log('💾 Image data to save:', medicineData.image);
    } else {
      console.log('❌ No image file uploaded');
    }

    console.log('📋 Complete medicine data before save:', JSON.stringify(medicineData, null, 2));

    const medicine = new Medicine(medicineData);
    
    console.log('🧪 Medicine before save:', JSON.stringify(medicine.toObject(), null, 2));
    
    await medicine.save();

    console.log('✅ Medicine saved successfully!');
    console.log('🔍 Medicine after save:', JSON.stringify(medicine.toObject(), null, 2));

    const populatedMedicine = await Medicine.findById(medicine._id)
      .populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      data: populatedMedicine
    });

  } catch (error) {
    console.error('Error creating medicine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add medicine',
      error: error.message
    });
  }
});

// PUT /api/medicines/:id - Update a medicine
router.put('/:id', adminAuth, uploadSingle('image'), handleUploadResponse, medicineValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // If validation fails and new image was uploaded, delete it from cloudinary
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const medicine = await Medicine.findById(req.params.id);
    
    if (!medicine) {
      // If medicine doesn't exist and image was uploaded, delete it from cloudinary
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Check if another medicine with same name exists (excluding current medicine, case-insensitive)
    const existingMedicine = await Medicine.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${req.body.name.trim()}$`, 'i') }
    });

    if (existingMedicine) {
      // If duplicate exists and image was uploaded, delete it from cloudinary
      if (req.file) {
        await cloudinary.uploader.destroy(req.file.filename);
      }
      return res.status(400).json({
        success: false,
        message: 'Another medicine with this name already exists'
      });
    }

    // Handle image update
    if (req.file) {
      // If there's an old image, delete it from cloudinary
      if (medicine.image && medicine.image.publicId) {
        try {
          await cloudinary.uploader.destroy(medicine.image.publicId);
        } catch (deleteError) {
          console.error('Error deleting old image:', deleteError);
        }
      }

      // Set new image data
      medicine.image = {
        url: req.file.path,
        publicId: req.file.filename
      };
    }

    // Update medicine fields
    Object.keys(req.body).forEach(key => {
      if (key !== 'createdBy') { // Don't allow changing createdBy
        medicine[key] = req.body[key];
      }
    });

    medicine.currency = 'INR'; // Force currency to INR
    
    // Find or create admin user for lastUpdatedBy
    let adminUser = await Admin.findOne({ email: 'admin@gmail.com' });
    if (!adminUser) {
      adminUser = new Admin({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@gmail.com',
        role: 'admin'
      });
      await adminUser.save();
    }
    
    medicine.lastUpdatedBy = adminUser._id;

    await medicine.save();

    const populatedMedicine = await Medicine.findById(medicine._id)
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Medicine updated successfully',
      data: populatedMedicine
    });

  } catch (error) {
    // If error occurs and new image was uploaded, delete it from cloudinary
    if (req.file) {
      try {
        await cloudinary.uploader.destroy(req.file.filename);
      } catch (deleteError) {
        console.error('Error deleting uploaded image:', deleteError);
      }
    }
    console.error('Error updating medicine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update medicine',
      error: error.message
    });
  }
});

// PATCH /api/medicines/:id/restock - Restock a medicine
router.patch('/:id/restock', adminAuth, [
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer')
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

    const medicine = await Medicine.findById(req.params.id);
    
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    const { quantity, notes } = req.body;
    const oldStock = medicine.stockQuantity;

    // Find or create admin user for restock operation
    let adminUser = await Admin.findOne({ email: 'admin@gmail.com' });
    if (!adminUser) {
      adminUser = new Admin({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@gmail.com',
        role: 'admin'
      });
      await adminUser.save();
    }

    console.log('🔄 Restocking medicine:', {
      medicineId: req.params.id,
      oldStock,
      quantity: parseInt(quantity),
      adminUserId: adminUser._id
    });

    // Restock the medicine
    await medicine.restock(parseInt(quantity), adminUser._id);

    // Add notes if provided
    if (notes) {
      medicine.notes = notes;
      await medicine.save();
    }

    console.log('✅ Medicine restocked successfully:', {
      medicineId: req.params.id,
      newStock: medicine.stockQuantity,
      increased: medicine.stockQuantity - oldStock
    });

    const populatedMedicine = await Medicine.findById(medicine._id)
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    res.json({
      success: true,
      message: `Medicine restocked successfully. Stock increased from ${oldStock} to ${medicine.stockQuantity}`,
      data: populatedMedicine
    });

  } catch (error) {
    console.error('❌ Error restocking medicine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restock medicine',
      error: error.message
    });
  }
});

// DELETE /api/medicines/:id - Delete a medicine
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Delete image from cloudinary if it exists
    if (medicine.image && medicine.image.publicId) {
      try {
        await cloudinary.uploader.destroy(medicine.image.publicId);
      } catch (deleteError) {
        console.error('Error deleting image from cloudinary:', deleteError);
        // Continue with medicine deletion even if image deletion fails
      }
    }

    await Medicine.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Medicine deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting medicine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete medicine',
      error: error.message
    });
  }
});

// GET /api/medicines/categories/list - Get list of available categories
router.get('/categories/list', adminAuth, async (req, res) => {
  try {
    const categories = [
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
    ];

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

module.exports = router;