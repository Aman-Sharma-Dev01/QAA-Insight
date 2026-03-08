import { google } from 'googleapis';
import { cacheService } from './cache.js';

// Cache TTL constants (in seconds) - optimized for instant updates
const SHEET_DATA_CACHE_TTL = 30;  // 30 seconds for raw data (near-instant updates)
const SHEET_META_CACHE_TTL = 60;  // 1 minute for metadata

// API quota tracking - Google Sheets free tier is 60 read requests/minute
const QUOTA_WINDOW_MS = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 50; // Leave buffer below 60 limit

/**
 * Google Sheets Service - Optimized for 20K-25K row datasets
 * Features: data caching, optimized transformations, background refresh, quota protection
 */
class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.initialized = false;
    this.pendingFetches = new Map(); // Prevent duplicate simultaneous fetches
    
    // Quota tracking
    this.requestTimestamps = [];
  }

  /**
   * Check if we're approaching API quota limits
   * Returns true if safe to proceed, false if should wait
   */
  checkQuota() {
    const now = Date.now();
    // Remove timestamps older than the window
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < QUOTA_WINDOW_MS);
    return this.requestTimestamps.length < MAX_REQUESTS_PER_WINDOW;
  }

  /**
   * Track an API request for quota monitoring
   */
  trackRequest() {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Get remaining quota in current window
   */
  getRemainingQuota() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < QUOTA_WINDOW_MS);
    return MAX_REQUESTS_PER_WINDOW - this.requestTimestamps.length;
  }

  /**
   * Wait until quota is available (with timeout)
   */
  async waitForQuota(maxWaitMs = 30000) {
    const startTime = Date.now();
    while (!this.checkQuota()) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error('API quota limit reached. Please wait 1-2 minutes and try again.');
      }
      console.log(`[QUOTA] Waiting for quota... ${this.getRemainingQuota()} requests remaining`);
      await this.delay(2000);
    }
  }

  /**
   * Clear pending fetches for specific sheet URLs - used after merge/unmerge
   * Prevents stale data from being cached if a fetch was in progress during the merge
   */
  clearPendingFetches(sheetUrl) {
    const urls = Array.isArray(sheetUrl) ? sheetUrl : [sheetUrl];
    
    // Extract spreadsheet IDs
    const sheetIds = urls.map(url => {
      try {
        return this.extractSpreadsheetId(url);
      } catch (e) {
        return null;
      }
    }).filter(id => id !== null);

    // Clear any pending fetches for these sheets
    let clearedCount = 0;
    for (const [key, _] of this.pendingFetches) {
      if (sheetIds.some(id => key.includes(id))) {
        this.pendingFetches.delete(key);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      console.log(`[MERGE/UNMERGE] Cleared ${clearedCount} pending fetches to prevent stale data`);
    }
  }

  /**
   * Initialize the Google Sheets API client
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

      if (credentials) {
        const parsedCredentials = JSON.parse(credentials);

        const auth = new google.auth.GoogleAuth({
          credentials: parsedCredentials,
          // Scope changed to allow write access
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.sheets = google.sheets({ version: 'v4', auth });
        this.initialized = true;
        console.log('✅ Google Sheets API initialized with service account');
      } else {
        console.log('⚠️ No Google credentials found, will use Apps Script fallback');
      }
    } catch (error) {
      console.error('Failed to initialize Google Sheets API:', error.message);
    }
  }

  /**
   * Extract spreadsheet ID from URL
   */
  extractSpreadsheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL');
    }
    return match[1];
  }

  /**
   * Get all data from the first sheet - with caching and optimization
   */
  async getSheetData(sheetUrl, forceRefresh = false) {
    const spreadsheetId = this.extractSpreadsheetId(sheetUrl);
    const cacheKey = `sheet_data_${spreadsheetId}`;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await cacheService.getWithBackgroundRefresh(
        cacheKey,
        () => this.fetchSheetDataRaw(sheetUrl),
        SHEET_DATA_CACHE_TTL
      );
      if (cached) {
        return cached;
      }
    }

    // Prevent duplicate simultaneous fetches for same sheet
    if (this.pendingFetches.has(cacheKey)) {
      console.log(`Waiting for pending fetch: ${spreadsheetId}`);
      return this.pendingFetches.get(cacheKey);
    }

    // Start fetch and track it
    const fetchPromise = this.fetchSheetDataRaw(sheetUrl);
    this.pendingFetches.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      cacheService.set(cacheKey, result, SHEET_DATA_CACHE_TTL);
      console.log(`Cached ${result.totalRows} rows for ${spreadsheetId}`);
      return result;
    } finally {
      this.pendingFetches.delete(cacheKey);
    }
  }

  /**
   * Get all data from multiple sheets merged
   */
  async getMultipleSheetsData(sheetUrls, forceRefresh = false) {
    if (!sheetUrls || sheetUrls.length === 0) {
      throw new Error('No sheet URLs provided');
    }

    if (sheetUrls.length === 1) {
      return this.getSheetData(sheetUrls[0], forceRefresh);
    }

    const sortedUrls = [...sheetUrls].sort();
    const spreadsheetIds = sortedUrls.map(url => {
      try {
        return this.extractSpreadsheetId(url);
      } catch (e) {
        return 'invalid';
      }
    });
    const hashStr = spreadsheetIds.join('_');
    const cacheKey = `multisheet_data_${hashStr.length > 50 ? hashStr.substring(0, 50) + hashStr.length : hashStr}`;

    if (!forceRefresh) {
      const cached = await cacheService.getWithBackgroundRefresh(
        cacheKey,
        () => this.fetchMultipleSheetsData(sortedUrls, false),
        SHEET_DATA_CACHE_TTL
      );
      if (cached) {
        return cached;
      }
    }

    if (this.pendingFetches.has(cacheKey)) {
      return this.pendingFetches.get(cacheKey);
    }

    const fetchPromise = this.fetchMultipleSheetsData(sortedUrls, forceRefresh);
    this.pendingFetches.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      cacheService.set(cacheKey, result, SHEET_DATA_CACHE_TTL);
      return result;
    } finally {
      this.pendingFetches.delete(cacheKey);
    }
  }

  async fetchMultipleSheetsData(sheetUrls, forceRefresh) {
    const promises = sheetUrls.map(url => this.getSheetData(url, forceRefresh).catch(err => {
      console.error(`Failed to fetch sheet ${url}:`, err.message);
      return null;
    }));

    const results = await Promise.all(promises);
    const validResults = results.filter(r => r !== null);

    if (validResults.length === 0) {
      throw new Error('Failed to fetch data from any of the provided sheets');
    }

    const headerSet = new Set();
    for (const res of validResults) {
      for (const h of res.headers) {
        headerSet.add(h);
      }
    }
    const headers = Array.from(headerSet);

    let mergedData = [];
    for (const res of validResults) {
      mergedData = mergedData.concat(res.data);
    }

    return { headers, data: mergedData, totalRows: mergedData.length };
  }

  /**
   * Raw fetch from Google Sheets API - optimized transformation
   */
  async fetchSheetDataRaw(sheetUrl) {
    await this.initialize();

    if (!this.sheets) {
      throw new Error('Google Sheets API not initialized. Please configure service account credentials.');
    }

    const spreadsheetId = this.extractSpreadsheetId(sheetUrl);
    const startTime = Date.now();

    // Track API requests for quota monitoring
    this.trackRequest();
    
    // First, get spreadsheet metadata to find sheet names
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const firstSheetName = metadata.data.sheets[0]?.properties?.title || 'Sheet1';

    // Track second API request
    this.trackRequest();
    
    // Get all data from the first sheet
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${firstSheetName}!A:ZZ`, // Get all columns
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    const rows = response.data.values || [];
    const fetchTime = Date.now() - startTime;

    if (rows.length === 0) {
      throw new Error('Sheet is empty or inaccessible');
    }

    console.log(`Fetched ${rows.length} rows from Google Sheets in ${fetchTime}ms`);

    // Optimized transformation - pre-allocate and minimize object creation
    const headers = rows[0].map(h => String(h).trim());
    const headerCount = headers.length;
    const dataRows = rows.length - 1;

    // Use typed transformation for better performance
    const data = new Array(dataRows);
    for (let i = 0; i < dataRows; i++) {
      const row = rows[i + 1];
      const obj = Object.create(null); // Faster than {}
      for (let j = 0; j < headerCount; j++) {
        obj[headers[j]] = row[j] !== undefined ? row[j] : '';
      }
      data[i] = obj;
    }

    const transformTime = Date.now() - startTime - fetchTime;
    console.log(`Transformed ${dataRows} rows in ${transformTime}ms`);

    return { headers, data, totalRows: dataRows };
  }

  /**
   * Force refresh cache for a sheet
   */
  async refreshCache(sheetUrl) {
    if (Array.isArray(sheetUrl)) {
      return this.getMultipleSheetsData(sheetUrl, true);
    }
    return this.getSheetData(sheetUrl, true);
  }

  /**
   * Get row count only - lightweight API call for change detection
   * Used to detect small changes (1-10 rows) for instant refresh
   */
  async getRowCount(sheetUrl) {
    await this.initialize();

    if (!this.sheets) {
      throw new Error('Google Sheets API not initialized');
    }

    const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

    // Get sheet metadata to find the sheet name
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const firstSheetName = metadata.data.sheets[0]?.properties?.title || 'Sheet1';
    const rowCount = metadata.data.sheets[0]?.properties?.gridProperties?.rowCount;

    // If gridProperties gives us row count, use it (but it includes empty rows)
    // Better to do a quick count of actual data rows
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${firstSheetName}!A:A`, // Just first column
      valueRenderOption: 'UNFORMATTED_VALUE'
    });

    const actualRows = (response.data.values || []).length;
    return actualRows > 0 ? actualRows - 1 : 0; // Subtract header row
  }

  /**
   * Check if sheet has been updated and by how many rows
   * Returns: { hasChanged, delta, currentCount, cachedCount }
   */
  async checkForUpdates(sheetUrl) {
    if (Array.isArray(sheetUrl)) {
      if (sheetUrl.length === 0) {
        return { hasChanged: false, delta: 0, currentCount: 0, cachedCount: 0, shouldInstantRefresh: false };
      }

      const sortedUrls = [...sheetUrl].sort();
      const spreadsheetIds = sortedUrls.map(url => {
        try { return this.extractSpreadsheetId(url); } catch (e) { return 'invalid'; }
      });
      const hashStr = spreadsheetIds.join('_');
      const cacheKey = `multisheet_data_${hashStr.length > 50 ? hashStr.substring(0, 50) + hashStr.length : hashStr}`;
      const cached = cacheService.get(cacheKey);
      const cachedCount = cached ? cached.totalRows : 0;

      try {
        let currentCount = 0;
        for (const url of sheetUrl) {
          currentCount += await this.getRowCount(url);
        }
        const delta = currentCount - cachedCount;
        return {
          hasChanged: delta !== 0,
          delta,
          currentCount,
          cachedCount,
          shouldInstantRefresh: Math.abs(delta) > 0 && Math.abs(delta) <= 10
        };
      } catch (error) {
        console.error('Error checking for updates on multiple sheets:', error.message);
        return { hasChanged: false, delta: 0, currentCount: cachedCount, cachedCount, shouldInstantRefresh: false, error: error.message };
      }
    }

    const spreadsheetId = this.extractSpreadsheetId(sheetUrl);
    const cacheKey = `sheet_data_${spreadsheetId}`;
    const cached = cacheService.get(cacheKey);

    const cachedCount = cached ? cached.totalRows : 0;

    try {
      const currentCount = await this.getRowCount(sheetUrl);
      const delta = currentCount - cachedCount;

      return {
        hasChanged: delta !== 0,
        delta,
        currentCount,
        cachedCount,
        shouldInstantRefresh: Math.abs(delta) > 0 && Math.abs(delta) <= 10
      };
    } catch (error) {
      console.error('Error checking for updates:', error.message);
      return {
        hasChanged: false,
        delta: 0,
        currentCount: cachedCount,
        cachedCount,
        shouldInstantRefresh: false,
        error: error.message
      };
    }
  }

  /**
   * Validate that a sheet URL is accessible
   */
  async validateSheet(sheetUrl) {
    try {
      await this.initialize();

      if (!this.sheets) {
        return {
          valid: false,
          error: 'Google Sheets API not configured. Please set up service account credentials.'
        };
      }

      const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title,sheets.properties'
      });

      return {
        valid: true,
        title: metadata.data.properties.title,
        sheetCount: metadata.data.sheets.length
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message.includes('403')
          ? 'Access denied. Please share the sheet with the service account email.'
          : error.message
      };
    }
  }

  /**
   * Helper: delay for a given number of milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper: retry an operation with exponential backoff
   */
  async retryWithBackoff(operation, maxRetries = 3, initialDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isQuotaError = error.message?.includes('Quota exceeded') || 
                             error.message?.includes('Rate Limit') ||
                             error.code === 429;
        
        if (!isQuotaError || attempt === maxRetries - 1) {
          throw error;
        }
        
        const waitTime = initialDelay * Math.pow(2, attempt);
        console.log(`[RETRY] Quota error, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await this.delay(waitTime);
      }
    }
  }

  /**
   * Apply a merge directly to the Google Sheet by finding and replacing variant names
   * Uses parallel processing for multiple sheets (3 at a time) for 50-70% faster merges
   */
  async applyMerge(sheetUrl, categoryName, canonicalName, namesToReplace) {
    if (Array.isArray(sheetUrl)) {
      if (sheetUrl.length === 0) {
        return { success: true, message: 'No sheets to update', modified: 0 };
      }

      // Parallel batch size - process 3 sheets at once to balance speed vs quota
      const PARALLEL_BATCH_SIZE = 3;
      const requiredRequests = sheetUrl.length * 3; // Each sheet needs ~3 API calls
      
      console.log(`[MERGE] 🚀 PARALLEL processing ${sheetUrl.length} sheets in batches of ${PARALLEL_BATCH_SIZE}`);
      console.log(`[MERGE] Estimated ${requiredRequests} API calls. Remaining quota: ${this.getRemainingQuota()}`);
      
      // Check quota before starting
      if (this.getRemainingQuota() < Math.min(requiredRequests, PARALLEL_BATCH_SIZE * 3)) {
        console.log(`[MERGE] Waiting for quota to recover...`);
        await this.waitForQuota(60000);
      }

      let totalModified = 0;
      const errors = [];
      const startTime = Date.now();

      // Process sheets in parallel batches
      for (let batchStart = 0; batchStart < sheetUrl.length; batchStart += PARALLEL_BATCH_SIZE) {
        const batch = sheetUrl.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
        const batchNum = Math.floor(batchStart / PARALLEL_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(sheetUrl.length / PARALLEL_BATCH_SIZE);
        
        console.log(`[MERGE] Processing batch ${batchNum}/${totalBatches} (${batch.length} sheets in parallel)...`);

        // Process batch in parallel using Promise.allSettled
        const batchResults = await Promise.allSettled(
          batch.map(url => 
            this.retryWithBackoff(() => this.applyMerge(url, categoryName, canonicalName, namesToReplace))
          )
        );

        // Collect results
        batchResults.forEach((result, idx) => {
          const url = batch[idx];
          if (result.status === 'fulfilled' && result.value.success) {
            totalModified += (result.value.modified || 0);
          } else {
            const errorMsg = result.status === 'rejected' ? result.reason.message : 'Unknown error';
            console.error(`Failed to apply merge to sheet ${url}:`, errorMsg);
            errors.push({ url, error: errorMsg });
          }
        });

        // Brief delay between batches to let quota recover (only 500ms vs 2000ms before)
        if (batchStart + PARALLEL_BATCH_SIZE < sheetUrl.length) {
          console.log(`[MERGE] Batch ${batchNum} done. Brief pause before next batch...`);
          await this.delay(500);
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[MERGE] ✅ Completed in ${elapsed}s. Modified: ${totalModified} cells across ${sheetUrl.length - errors.length} sheets`);

      // Clear pending fetches to prevent stale data
      sheetUrl.forEach(url => this.clearPendingFetches(url));
      
      // Aggressively clear cache for ALL URLs and the multisheet composite cache
      sheetUrl.forEach(url => cacheService.clearAllForSheetOperation(url));
      cacheService.clearAllForSheetOperation(sheetUrl);

      if (errors.length === sheetUrl.length) {
        throw new Error(`Failed to apply merge to any sheets. Errors: ${errors.map(e => e.error).join(', ')}`);
      }

      return {
        success: true,
        modified: totalModified,
        message: errors.length > 0 ? `Merged with some errors. Total modified: ${totalModified}` : `Successfully merged across all sheets. Total modified: ${totalModified}`,
        errors: errors.length > 0 ? errors : undefined,
        sheetsUpdated: sheetUrl.length - errors.length,
        timeElapsed: `${elapsed}s`
      };
    }

    await this.initialize();

    if (!this.sheets) {
      throw new Error('Google Sheets API not initialized');
    }

    const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

    // Get metadata to find sheetId and properties
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const firstSheet = metadata.data.sheets[0];
    if (!firstSheet) {
      throw new Error('No sheets found in spreadsheet');
    }

    const firstSheetName = firstSheet.properties.title;
    const sheetId = firstSheet.properties.sheetId;

    // Get headers to find the column index
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${firstSheetName}!1:1`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });

    const headers = response.data.values?.[0]?.map(h => String(h).trim().toLowerCase()) || [];
    let columnIndex = -1;

    // Try to find exact match or partial match based on category
    const categoryLower = categoryName.toLowerCase();
    columnIndex = headers.findIndex(h => h === categoryLower || h.includes(categoryLower));

    if (columnIndex === -1) {
      // Fallback: check all headers for 'faculty' or 'teacher' or 'name' if category is generic
      columnIndex = headers.findIndex(h => h.includes('faculty') || h.includes('teacher'));
    }

    if (columnIndex === -1) {
      throw new Error(`Could not find column for category: ${categoryName}`);
    }

    // Helper to escape regex special characters
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build find/replace requests for each variant name
    const requests = namesToReplace.filter(name => name !== canonicalName).map(nameToReplace => ({
      findReplace: {
        // Allows optional leading/trailing whitespaces and matches the exact name
        find: `^\\s*${escapeRegex(nameToReplace)}\\s*$`,
        replacement: canonicalName,
        matchCase: false,
        matchEntireCell: true,
        searchByRegex: true,
        includeFormulas: false,
        range: {
          sheetId: sheetId,
          startRowIndex: 1, // Skip header row (0-indexed)
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1
        }
      }
    }));

    if (requests.length === 0) {
      return { success: true, message: 'Nothing to replace', modified: 0 };
    }

    // Execute batch update
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests
      }
    });

    console.log(`Successfully merged ${requests.length} names to ${canonicalName} in sheet ${spreadsheetId}`);

    // Clear any pending fetches that might cache stale data
    this.clearPendingFetches(sheetUrl);
    
    // Aggressively clear ALL caches to force instant refresh on next load
    cacheService.clearAllForSheetOperation(sheetUrl);

    return {
      success: true,
      modified: requests.length,
      spreadsheetId
    };
  }
}

export const googleSheetsService = new GoogleSheetsService();
