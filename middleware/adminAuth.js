const jwt = require('jsonwebtoken');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔍 Admin Auth Debug:');
    console.log('- Authorization header:', req.header('Authorization'));
    console.log('- Extracted token:', token ? token.substring(0, 20) + '...' : 'No token');
    
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }

    // Check if it's a mock admin token (starts with 'admin_token_')
    if (token.startsWith('admin_token_')) {
      console.log('🔑 Mock admin token detected');
      
      // Validate mock token format and check if it's not expired (within last 8 hours)
      const tokenParts = token.split('_');
      if (tokenParts.length >= 3) {
        const timestamp = parseInt(tokenParts[2]);
        const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);
        
        if (timestamp > eightHoursAgo) {
          console.log('✅ Valid mock admin token');
          req.user = {
            id: 'admin-1',
            role: 'admin',
            email: 'admin@gmail.com'
          };
          return next();
        } else {
          console.log('❌ Mock admin token expired');
          return res.status(401).json({ 
            success: false,
            message: 'Admin session expired' 
          });
        }
      } else {
        console.log('❌ Invalid mock admin token format');
        return res.status(401).json({ 
          success: false,
          message: 'Invalid admin token format' 
        });
      }
    }

    // Try to verify as JWT token for other users
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🔑 Decoded JWT token:', decoded);
      
      // Check if it's an admin token by looking for adminId
      if (!decoded.adminId && !decoded.patientId && !decoded.doctorId) {
        console.log('❌ Invalid token structure');
        return res.status(401).json({ 
          success: false,
          message: 'Invalid token structure' 
        });
      }

      // Create user from token
      req.user = {
        id: decoded.adminId || decoded.patientId || decoded.doctorId,
        role: decoded.adminId ? 'admin' : (decoded.doctorId ? 'doctor' : 'patient')
      };

      console.log('✅ JWT authentication successful');
      next();
    } catch (jwtError) {
      console.error('❌ JWT verification failed:', jwtError.message);
      return res.status(401).json({ 
        success: false,
        message: 'Token is not valid' 
      });
    }

  } catch (error) {
    console.error('❌ Admin auth middleware error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Authentication failed' 
    });
  }
};

module.exports = adminAuth;