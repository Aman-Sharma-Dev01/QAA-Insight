import { googleSheetsService } from './googleSheets.js';
import { cacheService } from './cache.js';
import { createNameMapping, applyNameMapping, normalizeName } from './nameNormalizer.js';

// Cache TTL constants (in seconds) - optimized for 20K-25K datasets
const METADATA_CACHE_TTL = 600;   // 10 minutes (rarely changes)
const ANALYTICS_CACHE_TTL = 300;  // 5 minutes (computed data)
const FILTERED_DATA_CACHE_TTL = 180; // 3 minutes (frequent access)
const NAME_MAPPING_CACHE_TTL = 600; // 10 minutes for name mappings

/**
 * Likert scale mapping for converting text responses to numeric scores
 * Using Map for O(1) lookup performance
 */
const LIKERT_MAPPING = new Map([
  ['strongly agree', 5],
  ['agree', 4],
  ['neutral', 3],
  ['disagree', 2],
  ['strongly disagree', 1],
  ['excellent', 5],
  ['very good', 4],
  ['good', 3],
  ['satisfactory', 2],
  ['poor', 1],
  ['5', 5],
  ['4', 4],
  ['3', 3],
  ['2', 2],
  ['1', 1]
]);

/**
 * Rating thresholds for faculty performance
 */
const RATING_THRESHOLDS = {
  EXCELLENT: 4.5,
  VERY_GOOD: 4.0,
  GOOD: 3.5,
  SATISFACTORY: 3.0,
  NEEDS_IMPROVEMENT: 0
};

/**
 * Get rating label based on score
 */
const getRatingLabel = (score) => {
  if (score >= RATING_THRESHOLDS.EXCELLENT) return 'Excellent';
  if (score >= RATING_THRESHOLDS.VERY_GOOD) return 'Very Good';
  if (score >= RATING_THRESHOLDS.GOOD) return 'Good';
  if (score >= RATING_THRESHOLDS.SATISFACTORY) return 'Satisfactory';
  return 'Needs Improvement';
};

/**
 * Columns that should be treated as filters (categorical data)
 * These are detected automatically but can be overridden
 */
const FILTER_KEYWORDS = [
  'department', 'course', 'year', 'section', 'semester',
  'faculty', 'teacher', 'professor', 'subject', 'gender',
  'branch', 'batch', 'division', 'program', 'class', 'school'
];

/**
 * Columns that should be excluded from filters
 * More specific patterns to avoid false positives (e.g., "Course Name" should NOT be excluded)
 */
const EXCLUDE_KEYWORDS = [
  'timestamp', 'email address', 'student name', 'roll no', 'roll number', 
  'phone', 'mobile', 'contact'
];

// Exact match exclusions (column name equals exactly this)
const EXCLUDE_EXACT = [
  'email', 'id', 'roll', 'sn', 'sr no', 'serial'
];

// Parameter descriptions for feedback questions
const PARAMETER_DESCRIPTIONS = {
  'class starts and ends on time': 'Punctuality - Faculty adheres to scheduled class timings',
  'sufficient time': 'Time Management - Adequate time allocation for course content',
  'well prepared': 'Preparedness - Level of faculty preparation for classes',
  'confident': 'Confidence - Faculty demonstrates confidence in subject matter',
  'content is delivered': 'Clarity - Content is delivered clearly and effectively',
  'respectful': 'Communication - Use of respectful, clear, and simple language',
  'encourages': 'Engagement - Faculty encourages questions and discussions',
  'simple language': 'Language - Use of simple and understandable language',
  'feedback': 'Assessment Feedback - Quality of feedback on assignments/projects'
};

// Pre-compiled Sets for O(1) keyword lookup
const FILTER_KEYWORDS_SET = new Set(FILTER_KEYWORDS);
const EXCLUDE_KEYWORDS_SET = new Set(EXCLUDE_KEYWORDS);

class AnalyticsService {
  constructor() {
    // Pre-build filter index for fast filtering
    this.filterIndexCache = new Map();
  }

