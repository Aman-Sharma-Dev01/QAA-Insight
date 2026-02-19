import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { analyticsService } from '../services/analytics.js';

const router = express.Router();

/**
 * POST /api/analytics/metadata
 * Get sheet metadata including headers and filter options
 */
router.post('/metadata', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    const metadata = await analyticsService.getSheetMetadata(url);
    
    return res.json({
      success: true,
      data: metadata
    });
  } catch (error) {
    console.error('Metadata fetch error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/analytics/aggregate
 * Get aggregated analytics with applied filters
 */
router.post('/aggregate', authenticateToken, async (req, res) => {
  try {
    const { url, filters } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    const analytics = await analyticsService.getAnalytics(url, filters || {});
    
    return res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/analytics/filtered-data
 * Get paginated filtered raw data for display
 */
router.post('/filtered-data', authenticateToken, async (req, res) => {
  try {
    const { url, filters, page = 1, pageSize = 100 } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    const result = await analyticsService.getFilteredData(url, filters || {}, page, pageSize);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Filtered data fetch error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/analytics/export
 * Get all filtered data for CSV export
 */
router.post('/export', authenticateToken, async (req, res) => {
  try {
    const { url, filters } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    const result = await analyticsService.getFilteredDataForExport(url, filters || {});
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Export data fetch error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/analytics/name-mappings
 * Get name normalization mappings for debugging/display
 */
router.post('/name-mappings', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    const mappings = await analyticsService.getNameMappings(url);
    
    return res.json({
      success: true,
      data: mappings
    });
  } catch (error) {
    console.error('Name mappings fetch error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/analytics/clear-name-cache
 * Clear name mapping cache to force recalculation
 */
router.post('/clear-name-cache', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sheet URL is required' 
      });
    }

    analyticsService.clearNameMappingCache(url);
    
    return res.json({
      success: true,
      message: 'Name mapping cache cleared successfully'
    });
  } catch (error) {
    console.error('Clear name cache error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
