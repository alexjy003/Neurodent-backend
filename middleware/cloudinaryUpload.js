const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../config/cloudinary');

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'neurodent',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 1000, height: 1000, crop: 'limit' },
      { quality: 'auto' },
      { format: 'auto' }
    ]
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Middleware for single file upload
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.single(fieldName);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              message: 'File too large. Maximum size is 5MB.'
            });
          }
          return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Middleware for multiple file upload
const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.array(fieldName, maxCount);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              message: 'File too large. Maximum size is 5MB per file.'
            });
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
              success: false,
              message: `Too many files. Maximum is ${maxCount} files.`
            });
          }
          return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Middleware for handling upload response
const handleUploadResponse = (req, res, next) => {
  if (req.file) {
    req.uploadResult = {
      success: true,
      url: req.file.path,
      public_id: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    };
  } else if (req.files && req.files.length > 0) {
    req.uploadResult = {
      success: true,
      files: req.files.map(file => ({
        url: file.path,
        public_id: file.filename,
        originalName: file.originalname,
        size: file.size
      }))
    };
  }
  next();
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  handleUploadResponse
};
