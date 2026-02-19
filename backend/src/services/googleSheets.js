import { google } from 'googleapis';
import { cacheService } from './cache.js';

// Cache TTL constants (in seconds)
const SHEET_DATA_CACHE_TTL = 600;  // 10 minutes for raw data
const SHEET_META_CACHE_TTL = 900;  // 15 minutes for metadata

/**
 * Google Sheets Service - Optimized for 20K-25K row datasets
 * Features: data caching, optimized transformations, background refresh
 */
class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.initialized = false;
    this.pendingFetches = new Map(); // Prevent duplicate simultaneous fetches
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
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
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
   * Raw fetch from Google Sheets API - optimized transformation
   */
  async fetchSheetDataRaw(sheetUrl) {
    await this.initialize();

    if (!this.sheets) {
      throw new Error('Google Sheets API not initialized. Please configure service account credentials.');
    }

    const spreadsheetId = this.extractSpreadsheetId(sheetUrl);
    const startTime = Date.now();

    // First, get spreadsheet metadata to find sheet names
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const firstSheetName = metadata.data.sheets[0]?.properties?.title || 'Sheet1';

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
}

export const googleSheetsService = new GoogleSheetsService();
