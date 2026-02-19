
import { 
  AggregatedData, 
  ApiResponse, 
  SheetMetadata, 
  FilterState, 
  AuthResponse,
  FilteredDataResponse,
  ExportDataResponse,
  SheetSource,
  UpdateCheckResponse,
  RegisterData,
  User,
  UserSheet,
  UserSettings
} from '../types';
import { API_BASE_URL } from '../constants';

/**
 * Data Service - Handles all API communication with the backend
 */
class DataService {
  private token: string | null = null;

  constructor() {
    // Restore token from localStorage if available
    this.token = localStorage.getItem('eduPulseToken');
  }

  /**
   * Set authentication token
   */
  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('eduPulseToken', token);
    } else {
      localStorage.removeItem('eduPulseToken');
    }
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      
      if (data.success && data.data?.token) {
        this.setToken(data.data.token);
      }
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Failed to connect to server' };
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success && result.data?.token) {
        this.setToken(result.data.token);
      }
      
      return result;
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'Failed to connect to server' };
    }
  }

  /**
   * Verify current token
   */
  async verifyToken(): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('Verify token error:', error);
      return { success: false, error: 'Failed to verify token' };
    }
  }

  /**
   * Logout user
   */
  logout() {
    this.setToken(null);
  }

  /**
   * Validate a Google Sheet URL
   */
  async validateSheet(sheetUrl: string): Promise<ApiResponse<{ title: string; sheetCount: number }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/sheets/validate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl })
      });

      return await response.json();
    } catch (error) {
      console.error('Validate sheet error:', error);
      return { success: false, error: 'Failed to validate sheet' };
    }
  }

  /**
   * Add a new sheet source
   */
  async addSheet(name: string, url: string): Promise<ApiResponse<SheetSource>> {
    try {
      const response = await fetch(`${API_BASE_URL}/sheets/add`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name, url })
      });

      return await response.json();
    } catch (error) {
      console.error('Add sheet error:', error);
      return { success: false, error: 'Failed to add sheet' };
    }
  }

  /**
   * Get all sheets for the current user
   */
  async listSheets(): Promise<ApiResponse<SheetSource[]>> {
    try {
      const response = await fetch(`${API_BASE_URL}/sheets/list`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('List sheets error:', error);
      return { success: false, error: 'Failed to fetch sheets' };
    }
  }

  /**
   * Delete a sheet for the current user
   */
  async deleteSheet(sheetId: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/sheets/${sheetId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('Delete sheet error:', error);
      return { success: false, error: 'Failed to delete sheet' };
    }
  }

  /**
   * Get sheet metadata including headers and filter options
   */
  async getSheetMetadata(sheetUrl: string): Promise<ApiResponse<SheetMetadata>> {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/metadata`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl })
      });

      return await response.json();
    } catch (error) {
      console.error('Get metadata error:', error);
      return { success: false, error: 'Failed to fetch metadata' };
    }
  }

  /**
   * Get aggregated analytics with filters applied
   */
  async fetchAnalytics(sheetUrl: string, filters: FilterState): Promise<ApiResponse<AggregatedData>> {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/aggregate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl, filters })
      });

      return await response.json();
    } catch (error) {
      console.error('Fetch analytics error:', error);
      return { success: false, error: 'Failed to fetch analytics' };
    }
  }

  /**
   * Get paginated filtered data for display
   */
  async getFilteredData(
    sheetUrl: string, 
    filters: FilterState, 
    page: number = 1, 
    pageSize: number = 50
  ): Promise<ApiResponse<FilteredDataResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/filtered-data`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl, filters, page, pageSize })
      });

      return await response.json();
    } catch (error) {
      console.error('Get filtered data error:', error);
      return { success: false, error: 'Failed to fetch filtered data' };
    }
  }

  /**
   * Get all filtered data for CSV export
   */
  async getExportData(sheetUrl: string, filters: FilterState): Promise<ApiResponse<ExportDataResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/export`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl, filters })
      });

      return await response.json();
    } catch (error) {
      console.error('Get export data error:', error);
      return { success: false, error: 'Failed to fetch export data' };
    }
  }

  /**
   * Refresh cache for a sheet
   */
  async refreshCache(sheetUrl?: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/sheets/refresh-cache`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl })
      });

      return await response.json();
    } catch (error) {
      console.error('Refresh cache error:', error);
      return { success: false, error: 'Failed to refresh cache' };
    }
  }

  /**
   * Check for updates in the sheet (smart refresh)
   * Detects small changes (1-10 rows) for instant refresh
   */
  async checkForUpdates(sheetUrl: string): Promise<ApiResponse<UpdateCheckResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/sheets/check-updates`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: sheetUrl })
      });

      return await response.json();
    } catch (error) {
      console.error('Check updates error:', error);
      return { success: false, error: 'Failed to check for updates' };
    }
  }

  // ==================== User Sheets Management ====================

  /**
   * Get user's saved sheets
   */
  async getUserSheets(): Promise<ApiResponse<{ sheets: UserSheet[]; defaultSheetId: string | null }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/sheets`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('Get user sheets error:', error);
      return { success: false, error: 'Failed to fetch user sheets' };
    }
  }

  /**
   * Save a sheet to user's account
   */
  async saveUserSheet(sheetId: string, name: string, url: string): Promise<ApiResponse<{ sheets: UserSheet[]; defaultSheetId: string | null }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/sheets`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ sheetId, name, url })
      });

      return await response.json();
    } catch (error) {
      console.error('Save user sheet error:', error);
      return { success: false, error: 'Failed to save sheet' };
    }
  }

  /**
   * Remove a sheet from user's account
   */
  async removeUserSheet(sheetId: string): Promise<ApiResponse<{ sheets: UserSheet[]; defaultSheetId: string | null }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/sheets/${sheetId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('Remove user sheet error:', error);
      return { success: false, error: 'Failed to remove sheet' };
    }
  }

  /**
   * Set default sheet for user
   */
  async setDefaultSheet(sheetId: string): Promise<ApiResponse<{ defaultSheetId: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/sheets/${sheetId}/default`, {
        method: 'PUT',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('Set default sheet error:', error);
      return { success: false, error: 'Failed to set default sheet' };
    }
  }

  /**
   * Update user settings
   */
  async updateUserSettings(settings: Partial<UserSettings>): Promise<ApiResponse<{ settings: UserSettings }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/settings`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(settings)
      });

      return await response.json();
    } catch (error) {
      console.error('Update user settings error:', error);
      return { success: false, error: 'Failed to update settings' };
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(data: { displayName?: string; email?: string }): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });

      return await response.json();
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Failed to update profile' };
    }
  }

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });

      return await response.json();
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }

  /**
   * Get merged names for a specific sheet
   */
  async getMergedNames(sheetId: string): Promise<ApiResponse<Record<string, Record<string, string[]>>>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/merged-names/${encodeURIComponent(sheetId)}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      console.error('Get merged names error:', error);
      return { success: false, error: 'Failed to get merged names' };
    }
  }

  /**
   * Update merged names for a specific sheet
   */
  async updateMergedNames(sheetId: string, mergedNames: Record<string, Record<string, string[]>>): Promise<ApiResponse<Record<string, Record<string, string[]>>>> {
    try {
      const response = await fetch(`${API_BASE_URL}/user/merged-names/${encodeURIComponent(sheetId)}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ mergedNames })
      });

      return await response.json();
    } catch (error) {
      console.error('Update merged names error:', error);
      return { success: false, error: 'Failed to update merged names' };
    }
  }

  /**
   * Delete a specific merge
   */
  async deleteMerge(sheetId: string, category: string, canonicalName: string): Promise<ApiResponse<void>> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/user/merged-names/${encodeURIComponent(sheetId)}/${encodeURIComponent(category)}/${encodeURIComponent(canonicalName)}`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Delete merge error:', error);
      return { success: false, error: 'Failed to delete merge' };
    }
  }
}

export const dataService = new DataService();
