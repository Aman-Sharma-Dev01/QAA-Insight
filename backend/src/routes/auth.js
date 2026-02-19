import express from 'express';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username, email, and password are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return res.status(400).json({ 
        success: false, 
        error: `User with this ${field} already exists` 
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      displayName: displayName || username
    });

    await user.save();

    // Generate token
    const token = generateToken({
      id: user._id,
      username: user.username,
      role: user.role
    });

    res.status(201).json({
      success: true,
      data: {
        user: user.toProfile(),
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false, 
        error: messages.join(', ') 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Failed to register user' 
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account is deactivated' 
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken({
      id: user._id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      data: {
        user: user.toProfile(),
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to login' 
    });
  }
});

// GET /api/auth/verify - Verify token is still valid
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or inactive' 
      });
    }

    res.json({
      success: true,
      data: {
        user: user.toProfile()
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to verify user' 
    });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // In a production app with refresh tokens, you'd invalidate them here
  res.json({ success: true, message: 'Logged out successfully' });
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { displayName, email } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Update fields
    if (displayName) user.displayName = displayName;
    if (email && email !== user.email) {
      // Check if email is already taken
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email is already in use' 
        });
      }
      user.email = email;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        user: user.toProfile()
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile' 
    });
  }
});

// PUT /api/auth/password - Change password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to change password' 
    });
  }
});

export default router;
