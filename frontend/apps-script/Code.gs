
/**
 * EduPulse Backend Service - Google Apps Script
 * =============================================
 * This is an alternative backend that runs entirely on Google's infrastructure.
 * Deploy this as a Web App with:
 * - Execute as: Me (your account)
 * - Who has access: Anyone (for API access) or Anyone with Google Account
 * 
 * DEPLOYMENT STEPS:
 * 1. Go to script.google.com and create a new project
 * 2. Paste this entire code
 * 3. Click Deploy > New deployment
 * 4. Select type: Web app
 * 5. Configure access as mentioned above
 * 6. Copy the Web App URL and use it in your frontend
 */

// ============================================
// CONFIGURATION
// ============================================

const LIKERT_MAP = {
  'strongly agree': 5,
  'agree': 4,
  'neutral': 3,
  'disagree': 2,
  'strongly disagree': 1,
  'excellent': 5,
  'very good': 4,
  'good': 3,
  'satisfactory': 2,
  'poor': 1,
  '5': 5, '4': 4, '3': 3, '2': 2, '1': 1
};

const FILTER_KEYWORDS = ['department', 'course', 'year', 'section', 'semester', 
                         'faculty', 'teacher', 'professor', 'subject', 'gender', 
                         'branch', 'batch', 'division', 'program'];

const EXCLUDE_KEYWORDS = ['timestamp', 'email', 'name', 'student', 'roll', 'id', 'phone', 'mobile'];

// ============================================
// MAIN ENTRY POINTS
// ============================================

/**
 * Handle GET requests
 */
function doGet(e) {
  return handleRequest(e);
}

/**
 * Handle POST requests
 */
function doPost(e) {
  const postData = e.postData ? JSON.parse(e.postData.contents) : {};
  e.parameter = { ...e.parameter, ...postData };
  return handleRequest(e);
}

/**
 * Main request handler
 */
function handleRequest(e) {
  const action = e.parameter.action;
  const sheetUrl = e.parameter.url;
  const filters = e.parameter.filters ? JSON.parse(e.parameter.filters) : {};
  const page = parseInt(e.parameter.page) || 1;
  const pageSize = parseInt(e.parameter.pageSize) || 100;
  
  try {
    // Validate URL
    if (!sheetUrl && action !== 'health') {
      return createJsonResponse({ success: false, error: 'Sheet URL is required' });
    }

    switch (action) {
      case 'health':
        return createJsonResponse({ success: true, status: 'ok', timestamp: new Date().toISOString() });
      
      case 'validate':
        return handleValidate(sheetUrl);
      
      case 'metadata':
        return handleMetadata(sheetUrl);
      
      case 'analytics':
        return handleAnalytics(sheetUrl, filters);
      
      case 'filtered-data':
        return handleFilteredData(sheetUrl, filters, page, pageSize);
      
      case 'export':
        return handleExport(sheetUrl, filters);
      
      default:
        return createJsonResponse({ success: false, error: 'Invalid action. Use: validate, metadata, analytics, filtered-data, export' });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

// ============================================
// ACTION HANDLERS
// ============================================

/**
 * Validate sheet access
 */
function handleValidate(sheetUrl) {
  try {
    const ss = SpreadsheetApp.openByUrl(sheetUrl);
    return createJsonResponse({
      success: true,
      data: {
        title: ss.getName(),
        sheetCount: ss.getSheets().length
      }
    });
  } catch (err) {
    return createJsonResponse({
      success: false,
      error: 'Cannot access sheet. Make sure the sheet is shared with view access.'
    });
  }
}

/**
 * Get sheet metadata and filter options
 */
function handleMetadata(sheetUrl) {
  const { headers, rows } = getSheetData(sheetUrl);
  const filters = extractFilterValues(headers, rows);
  
  return createJsonResponse({
    success: true,
    data: {
      headers: headers,
      filters: filters,
      totalRows: rows.length
    }
  });
}

/**
 * Get aggregated analytics
 */
function handleAnalytics(sheetUrl, filters) {
  const { headers, rows } = getSheetData(sheetUrl);
  const filteredRows = applyFilters(headers, rows, filters);
  const questionColumns = identifyQuestionColumns(headers, filteredRows);
  const analytics = calculateAnalytics(filteredRows, headers, questionColumns);
  
  return createJsonResponse({
    success: true,
    data: analytics
  });
}

/**
 * Get paginated filtered data
 */
function handleFilteredData(sheetUrl, filters, page, pageSize) {
  const { headers, rows } = getSheetData(sheetUrl);
  const filteredRows = applyFilters(headers, rows, filters);
  
  const totalRows = filteredRows.length;
  const totalPages = Math.ceil(totalRows / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const paginatedData = filteredRows.slice(startIndex, endIndex);
  
  // Convert to array of objects
  const data = paginatedData.map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });
  
  return createJsonResponse({
    success: true,
    data: {
      headers: headers,
      data: data,
      pagination: {
        page: page,
        pageSize: pageSize,
        totalRows: totalRows,
        totalPages: totalPages
      }
    }
  });
}

/**
 * Get all filtered data for export
 */
function handleExport(sheetUrl, filters) {
  const { headers, rows } = getSheetData(sheetUrl);
  const filteredRows = applyFilters(headers, rows, filters);
  
  // Convert to array of objects
  const data = filteredRows.map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });
  
  return createJsonResponse({
    success: true,
    data: {
      headers: headers,
      data: data,
      totalRows: data.length
    }
  });
}