  /**
   * Get metadata from sheet including headers and filter options
   */
  async getSheetMetadata(sheetUrl) {
    const cacheKey = `metadata_${sheetUrl}`;
    
    // Use background refresh for metadata
    const cached = await cacheService.getWithBackgroundRefresh(
      cacheKey,
      async () => this.buildMetadata(sheetUrl),
      METADATA_CACHE_TTL
    );
    
    if (cached) {
      return cached;
    }

    return this.buildMetadata(sheetUrl);
  }

  /**
   * Build metadata from sheet data - optimized for large datasets
   */
  async buildMetadata(sheetUrl) {
    const cacheKey = `metadata_${sheetUrl}`;
    const startTime = Date.now();

    const { headers, data } = await googleSheetsService.getSheetData(sheetUrl);
    
    // Find faculty column for name normalization
    const facultyColumn = headers.find(h => 
      h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher')
    );
    
    // Get or create name mapping for faculty names
    let nameMapping = null;
    if (facultyColumn) {
      const nameMappingCacheKey = `namemapping_${sheetUrl}`;
      nameMapping = cacheService.get(nameMappingCacheKey);
      
      if (!nameMapping) {
        nameMapping = createNameMapping(data, facultyColumn);
        cacheService.set(nameMappingCacheKey, nameMapping, NAME_MAPPING_CACHE_TTL);
        console.log(`Name normalization for metadata: ${nameMapping.totalOriginal} → ${nameMapping.totalNormalized} names`);
      }
    }
    
    // Identify filter columns - optimized with Set lookups
    const filters = {};
    const headerCount = headers.length;
    
    for (let i = 0; i < headerCount; i++) {
      const header = headers[i];
      const headerLower = header.toLowerCase().trim();
      
      // First check if it's a filterable column (filter takes priority)
      let isFilterable = false;
      for (const keyword of FILTER_KEYWORDS) {
        if (headerLower.includes(keyword)) {
          isFilterable = true;
          break;
        }
      }
      
      // If it's filterable, don't exclude it
      // If not filterable, check exclusions and skip this column
      if (!isFilterable) {
        // Skip if exact match with excluded terms
        if (EXCLUDE_EXACT.includes(headerLower)) continue;
        
        // Skip if contains excluded keywords
        let isExcluded = false;
        for (const keyword of EXCLUDE_KEYWORDS) {
          if (headerLower.includes(keyword)) {
            isExcluded = true;
            break;
          }
        }
        if (isExcluded) continue;
        
        // Not filterable and not excluded - skip (we only want filter columns)
        continue;
      }
      
      // Column is filterable - extract unique values
      const uniqueSet = new Set();
      const dataLen = data.length;
      
      // Check if this is the faculty column - show ALL original names (not normalized)
      // Name normalization will be applied during filtering, not here
      
      for (let j = 0; j < dataLen; j++) {
        let val = data[j][header];
        if (val !== undefined && val !== null && val !== '') {
          val = String(val).trim();
          // Don't normalize here - show all original names
          uniqueSet.add(val);
        }
      }
      
      if (uniqueSet.size > 0 && uniqueSet.size <= 500) {
        filters[header] = Array.from(uniqueSet).sort();
      }
    }

    const metadata = {
      headers,
      filters,
      totalRows: data.length,
      nameNormalization: nameMapping ? {
        originalCount: nameMapping.totalOriginal,
        normalizedCount: nameMapping.totalNormalized
      } : null
    };

    console.log(`Built metadata for ${data.length} rows in ${Date.now() - startTime}ms`);
    
    // Cache with new TTL
    cacheService.set(cacheKey, metadata, METADATA_CACHE_TTL);
    
    return metadata;
  }

  /**
   * Get aggregated analytics based on filters - optimized with caching
   */
  async getAnalytics(sheetUrl, filters = {}) {
    const filterKey = Object.keys(filters).length > 0 ? JSON.stringify(filters) : 'all';
    const cacheKey = `analytics_${sheetUrl}_${filterKey}`;
    
    // Use background refresh for analytics
    const cached = await cacheService.getWithBackgroundRefresh(
      cacheKey,
      async () => this.computeAnalytics(sheetUrl, filters),
      ANALYTICS_CACHE_TTL
    );
    
    if (cached) {
      return cached;
    }

    return this.computeAnalytics(sheetUrl, filters);
  }

