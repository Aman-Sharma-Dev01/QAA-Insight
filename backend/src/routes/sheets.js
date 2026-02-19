import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { googleSheetsService } from '../services/googleSheets.js';
import { cacheService } from '../services/cache.js';

const router = express.Router();

// Per-user storage for sheets (in production, use a database)
// Map<userId, SheetSource[]>
const userSheets = new Map();

/**
 * Get sheets for a specific user
 */
function getUserSheets(userId) {
  if (!userSheets.has(userId)) {
    userSheets.set(userId, []);
  }
  return userSheets.get(userId);
}

/**
 * POST /api/sheets/validate
 * Validate a Google Sheet URL and check if it's accessible
 */
router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    // Validate URL format
    if (!url.includes('docs.google.com/spreadsheets')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Google Sheets URL format' 
      });
    }

    const result = await googleSheetsService.validateSheet(url);
    
    if (result.valid) {
      return res.json({
        success: true,
        data: {
          title: result.title,
          sheetCount: result.sheetCount
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Sheet validation error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/sheets/add
 * Add a new sheet source for the current user
 */
router.post('/add', authenticateToken, (req, res) => {
  try {
    const { name, url } = req.body;
    const userId = req.user.id;
    
    if (!name || !url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and URL are required' 
      });
    }

    const newSheet = {
      id: Date.now().toString(),
      name,
      url,
      dateAdded: new Date().toISOString().split('T')[0]
    };

    const sheets = getUserSheets(userId);
    
    // Check for duplicates
    const exists = sheets.find(s => s.url === url);
    if (exists) {
      return res.status(400).json({
        success: false,
        error: 'This sheet is already added'
      });
    }
    
    sheets.push(newSheet);
    
    // Clear any cached data for this sheet
    cacheService.clearForSheet(url);

    return res.json({
      success: true,
      data: newSheet
    });
  } catch (error) {
    console.error('Add sheet error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/sheets/list
 * Get all saved sheet sources for the current user
 */
router.get('/list', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sheets = getUserSheets(userId);
  
  return res.json({
    success: true,
    data: sheets
  });
});

/**
 * DELETE /api/sheets/:id
 * Remove a sheet source for the current user
 */
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const sheets = getUserSheets(userId);
  
  const index = sheets.findIndex(s => s.id === id);
  
  if (index === -1) {
    return res.status(404).json({ 
      success: false, 
      error: 'Sheet not found' 
    });
  }

  const [removed] = sheets.splice(index, 1);
  cacheService.clearForSheet(removed.url);

  return res.json({
    success: true,
    message: 'Sheet removed successfully'
  });
});

/**
 * POST /api/sheets/refresh-cache
 * Clear cache for a specific sheet
 */
router.post('/refresh-cache', authenticateToken, (req, res) => {
  const { url } = req.body;
  
  if (url) {
    cacheService.clearForSheet(url);
  } else {
    cacheService.clearAll();
  }

  return res.json({
    success: true,
    message: 'Cache cleared successfully'
  });
});

/**
 * POST /api/sheets/check-updates
 * Check if sheet has been updated since last fetch
 * Used for smart refresh: instant for 1-10 changes, cached for larger
 */
router.post('/check-updates', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    const updateInfo = await googleSheetsService.checkForUpdates(url);
    
    // If small change (1-10 rows), automatically refresh cache
    if (updateInfo.shouldInstantRefresh) {
      console.log(`Smart refresh: ${updateInfo.delta} new rows detected, refreshing cache...`);
      await googleSheetsService.refreshCache(url);
      cacheService.clearForSheet(url); // Clear analytics/metadata caches too
    }

    return res.json({
      success: true,
      data: updateInfo
    });
  } catch (error) {
    console.error('Check updates error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