// ============================================
// DATA PROCESSING FUNCTIONS
// ============================================

/**
 * Get all data from the first sheet
 */
function getSheetData(sheetUrl) {
  const ss = SpreadsheetApp.openByUrl(sheetUrl);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  
  if (data.length === 0) {
    throw new Error('Sheet is empty');
  }
  
  const headers = data[0].map(h => String(h).trim());
  const rows = data.slice(1);
  
  return { headers, rows };
}

/**
 * Extract unique values for filter columns
 */
function extractFilterValues(headers, rows) {
  const filters = {};
  
  headers.forEach((header, idx) => {
    const headerLower = header.toLowerCase();
    
    // Skip excluded columns
    if (EXCLUDE_KEYWORDS.some(k => headerLower.includes(k))) {
      return;
    }
    
    // Check if it's a filterable column
    const isFilterable = FILTER_KEYWORDS.some(k => headerLower.includes(k));
    
    if (isFilterable) {
      const uniqueValues = [];
      const seen = {};
      
      rows.forEach(row => {
        const val = row[idx];
        if (val !== undefined && val !== null && val !== '') {
          const strVal = String(val).trim();
          if (!seen[strVal]) {
            seen[strVal] = true;
            uniqueValues.push(strVal);
          }
        }
      });
      
      uniqueValues.sort();
      
      if (uniqueValues.length > 0 && uniqueValues.length <= 100) {
        filters[header] = uniqueValues;
      }
    }
  });
  
  return filters;
}

/**
 * Apply filters to rows
 */