  /**
   * Compute analytics from data
   */
  async computeAnalytics(sheetUrl, filters) {
    const filterKey = Object.keys(filters).length > 0 ? JSON.stringify(filters) : 'all';
    const cacheKey = `analytics_${sheetUrl}_${filterKey}`;
    const startTime = Date.now();

    const { headers, data } = await googleSheetsService.getSheetData(sheetUrl);
    
    // Find faculty column and normalize names
    const facultyColumn = headers.find(h => 
      h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher')
    );
    
    let processedData = data;
    let nameNormalizationInfo = null;
    let nameMapping = null;
    
    if (facultyColumn) {
      // Get or create name mapping
      const nameMappingCacheKey = `namemapping_${sheetUrl}`;
      nameMapping = cacheService.get(nameMappingCacheKey);
      
      if (!nameMapping) {
        console.log('Creating name mapping for faculty names...');
        nameMapping = createNameMapping(data, facultyColumn);
        cacheService.set(nameMappingCacheKey, nameMapping, NAME_MAPPING_CACHE_TTL);
        console.log(`Name normalization: ${nameMapping.totalOriginal} original names → ${nameMapping.totalNormalized} normalized names`);
      }
      
      // Apply name mapping to data (normalize faculty names for analytics)
      processedData = applyNameMapping(data, facultyColumn, nameMapping.mapping);
      nameNormalizationInfo = {
        originalCount: nameMapping.totalOriginal,
        normalizedCount: nameMapping.totalNormalized,
        groups: nameMapping.groups
      };
    }
    
    // Apply filters (pass nameMapping so filter values expand to include all variants)
    let filteredData = this.applyFilters(processedData, filters, nameMapping, facultyColumn);
    
    // Identify question columns (columns with Likert-scale responses)
    const questionColumns = this.identifyQuestionColumns(headers, filteredData);
    
    // Calculate analytics
    const analytics = this.calculateAnalytics(filteredData, headers, questionColumns);
    
    // Add name normalization info if available
    if (nameNormalizationInfo) {
      analytics.nameNormalization = nameNormalizationInfo;
    }
    
    console.log(`Computed analytics for ${filteredData.length} rows in ${Date.now() - startTime}ms`);
    
    // Cache with new TTL
    cacheService.set(cacheKey, analytics, ANALYTICS_CACHE_TTL);
    
    return analytics;
  }

  /**
   * Get filtered raw data for display/export - optimized with caching
   * Shows ORIGINAL names, but filters using name groups (select one variant = match all)
   */
  async getFilteredData(sheetUrl, filters = {}, page = 1, pageSize = 100) {
    const filterKey = Object.keys(filters).length > 0 ? JSON.stringify(filters) : 'all';
    const cacheKey = `filtered_${sheetUrl}_${filterKey}`;
    
    // Try to get cached filtered results (without pagination)
    let filteredData = cacheService.get(cacheKey);
    let headers;
    
    if (!filteredData) {
      const sheetData = await googleSheetsService.getSheetData(sheetUrl);
      headers = sheetData.headers;
      
      // Get name mapping for faculty column (for filter expansion)
      const facultyColumn = headers.find(h => 
        h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher')
      );
      
      let nameMapping = null;
      if (facultyColumn) {
        const nameMappingCacheKey = `namemapping_${sheetUrl}`;
        nameMapping = cacheService.get(nameMappingCacheKey);
        
        if (!nameMapping) {
          nameMapping = createNameMapping(sheetData.data, facultyColumn);
          cacheService.set(nameMappingCacheKey, nameMapping, NAME_MAPPING_CACHE_TTL);
        }
      }
      
      // Don't normalize data - show original names
      // But pass nameMapping to applyFilters so faculty filter expands to all variants
      filteredData = this.applyFilters(sheetData.data, filters, nameMapping, facultyColumn);
      
      // Cache filtered results for quick pagination
      cacheService.set(cacheKey, { headers, filteredData }, FILTERED_DATA_CACHE_TTL);
    } else {
      headers = filteredData.headers;
      filteredData = filteredData.filteredData;
    }
    
    // Pagination - very fast on cached data
    const totalRows = filteredData.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = filteredData.slice(startIndex, endIndex);
    
    return {
      headers,
      data: paginatedData,
      pagination: {
        page,
        pageSize,
        totalRows,
        totalPages
      }
    };
  }

