import NodeCache from 'node-cache';

/**
 * Enhanced caching service optimized for 20K-25K row datasets
 * Features: background refresh, TTL management, memory optimization
 */
class CacheService {
  constructor() {
    // Increased TTL for production: 10 minutes default, check every 2 minutes
    this.cache = new NodeCache({ 
      stdTTL: 600, 
      checkperiod: 120,
      useClones: false, // Disable cloning for large datasets - improves memory/speed
      maxKeys: 100 // Limit keys to prevent memory bloat
    });
    
    // Track refresh callbacks for background refresh
    this.refreshCallbacks = new Map();
    
    // Listen for expiring keys to trigger background refresh
    this.cache.on('expired', (key, value) => {
      console.log(`Cache expired: ${key.substring(0, 50)}...`);
    });
  }

  /**
   * Get cached value with optional stale-while-revalidate pattern
   */
  get(key) {
    return this.cache.get(key);
  }

  /**
   * Check remaining TTL for a key (in seconds)
   */
  getTtl(key) {
    return this.cache.getTtl(key);
  }

  /**
   * Check if cache is about to expire (within threshold seconds)
   */
  isExpiringSoon(key, thresholdSeconds = 60) {
    const ttl = this.cache.getTtl(key);
    if (!ttl) return true;
    const remainingMs = ttl - Date.now();
    return remainingMs < thresholdSeconds * 1000;
  }

  /**
   * Set cache value with optional TTL (in seconds)
   */
  set(key, value, ttl) {
    if (ttl) {
      this.cache.set(key, value, ttl);
    } else {
      this.cache.set(key, value);
    }
  }

  /**
   * Register a refresh callback for background refresh
   */
  registerRefreshCallback(keyPattern, callback) {
    this.refreshCallbacks.set(keyPattern, callback);
  }

  /**
   * Trigger background refresh for a key if it's expiring soon
   * Returns existing value immediately, refreshes in background
   */
  async getWithBackgroundRefresh(key, refreshCallback, ttl = 600) {
    const cached = this.cache.get(key);
    
    if (cached) {
      // If expiring soon, trigger background refresh
      if (this.isExpiringSoon(key, 120) && refreshCallback) {
        // Don't await - let it refresh in background
        this.backgroundRefresh(key, refreshCallback, ttl).catch(err => {
          console.error(`Background refresh failed for ${key}:`, err.message);
        });
      }
      return cached;
    }
    
    return null;
  }

  /**
   * Background refresh - fetches new data and updates cache
   */
  async backgroundRefresh(key, refreshCallback, ttl) {
    try {
      console.log(`Background refreshing: ${key.substring(0, 50)}...`);
      const newValue = await refreshCallback();
      this.set(key, newValue, ttl);
      console.log(`Background refresh complete: ${key.substring(0, 50)}...`);
    } catch (error) {
      console.error(`Background refresh error:`, error.message);
    }
  }

  /**
   * Delete cached value
   */
  delete(key) {
    this.cache.del(key);
  }

  /**
   * Clear all cached values for a specific sheet URL
   */
  clearForSheet(sheetUrl) {
    const keys = this.cache.keys();
    keys.forEach(key => {
      if (key.includes(sheetUrl)) {
        this.cache.del(key);
      }
    });
  }

  /**
   * Clear all cached values with keys starting with given prefix
   */
  clearByPrefix(prefix) {
    const keys = this.cache.keys();
    let count = 0;
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        this.cache.del(key);
        count++;
      }
    });
    return count;
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache.flushAll();
  }

  /**
   * Get cache stats with memory info
   */
  getStats() {
    const stats = this.cache.getStats();
    const keys = this.cache.keys();
    return {
      ...stats,
      keyCount: keys.length,
      keys: keys.map(k => k.substring(0, 50))
    };
  }

  /**
   * Pre-warm cache with data (useful for startup)
   */
  async preWarm(key, fetchCallback, ttl = 600) {
    const existing = this.cache.get(key);
    if (!existing) {
      try {
        const data = await fetchCallback();
        this.set(key, data, ttl);
        console.log(`Cache pre-warmed: ${key.substring(0, 50)}...`);
        return data;
      } catch (error) {
        console.error(`Pre-warm failed for ${key}:`, error.message);
        throw error;
      }
    }
    return existing;
  }
}

export const cacheService = new CacheService();
