/**
 * Name Normalization Service
 * Handles inconsistent faculty name entries by normalizing and grouping similar names
 */

// Common prefixes and suffixes to remove
const PREFIXES = [
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.',
  'prof', 'prof.', 'professor', 'shri', 'smt', 'kumari'
];

const SUFFIXES = [
  'sir', 'mam', 'ma\'am', 'madam', 'madem', 'mem', 'maam',
  'sahab', 'sahib', 'ji', 'g'
];

// Common misspelling patterns
const SPELLING_CORRECTIONS = {
  'maam': 'ma\'am',
  'madem': 'madam',
  'mem': 'ma\'am',
  'proff': 'prof',
  'proffessor': 'professor'
};

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function similarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(str1, str2) / maxLen;
}

/**
 * Normalize a single name by removing prefixes, suffixes, and standardizing format
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  
  // Convert to lowercase and trim
  let normalized = name.toLowerCase().trim();
  
  // Remove extra spaces and dots with spaces
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/\.\s*/g, ' ');
  normalized = normalized.replace(/\s*\.\s*/g, ' ');
  
  // Split into words
  let words = normalized.split(' ').filter(w => w.length > 0);
  
  // Remove prefix if present
  if (words.length > 1) {
    const firstWord = words[0].replace(/\./g, '');
    if (PREFIXES.includes(firstWord)) {
      words = words.slice(1);
    }
  }
  
  // Remove suffix if present
  if (words.length > 1) {
    const lastWord = words[words.length - 1].replace(/\./g, '');
    if (SUFFIXES.includes(lastWord)) {
      words = words.slice(0, -1);
    }
  }
  
  // Join and capitalize each word properly
  normalized = words.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  
  return normalized;
}

/**
 * Find the canonical (most common) name from a group of similar names
 */
function findCanonicalName(nameGroup) {
  // Count occurrences and find the most complete/common version
  const nameCounts = {};
  nameGroup.forEach(({ original, count }) => {
    nameCounts[original] = (nameCounts[original] || 0) + count;
  });
  
  // Sort by count (descending), then by length (descending, prefer more complete names)
  const sorted = Object.entries(nameCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // Higher count first
      // Prefer names without prefixes/suffixes for display, but with proper capitalization
      const aClean = normalizeName(a[0]);
      const bClean = normalizeName(b[0]);
      return bClean.length - aClean.length; // Longer normalized name first
    });
  
  // Return the normalized version of the most common name
  return normalizeName(sorted[0][0]);
}

/**
 * Group similar names together using fuzzy matching
 */
function groupSimilarNames(names, threshold = 0.75) {
  const groups = [];
  const processed = new Set();
  
  // Convert names array to array of {original, normalized, count}
  const nameData = names.map(name => ({
    original: name.name || name,
    normalized: normalizeName(name.name || name),
    count: name.count || 1
  }));
  
  // Sort by count (most common first) to use as group anchors
  nameData.sort((a, b) => b.count - a.count);
  
  for (const nameEntry of nameData) {
    if (processed.has(nameEntry.original)) continue;
    
    const group = [nameEntry];
    processed.add(nameEntry.original);
    
    // Find similar names
    for (const otherEntry of nameData) {
      if (processed.has(otherEntry.original)) continue;
      
      // Check similarity of normalized names
      const sim = similarity(nameEntry.normalized, otherEntry.normalized);
      
      if (sim >= threshold) {
        group.push(otherEntry);
        processed.add(otherEntry.original);
      } else {
        // Also check if one is a substring of another (handles "Tanvi" vs "Tanvi Madaan")
        const lowerA = nameEntry.normalized.toLowerCase();
        const lowerB = otherEntry.normalized.toLowerCase();
        
        if (lowerA.includes(lowerB) || lowerB.includes(lowerA)) {
          // Additional check: the shorter one should be at least 4 characters
          const shorter = lowerA.length < lowerB.length ? lowerA : lowerB;
          if (shorter.length >= 4) {
            group.push(otherEntry);
            processed.add(otherEntry.original);
          }
        }
      }
    }
    
    if (group.length > 0) {
      groups.push({
        canonical: findCanonicalName(group),
        variants: group.map(g => g.original),
        totalCount: group.reduce((sum, g) => sum + g.count, 0)
      });
    }
  }
  
  return groups;
}

/**
 * Create a mapping from original names to canonical names
 */
function createNameMapping(data, facultyColumn) {
  const nameCounts = {};
  
  // Count occurrences of each name
  data.forEach(row => {
    const name = String(row[facultyColumn] || '').trim();
    if (name) {
      nameCounts[name] = (nameCounts[name] || 0) + 1;
    }
  });
  
  // Convert to array format for grouping
  const nameArray = Object.entries(nameCounts).map(([name, count]) => ({
    name,
    count
  }));
  
  // Group similar names
  const groups = groupSimilarNames(nameArray);
  
  // Create mapping from original to canonical
  const mapping = {};
  // Create reverse mapping from canonical to all variants
  const reverseMapping = {};
  
  groups.forEach(group => {
    reverseMapping[group.canonical] = group.variants;
    group.variants.forEach(variant => {
      mapping[variant] = group.canonical;
    });
  });
  
  return {
    mapping,
    reverseMapping,
    groups,
    totalOriginal: Object.keys(nameCounts).length,
    totalNormalized: groups.length
  };
}

/**
 * Apply name mapping to data
 */
function applyNameMapping(data, facultyColumn, mapping) {
  return data.map(row => {
    const newRow = { ...row };
    const originalName = String(row[facultyColumn] || '').trim();
    if (originalName && mapping[originalName]) {
      newRow[facultyColumn] = mapping[originalName];
      newRow['_originalFacultyName'] = originalName; // Keep original for reference
    }
    return newRow;
  });
}

export {
  normalizeName,
  similarity,
  groupSimilarNames,
  createNameMapping,
  applyNameMapping,
  levenshteinDistance
};