  /**
   * Get all filtered data for CSV export
   * Shows ORIGINAL names, but filters using name groups
   */
  async getFilteredDataForExport(sheetUrl, filters = {}) {
    const { headers, data } = await googleSheetsService.getSheetData(sheetUrl);
    
    // Get name mapping for faculty column (for filter expansion)
    const facultyColumn = headers.find(h => 
      h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher')
    );
    
    let nameMapping = null;
    if (facultyColumn) {
      const nameMappingCacheKey = `namemapping_${sheetUrl}`;
      nameMapping = cacheService.get(nameMappingCacheKey);
      
      if (!nameMapping) {
        nameMapping = createNameMapping(data, facultyColumn);
        cacheService.set(nameMappingCacheKey, nameMapping, NAME_MAPPING_CACHE_TTL);
      }
    }
    
    // Don't normalize data - export original names
    // But use nameMapping for filter expansion
    const filteredData = this.applyFilters(data, filters, nameMapping, facultyColumn);
    
    return {
      headers,
      data: filteredData,
      totalRows: filteredData.length
    };
  }

  /**
   * Get name mappings for a sheet (for display in UI)
   */
  async getNameMappings(sheetUrl) {
    const { headers, data } = await googleSheetsService.getSheetData(sheetUrl);
    
    const facultyColumn = headers.find(h => 
      h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher')
    );
    
    if (!facultyColumn) {
      return {
        success: false,
        message: 'No faculty column found',
        mappings: []
      };
    }
    
    const nameMappingCacheKey = `namemapping_${sheetUrl}`;
    let nameMapping = cacheService.get(nameMappingCacheKey);
    
    if (!nameMapping) {
      nameMapping = createNameMapping(data, facultyColumn);
      cacheService.set(nameMappingCacheKey, nameMapping, NAME_MAPPING_CACHE_TTL);
    }
    
    return {
      success: true,
      facultyColumn,
      originalCount: nameMapping.totalOriginal,
      normalizedCount: nameMapping.totalNormalized,
      groups: nameMapping.groups.map(g => ({
        canonical: g.canonical,
        variants: g.variants,
        totalFeedbacks: g.totalCount
      }))
    };
  }

  /**
   * Clear name mapping cache to force refresh
   */
  async clearNameMappingCache(sheetUrl) {
    const cacheKey = `namemapping_${sheetUrl}`;
    cacheService.delete(cacheKey);
    
    // Also clear related caches
    cacheService.clearByPrefix(`metadata_${sheetUrl}`);
    cacheService.clearByPrefix(`analytics_${sheetUrl}`);
    cacheService.clearByPrefix(`filtered_${sheetUrl}`);
    
    return { success: true, message: 'Name mapping cache cleared' };
  }