function applyFilters(headers, rows, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return rows;
  }
  
  return rows.filter(row => {
    for (const key in filters) {
      const selectedValues = filters[key];
      if (!selectedValues || selectedValues.length === 0) continue;
      
      const colIndex = headers.indexOf(key);
      if (colIndex === -1) continue;
      
      const cellValue = String(row[colIndex] || '').trim();
      if (!selectedValues.includes(cellValue)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Identify question columns (Likert-scale responses)
 */
function identifyQuestionColumns(headers, rows) {
  const questionColumns = [];
  const sampleSize = Math.min(100, rows.length);
  
  headers.forEach((header, idx) => {
    // Check sample values for Likert responses
    let hasLikert = false;
    for (let i = 0; i < sampleSize; i++) {
      const val = String(rows[i][idx] || '').toLowerCase().trim();
      if (LIKERT_MAP[val] !== undefined) {
        hasLikert = true;
        break;
      }
    }
    
    // Check if header looks like a question
    const looksLikeQuestion = header.includes('?') || 
      header.toLowerCase().includes('rate') ||
      header.toLowerCase().includes('rating') ||
      header.toLowerCase().includes('feedback') ||
      header.toLowerCase().includes('satisfaction') ||
      header.includes(':');
    
    if (hasLikert || looksLikeQuestion) {
      questionColumns.push(idx);
    }
  });
  
  return questionColumns;
}

/**
 * Calculate all analytics
 */
function calculateAnalytics(rows, headers, questionIndices) {
  const totalResponses = rows.length;
  
  if (totalResponses === 0) {
    return {
      totalResponses: 0,
      averageRating: 0,
      questionScores: [],
      departmentWise: [],
      timeTrends: [],
      facultyScores: []
    };
  }
  
  // Calculate question scores
  const questionScores = questionIndices.map(idx => {
    const question = headers[idx];
    const distribution = {
      'Strongly Agree': 0,
      'Agree': 0,
      'Neutral': 0,
      'Disagree': 0,
      'Strongly Disagree': 0
    };
    
    let totalScore = 0;
    let validResponses = 0;
    
    rows.forEach(row => {
      const val = String(row[idx] || '').toLowerCase().trim();
      const score = LIKERT_MAP[val];
      
      if (score !== undefined) {
        totalScore += score;
        validResponses++;
        
        if (score === 5) distribution['Strongly Agree']++;
        else if (score === 4) distribution['Agree']++;
        else if (score === 3) distribution['Neutral']++;
        else if (score === 2) distribution['Disagree']++;
        else if (score === 1) distribution['Strongly Disagree']++;
      }
    });
    
    const avgScore = validResponses > 0 ? totalScore / validResponses : 0;
    
    return {
      question: question,
      score: Math.round(avgScore * 100) / 100,
      distribution: distribution,
      validResponses: validResponses
    };
  });
  
  // Overall average
  const averageRating = questionScores.length > 0
    ? questionScores.reduce((sum, q) => sum + q.score, 0) / questionScores.length
    : 0;
  
  // Department-wise scores
  const departmentWise = calculateGroupScores(rows, headers, 'department', questionIndices);
  
  // Faculty scores
  const facultyScores = calculateGroupScores(rows, headers, 'faculty', questionIndices);
  
  // Time trends
  const timeTrends = calculateTimeTrends(rows, headers, questionIndices);
  
  return {
    totalResponses: totalResponses,
    averageRating: Math.round(averageRating * 100) / 100,
    questionScores: questionScores,
    departmentWise: departmentWise,
    timeTrends: timeTrends,
    facultyScores: facultyScores
  };
}

/**
 * Calculate scores grouped by category
 */
function calculateGroupScores(rows, headers, groupKeyword, questionIndices) {
  // Find grouping column
  let groupIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase().includes(groupKeyword)) {
      groupIdx = i;
      break;
    }
  }
  
  if (groupIdx === -1 || questionIndices.length === 0) {
    return [];
  }
  
  const grouped = {};
  
  rows.forEach(row => {
    const groupVal = String(row[groupIdx] || '').trim();
    if (!groupVal) return;
    
    if (!grouped[groupVal]) {
      grouped[groupVal] = { scores: [], count: 0 };
    }
    
    let rowScore = 0;
    let validQ = 0;
    
    questionIndices.forEach(qIdx => {
      const val = String(row[qIdx] || '').toLowerCase().trim();
      const score = LIKERT_MAP[val];
      if (score !== undefined) {
        rowScore += score;
        validQ++;
      }
    });
    
    if (validQ > 0) {
      grouped[groupVal].scores.push(rowScore / validQ);
      grouped[groupVal].count++;
    }
  });
  
  const result = [];
  for (const name in grouped) {
    const { scores, count } = grouped[name];
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    result.push({
      name: name,
      score: Math.round(avgScore * 100) / 100,
      count: count
    });
  }
  
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, 10);
}

/**
 * Calculate time-based trends
 */
function calculateTimeTrends(rows, headers, questionIndices) {
  // Find timestamp column
  let timeIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (h.includes('timestamp') || h.includes('date') || h.includes('time')) {
      timeIdx = i;
      break;
    }
  }
  
  if (timeIdx === -1 || questionIndices.length === 0) {
    return [];
  }
  
  const weekly = {};
  
  rows.forEach(row => {
    const timestamp = row[timeIdx];
    if (!timestamp) return;
    
    let date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
      if (isNaN(date.getTime())) return;
    }
    
    const weekKey = getWeekKey(date);
    
    if (!weekly[weekKey]) {
      weekly[weekKey] = { scores: [], sortKey: date.getTime() };
    }
    
    let rowScore = 0;
    let validQ = 0;
    
    questionIndices.forEach(qIdx => {
      const val = String(row[qIdx] || '').toLowerCase().trim();
      const score = LIKERT_MAP[val];
      if (score !== undefined) {
        rowScore += score;
        validQ++;
      }
    });
    
    if (validQ > 0) {
      weekly[weekKey].scores.push(rowScore / validQ);
    }
  });
  
  const result = [];
  for (const key in weekly) {
    const { scores, sortKey } = weekly[key];
    if (scores.length > 0) {
      result.push({
        label: key,
        value: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        sortKey: sortKey
      });
    }
  }
  
  result.sort((a, b) => a.sortKey - b.sortKey);
  return result.slice(-10).map(({ label, value }) => ({ label, value }));
}

/**
 * Generate week key for grouping
 */
function getWeekKey(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const weekOfMonth = Math.ceil(date.getDate() / 7);
  return month + ' W' + weekOfMonth;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Create JSON response with CORS headers
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

