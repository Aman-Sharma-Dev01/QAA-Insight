import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/user/sheets - Get all user's sheets
router.get('/sheets', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: {
        sheets: user.sheets,
        defaultSheetId: user.settings.defaultSheetId
      }
    });
  } catch (error) {
    console.error('Get sheets error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get sheets' 
    });
  }
});

// POST /api/user/sheets - Add a new sheet
router.post('/sheets', async (req, res) => {
  try {
    const { sheetId, name, url } = req.body;

    if (!sheetId || !name || !url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet ID, name, and URL are required' 
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Check if sheet already exists
    const existingSheet = user.sheets.find(s => s.sheetId === sheetId);
    if (existingSheet) {
      // Update existing sheet
      existingSheet.name = name;
      existingSheet.url = url;
      existingSheet.lastAccessed = new Date();
    } else {
      // Add new sheet
      user.sheets.push({
        sheetId,
        name,
        url,
        addedAt: new Date(),
        lastAccessed: new Date()
      });
    }

    // If this is the first sheet, set it as default
    if (user.sheets.length === 1) {
      user.settings.defaultSheetId = sheetId;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        sheets: user.sheets,
        defaultSheetId: user.settings.defaultSheetId
      }
    });
  } catch (error) {
    console.error('Add sheet error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add sheet' 
    });
  }
});

// PUT /api/user/sheets/:sheetId - Update a sheet
router.put('/sheets/:sheetId', async (req, res) => {
  try {
    const { sheetId } = req.params;
    const { name, url } = req.body;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const sheet = user.sheets.find(s => s.sheetId === sheetId);
    if (!sheet) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sheet not found' 
      });
    }

    if (name) sheet.name = name;
    if (url) sheet.url = url;
    sheet.lastAccessed = new Date();

    await user.save();

    res.json({
      success: true,
      data: {
        sheet
      }
    });
  } catch (error) {
    console.error('Update sheet error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update sheet' 
    });
  }
});

// DELETE /api/user/sheets/:sheetId - Remove a sheet
router.delete('/sheets/:sheetId', async (req, res) => {
  try {
    const { sheetId } = req.params;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const sheetIndex = user.sheets.findIndex(s => s.sheetId === sheetId);
    if (sheetIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sheet not found' 
      });
    }

    user.sheets.splice(sheetIndex, 1);

    // If deleted sheet was default, set new default
    if (user.settings.defaultSheetId === sheetId) {
      user.settings.defaultSheetId = user.sheets.length > 0 
        ? user.sheets[0].sheetId 
        : null;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        sheets: user.sheets,
        defaultSheetId: user.settings.defaultSheetId
      }
    });
  } catch (error) {
    console.error('Delete sheet error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete sheet' 
    });
  }
});

// PUT /api/user/sheets/:sheetId/default - Set default sheet
router.put('/sheets/:sheetId/default', async (req, res) => {
  try {
    const { sheetId } = req.params;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const sheet = user.sheets.find(s => s.sheetId === sheetId);
    if (!sheet) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sheet not found in your saved sheets' 
      });
    }

    user.settings.defaultSheetId = sheetId;
    sheet.lastAccessed = new Date();
    await user.save();

    res.json({
      success: true,
      data: {
        defaultSheetId: user.settings.defaultSheetId
      }
    });
  } catch (error) {
    console.error('Set default sheet error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to set default sheet' 
    });
  }
});

// PUT /api/user/settings - Update user settings
router.put('/settings', async (req, res) => {
  try {
    const { theme, defaultSheetId } = req.body;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    if (theme) {
      if (!['light', 'dark', 'system'].includes(theme)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid theme value' 
        });
      }
      user.settings.theme = theme;
    }

    if (defaultSheetId !== undefined) {
      user.settings.defaultSheetId = defaultSheetId;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update settings' 
    });
  }
});

// GET /api/user/settings - Get user settings
router.get('/settings', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: {
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get settings' 
    });
  }
});

// POST /api/user/sheets/:sheetId/access - Update sheet last accessed time
router.post('/sheets/:sheetId/access', async (req, res) => {
  try {
    const { sheetId } = req.params;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const sheet = user.sheets.find(s => s.sheetId === sheetId);
    if (sheet) {
      sheet.lastAccessed = new Date();
      await user.save();
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Update access time error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update access time' 
    });
  }
});

// GET /api/user/merged-names - Get all merged names for user
router.get('/merged-names', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: user.mergedNames || {}
    });
  } catch (error) {
    console.error('Get merged names error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get merged names' 
    });
  }
});

// GET /api/user/merged-names/:sheetId - Get merged names for a specific sheet
router.get('/merged-names/:sheetId', async (req, res) => {
  try {
    const { sheetId } = req.params;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Get merged names for specific sheet
    const sheetMergedNames = (user.mergedNames && user.mergedNames[sheetId]) || {};

    res.json({
      success: true,
      data: sheetMergedNames
    });
  } catch (error) {
    console.error('Get sheet merged names error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get merged names for sheet' 
    });
  }
});

// PUT /api/user/merged-names/:sheetId - Update merged names for a specific sheet
router.put('/merged-names/:sheetId', async (req, res) => {
  try {
    const { sheetId } = req.params;
    const { mergedNames } = req.body; // { category: { canonicalName: [variants] } }
    
    if (!mergedNames || typeof mergedNames !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'Merged names object is required' 
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Initialize mergedNames if not exists
    if (!user.mergedNames) {
      user.mergedNames = {};
    }

    // Update merged names for this sheet
    user.mergedNames[sheetId] = mergedNames;
    user.markModified('mergedNames'); // Required for Mixed type
    await user.save();

    res.json({
      success: true,
      data: user.mergedNames[sheetId] || {}
    });
  } catch (error) {
    console.error('Update merged names error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update merged names' 
    });
  }
});

// DELETE /api/user/merged-names/:sheetId/:category/:canonicalName - Remove a specific merge
router.delete('/merged-names/:sheetId/:category/:canonicalName', async (req, res) => {
  try {
    const { sheetId, category, canonicalName } = req.params;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    if (user.mergedNames && user.mergedNames[sheetId] && user.mergedNames[sheetId][category]) {
      // Remove the specific canonical name entry
      delete user.mergedNames[sheetId][category][canonicalName];
      
      // If category is empty, remove it
      if (Object.keys(user.mergedNames[sheetId][category]).length === 0) {
        delete user.mergedNames[sheetId][category];
      }
      
      // If sheet has no merges, remove it
      if (Object.keys(user.mergedNames[sheetId]).length === 0) {
        delete user.mergedNames[sheetId];
      }
      
      user.markModified('mergedNames');
      await user.save();
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Delete merge error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete merge' 
    });
  }
});

export default router;