  /**
   * Apply filters to data - optimized for 20K-25K rows
   * Uses Set for O(1) value lookups instead of Array.includes O(n)
   */
  applyFilters(data, filters, nameMapping = null, facultyColumn = null) {
    if (!filters || Object.keys(filters).length === 0) {
      return data;
    }

    const startTime = Date.now();
    
    // Build expanded filter entries - for faculty column, expand to include all similar names
    const filterEntries = Object.entries(filters)
      .filter(([key, values]) => values && values.length > 0)
      .map(([key, values]) => {
        // If this is the faculty column and we have name mapping, expand values
        if (key === facultyColumn && nameMapping && nameMapping.reverseMapping) {
          const expandedValues = new Set();
          for (const selectedName of values) {
            // Get canonical name for selected value
            const canonicalName = nameMapping.mapping[selectedName] || selectedName;
            // Get all variants that map to this canonical name
            const variants = nameMapping.reverseMapping[canonicalName] || [selectedName];
            variants.forEach(v => expandedValues.add(v));
          }
          console.log(`Faculty filter expanded: ${values.length} selected → ${expandedValues.size} variants`);
          return [key, expandedValues];
        }
        return [key, new Set(values)];
      });
    
    if (filterEntries.length === 0) {
      return data;
    }

    const dataLen = data.length;
    const result = [];
    
    // Optimized loop with early exits
    for (let i = 0; i < dataLen; i++) {
      const row = data[i];
      let matches = true;
      
      for (let j = 0; j < filterEntries.length; j++) {
        const [key, valueSet] = filterEntries[j];
        const cellValue = String(row[key] || '').trim();
        
        if (!valueSet.has(cellValue)) {
          matches = false;
          break; // Early exit on first non-match
        }
      }
      
      if (matches) {
        result.push(row);
      }
    }
    
    console.log(`Filtered ${dataLen} → ${result.length} rows in ${Date.now() - startTime}ms`);
    return result;
  }

  /**
   * Identify which columns contain question/rating data - optimized
   */
  identifyQuestionColumns(headers, data) {
    const questionColumns = [];
    const sampleSize = Math.min(100, data.length);
    
    // Metadata columns to exclude
    const metadataPatterns = [
      'timestamp', 'email', 'school name', 'department', 'semester',
      'class-section', 'name of faculty', 'course name', 'special remark'
    ];
    
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const headerLower = header.toLowerCase().trim();
      
      // Skip short columns (likely identifiers, not questions) - must be at least 15 chars
      if (header.trim().length < 15) {
        continue;
      }
      
      // Skip metadata columns
      const isMetadata = metadataPatterns.some(pattern => 
        headerLower === pattern || 
        headerLower.startsWith(pattern) ||
        (headerLower.includes('remark') && headerLower.includes('special'))
      );
      
      if (isMetadata) {
        continue;
      }
      
      // Check sample values for Likert responses or numeric ratings
      let hasLikertResponses = false;
      let hasNumericRatings = false;
      
      for (let j = 0; j < sampleSize; j++) {
        const val = String(data[j][header] || '').toLowerCase().trim();
        
        if (LIKERT_MAPPING.has(val)) {
          hasLikertResponses = true;
          break;
        }
        
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 1 && num <= 5) {
          hasNumericRatings = true;
        }
      }
      
