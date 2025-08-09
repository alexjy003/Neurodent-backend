const express = require('express');
const router = express.Router();
const { uploadSingle, uploadMultiple, handleUploadResponse } = require('../middleware/cloudinaryUpload');
const { deleteImage, getOptimizedUrl } = require('../config/cloudinary');

// Upload single image
router.post('/single', uploadSingle('image'), handleUploadResponse, async (req, res) => {
  try {
    if (!req.uploadResult || !req.uploadResult.success) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or upload failed'
      });
    }

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: req.uploadResult
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during upload',
      error: error.message
    });
  }
});

// Upload multiple images
router.post('/multiple', uploadMultiple('images', 5), handleUploadResponse, async (req, res) => {
  try {
    if (!req.uploadResult || !req.uploadResult.success) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded or upload failed'
      });
    }

    res.json({
      success: true,
      message: `${req.uploadResult.files.length} images uploaded successfully`,
      data: req.uploadResult
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during upload',
      error: error.message
    });
  }
});

// Delete image
router.delete('/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    // Replace URL-encoded slashes back to normal slashes
    const decodedPublicId = decodeURIComponent(publicId);
    
    const result = await deleteImage(decodedPublicId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to delete image',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during deletion',
      error: error.message
    });
  }
});

// Get optimized image URL
router.get('/optimize/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { width, height, crop, quality, format } = req.query;
    
    const decodedPublicId = decodeURIComponent(publicId);
    
    const optimizedUrl = getOptimizedUrl(decodedPublicId, {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      crop,
      quality,
      format
    });
    
    res.json({
      success: true,
      url: optimizedUrl
    });
  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during optimization',
      error: error.message
    });
  }
});

module.exports = router;