      // Include if it has Likert or numeric responses
      if (hasLikertResponses || hasNumericRatings) {
        questionColumns.push(header);
      }
    }
    
    return questionColumns;
  }

  /**
   * Calculate all analytics from filtered data - Enhanced for Faculty Feedback
   */
  calculateAnalytics(data, headers, questionColumns) {
    const totalResponses = data.length;
    
    if (totalResponses === 0) {
      return {
        totalResponses: 0,
        averageRating: 0,
        questionScores: [],
        departmentWise: [],
        timeTrends: [],
        facultyScores: [],
        sectionWise: [],
        courseWise: [],
        semesterWise: [],
        overallStats: {
          totalFaculty: 0,
          totalCourses: 0,
          totalSections: 0,
          averageByParameter: []
        },
        topPerformers: [],
        needsImprovement: []
      };
    }

    // Calculate question scores with descriptions
    const questionScores = this.calculateQuestionScores(data, questionColumns);
    
    // Calculate overall average
    const averageRating = questionScores.length > 0
      ? questionScores.reduce((sum, q) => sum + q.score, 0) / questionScores.length
      : 0;

    // Calculate department-wise scores
    const departmentWise = this.calculateGroupScores(data, headers, 'department', questionColumns);
    
    // Calculate faculty scores with detailed information
    const facultyScores = this.calculateFacultyScores(data, headers, questionColumns);
    
    // Calculate section-wise scores
    const sectionWise = this.calculateSectionScores(data, headers, questionColumns);
    
    // Calculate course-wise scores
    const courseWise = this.calculateCourseScores(data, headers, questionColumns);
    
    // Calculate semester-wise scores
    const semesterWise = this.calculateSemesterScores(data, headers, questionColumns);
    
    // Calculate time trends
    const timeTrends = this.calculateTimeTrends(data, headers, questionColumns);
    
    // Get unique counts
    const uniqueFaculty = new Set();
    const uniqueCourses = new Set();
    const uniqueSections = new Set();
    
    const facultyCol = headers.find(h => h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher'));
    const courseCol = headers.find(h => h.toLowerCase().includes('course') || h.toLowerCase().includes('subject'));
    const sectionCol = headers.find(h => h.toLowerCase().includes('section') || h.toLowerCase().includes('class'));
    
    data.forEach(row => {
      if (facultyCol && row[facultyCol]) uniqueFaculty.add(String(row[facultyCol]).trim());
      if (courseCol && row[courseCol]) uniqueCourses.add(String(row[courseCol]).trim());
      if (sectionCol && row[sectionCol]) uniqueSections.add(String(row[sectionCol]).trim());
    });
    
    // Top performers and needs improvement
    const sortedFaculty = [...facultyScores].sort((a, b) => b.score - a.score);
    const topPerformers = sortedFaculty.slice(0, 5);
    const needsImprovement = sortedFaculty.filter(f => f.score < 3.0).slice(0, 5);

    return {
      totalResponses,
      averageRating: Math.round(averageRating * 100) / 100,
      questionScores,
      departmentWise,
      timeTrends,
      facultyScores,
      sectionWise,
      courseWise,
      semesterWise,
      overallStats: {
        totalFaculty: uniqueFaculty.size,
        totalCourses: uniqueCourses.size,
        totalSections: uniqueSections.size,
        averageByParameter: questionScores
      },
      topPerformers,
      needsImprovement
    };
  }

  /**
   * Calculate detailed faculty scores with courses and sections handled
   */
  calculateFacultyScores(data, headers, questionColumns) {
    // Find the faculty column
    const facultyColumn = headers.find(h => 
      h.toLowerCase().includes('faculty') || h.toLowerCase().includes('teacher')
    );
    
    const courseColumn = headers.find(h => 
      h.toLowerCase().includes('course') || h.toLowerCase().includes('subject')
    );
    
    const sectionColumn = headers.find(h => 
      h.toLowerCase().includes('section') || h.toLowerCase().includes('class')
    );
    
    if (!facultyColumn || questionColumns.length === 0) {
      return [];
    }

    const facultyData = {};
    
    data.forEach(row => {
      const facultyName = String(row[facultyColumn] || '').trim();
      if (!facultyName) return;
      
      if (!facultyData[facultyName]) {
        facultyData[facultyName] = { 
          scores: [], 
          count: 0,
          courses: new Set(),
          sections: new Set()
        };
      }
      
      // Track courses and sections
      if (courseColumn && row[courseColumn]) {
        facultyData[facultyName].courses.add(String(row[courseColumn]).trim());
      }
      if (sectionColumn && row[sectionColumn]) {
        facultyData[facultyName].sections.add(String(row[sectionColumn]).trim());
      }
      
      // Calculate average score across all questions for this row
      let rowScore = 0;
      let validQuestions = 0;
      
      questionColumns.forEach(q => {
        const rawValue = row[q];
        let score;
        
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          rowScore += score;
          validQuestions++;
        }
      });
      
      if (validQuestions > 0) {
        facultyData[facultyName].scores.push(rowScore / validQuestions);
        facultyData[facultyName].count++;
      }
    });

    const facultyScores = Object.entries(facultyData)
      .map(([name, { scores, count, courses, sections }]) => ({
        name,
        score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        feedbackCount: count,
        coursesHandled: Array.from(courses),
        sectionsHandled: Array.from(sections),
        rating: getRatingLabel(scores.reduce((a, b) => a + b, 0) / scores.length)
      }))
      .sort((a, b) => b.score - a.score);
    
    // Assign ranks
    facultyScores.forEach((f, idx) => {
      f.rank = idx + 1;
    });
    
    return facultyScores;
  }

  /**
   * Calculate section-wise scores
   */
  calculateSectionScores(data, headers, questionColumns) {
    const sectionColumn = headers.find(h => 
      h.toLowerCase().includes('section') || h.toLowerCase().includes('class')
    );
    
    const semesterColumn = headers.find(h => 
      h.toLowerCase().includes('semester')
    );
    
    const courseColumn = headers.find(h => 
      h.toLowerCase().includes('course') || h.toLowerCase().includes('subject')
    );
    
    if (!sectionColumn || questionColumns.length === 0) {
      return [];
    }

    const sectionData = {};
    
    data.forEach(row => {
      const section = String(row[sectionColumn] || '').trim();
      const semester = semesterColumn ? String(row[semesterColumn] || '').trim() : '';
      const course = courseColumn ? String(row[courseColumn] || '').trim() : '';
      
      if (!section) return;
      
      const key = `${section}|${semester}|${course}`;
      
      if (!sectionData[key]) {
        sectionData[key] = { 
          section,
          semester,
          course,
          scores: [], 
          count: 0
        };
      }
      
      let rowScore = 0;
      let validQuestions = 0;
      
      questionColumns.forEach(q => {
        const rawValue = row[q];
        let score;
        
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          rowScore += score;
          validQuestions++;
        }
      });
      
      if (validQuestions > 0) {
        sectionData[key].scores.push(rowScore / validQuestions);
        sectionData[key].count++;
      }
    });

    return Object.values(sectionData)
      .map(({ section, semester, course, scores, count }) => ({
        section,
        semester,
        course,
        averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        feedbackCount: count
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
  }

  /**
   * Calculate course-wise scores
   */
  calculateCourseScores(data, headers, questionColumns) {
    const courseColumn = headers.find(h => 
      h.toLowerCase().includes('course') || h.toLowerCase().includes('subject')
    );
    
    const sectionColumn = headers.find(h => 
      h.toLowerCase().includes('section') || h.toLowerCase().includes('class')
    );
    
    if (!courseColumn || questionColumns.length === 0) {
      return [];
    }

    const courseData = {};
    
    data.forEach(row => {
      const course = String(row[courseColumn] || '').trim();
      if (!course) return;
      
      if (!courseData[course]) {
        courseData[course] = { 
          scores: [], 
          count: 0,
          sections: new Set()
        };
      }
      
      if (sectionColumn && row[sectionColumn]) {
        courseData[course].sections.add(String(row[sectionColumn]).trim());
      }
      
      let rowScore = 0;
      let validQuestions = 0;
      
      questionColumns.forEach(q => {
        const rawValue = row[q];
        let score;
        
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          rowScore += score;
          validQuestions++;
        }
      });
      
      if (validQuestions > 0) {
        courseData[course].scores.push(rowScore / validQuestions);
        courseData[course].count++;
      }
    });

    return Object.entries(courseData)
      .map(([courseName, { scores, count, sections }]) => ({
        courseName,
        averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        feedbackCount: count,
        sections: Array.from(sections)
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
  }

  /**
   * Calculate semester-wise scores
   */
  calculateSemesterScores(data, headers, questionColumns) {
    const semesterColumn = headers.find(h => 
      h.toLowerCase().includes('semester')
    );
    
    if (!semesterColumn || questionColumns.length === 0) {
      return [];
    }

    const semesterData = {};
    
    data.forEach(row => {
      const semester = String(row[semesterColumn] || '').trim();
      if (!semester) return;
      
      if (!semesterData[semester]) {
        semesterData[semester] = { scores: [], count: 0 };
      }
      
      let rowScore = 0;
      let validQuestions = 0;
      
      questionColumns.forEach(q => {
        const rawValue = row[q];
        let score;
        
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          rowScore += score;
          validQuestions++;
        }
      });
      
      if (validQuestions > 0) {
        semesterData[semester].scores.push(rowScore / validQuestions);
        semesterData[semester].count++;
      }
    });

    return Object.entries(semesterData)
      .map(([semester, { scores, count }]) => ({
        semester,
        score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        count
      }))
      .sort((a, b) => a.semester.localeCompare(b.semester));
  }

  /**
   * Calculate scores for each question
   */
  calculateQuestionScores(data, questionColumns) {
    return questionColumns.map(question => {
      const distribution = {
        'Strongly Agree': 0,
        'Agree': 0,
        'Neutral': 0,
        'Disagree': 0,
        'Strongly Disagree': 0
      };
      
      let totalScore = 0;
      let validResponses = 0;
      
      data.forEach(row => {
        const rawValue = row[question];
        let score;
        
        // Handle numeric values directly
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          totalScore += score;
          validResponses++;
          
          // Map to distribution
          if (score === 5) distribution['Strongly Agree']++;
          else if (score === 4) distribution['Agree']++;
          else if (score === 3) distribution['Neutral']++;
          else if (score === 2) distribution['Disagree']++;
          else if (score === 1) distribution['Strongly Disagree']++;
        }
      });
      
      const avgScore = validResponses > 0 ? totalScore / validResponses : 0;
      
      return {
        question,
        score: Math.round(avgScore * 100) / 100,
        distribution,
        validResponses
      };
    });
  }

  /**
   * Calculate scores grouped by a category (department, faculty, etc.)
   */
  calculateGroupScores(data, headers, groupKeyword, questionColumns) {
    // Find the grouping column
    const groupColumn = headers.find(h => 
      h.toLowerCase().includes(groupKeyword)
    );
    
    if (!groupColumn || questionColumns.length === 0) {
      return [];
    }

    const groupedData = {};
    
    data.forEach(row => {
      const groupValue = String(row[groupColumn] || '').trim();
      if (!groupValue) return;
      
      if (!groupedData[groupValue]) {
        groupedData[groupValue] = { scores: [], count: 0 };
      }
      
      // Calculate average score across all questions for this row
      let rowScore = 0;
      let validQuestions = 0;
      
      questionColumns.forEach(q => {
        const rawValue = row[q];
        let score;
        
        // Handle numeric values directly
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          rowScore += score;
          validQuestions++;
        }
      });
      
      if (validQuestions > 0) {
        groupedData[groupValue].scores.push(rowScore / validQuestions);
        groupedData[groupValue].count++;
      }
    });

    return Object.entries(groupedData)
      .map(([name, { scores, count }]) => ({
        name,
        score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        count
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10
  }

  /**
   * Calculate time-based trends
   */
  calculateTimeTrends(data, headers, questionColumns) {
    // Find timestamp column
    const timestampColumn = headers.find(h => 
      h.toLowerCase().includes('timestamp') || 
      h.toLowerCase().includes('date') ||
      h.toLowerCase().includes('time')
    );
    
    if (!timestampColumn || questionColumns.length === 0) {
      return [];
    }

    const weeklyData = {};
    
    data.forEach(row => {
      const timestamp = row[timestampColumn];
      if (!timestamp) return;
      
      // Parse date and get week number
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return;
      
      const weekKey = this.getWeekKey(date);
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { scores: [], date };
      }
      
      // Calculate average score for this row
      let rowScore = 0;
      let validQuestions = 0;
      
      questionColumns.forEach(q => {
        const rawValue = row[q];
        let score;
        
        // Handle numeric values directly
        if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 5) {
          score = Math.round(rawValue);
        } else {
          const value = String(rawValue || '').toLowerCase().trim();
          score = LIKERT_MAPPING.get(value);
        }
        
        if (score !== undefined && score >= 1 && score <= 5) {
          rowScore += score;
          validQuestions++;
        }
      });
      
      if (validQuestions > 0) {
        weeklyData[weekKey].scores.push(rowScore / validQuestions);
      }
    });

    return Object.entries(weeklyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10) // Last 10 periods
      .map(([key, { scores }]) => ({
        label: key,
        value: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      }));
  }

  /**
   * Get week key for grouping
   */
  getWeekKey(date) {
    const year = date.getFullYear();
    const month = date.toLocaleString('default', { month: 'short' });
    const weekOfMonth = Math.ceil(date.getDate() / 7);
    return `${month} W${weekOfMonth}`;
  }
}

export const analyticsService = new AnalyticsService();
