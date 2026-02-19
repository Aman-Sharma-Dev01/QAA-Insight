// Fix: Use namespace import for React to ensure JSX types are correctly resolved
import * as React from 'react';
import { User, AggregatedData, FilterState, DynamicFilters, SheetSource, FilteredDataRow, PaginationInfo, UserSheet } from '../types';
import { dataService } from '../services/dataService';
import { geminiService } from '../services/geminiService';
import StatsCards from './StatsCards';
import AnalyticsCharts from './AnalyticsCharts';
import FilteredDataTable from './FilteredDataTable';
import FacultyScorecard from './FacultyScorecard';
import { Filter, Download, Database, ChevronDown, ChevronLeft, ChevronRight, User as UserIcon, LogOut, BrainCircuit, Plus, FileText, X, RefreshCw, Clock, Search, AlertCircle, Table, BarChart3, CheckCircle, Award, Users, BookOpen, Layers, PanelLeftClose, PanelLeft, FileSpreadsheet, Star } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const STORAGE_KEYS = {
  ACTIVE_SHEET: 'eduPulse_activeSheet',
  FILTER_STATE: 'eduPulse_filterState',
  AUTO_REFRESH: 'eduPulse_autoRefresh',
  SAVED_SHEETS: 'eduPulse_savedSheets'
};

// Type for merged names: category -> { canonicalName: [variant1, variant2, ...] }
type MergedNamesMapping = Record<string, Record<string, string[]>>;

type ViewMode = 'analytics' | 'scorecard' | 'data';

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  // Persistence Initialization from Local Storage
  const [activeSheet, setActiveSheet] = React.useState<SheetSource | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SHEET);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [filterState, setFilterState] = React.useState<FilterState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FILTER_STATE);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [autoRefresh, setAutoRefresh] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTO_REFRESH);
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const [availableSheets, setAvailableSheets] = React.useState<SheetSource[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SAVED_SHEETS);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [sheetsLoadedFromDb, setSheetsLoadedFromDb] = React.useState(false);

  const [dynamicFilters, setDynamicFilters] = React.useState<DynamicFilters>({});
  const [analytics, setAnalytics] = React.useState<AggregatedData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = React.useState(false);
  const [aiInsights, setAiInsights] = React.useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = React.useState(false);
  const [showSheetModal, setShowSheetModal] = React.useState(false);
  const [newSheetUrl, setNewSheetUrl] = React.useState('');
  const [newSheetName, setNewSheetName] = React.useState('');
  const [lastSynced, setLastSynced] = React.useState<Date>(new Date());
  const [error, setError] = React.useState<string>('');
  const [sheetValidating, setSheetValidating] = React.useState(false);
  const [sheetValidationResult, setSheetValidationResult] = React.useState<{ valid: boolean; title?: string } | null>(null);
  
  // View mode - analytics, scorecard, or data table
  const [viewMode, setViewMode] = React.useState<ViewMode>('data');
  
  // Sidebar resizable state
  const [sidebarWidth, setSidebarWidth] = React.useState(320); // Default width in pixels
  const [isResizing, setIsResizing] = React.useState(false);
  const sidebarRef = React.useRef<HTMLElement>(null);
  const MIN_SIDEBAR_WIDTH = 200;
  const MAX_SIDEBAR_WIDTH = 600;
  
  // Global search state
  const [globalSearchQuery, setGlobalSearchQuery] = React.useState('');
  
  // Filtered data state
  const [filteredDataHeaders, setFilteredDataHeaders] = React.useState<string[]>([]);
  const [filteredData, setFilteredData] = React.useState<FilteredDataRow[]>([]);
  const [pagination, setPagination] = React.useState<PaginationInfo>({
    page: 1,
    pageSize: 50,
    totalRows: 0,
    totalPages: 0
  });
  const [filteredDataLoading, setFilteredDataLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  
  // State for search queries in filter categories
  const [filterSearchQueries, setFilterSearchQueries] = React.useState<Record<string, string>>({});

  // Merge names feature state - loaded from backend
  const [mergedNames, setMergedNames] = React.useState<MergedNamesMapping>({});
  const [mergedNamesLoading, setMergedNamesLoading] = React.useState(false);
  const [showMergeModal, setShowMergeModal] = React.useState(false);
  const [mergeCategory, setMergeCategory] = React.useState<string>('');
  const [mergeSelectedNames, setMergeSelectedNames] = React.useState<string[]>([]);
  const [mergeCanonicalName, setMergeCanonicalName] = React.useState<string>('');

  // Faculty averages state for display
  const [facultyAverages, setFacultyAverages] = React.useState<{
    questionScores: { name: string; avg: number }[];
    overallAvg: number;
    facultyName: string;
    school: string;
    department: string;
    course: string;
    section: string;
    comments: string[];
  } | null>(null);

  const refreshTimerRef = React.useRef<number | null>(null);

  // Levenshtein distance for similarity matching
  const levenshteinDistance = (str1: string, str2: string): number => {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  };

  // Calculate similarity score (0-1)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(s1, s2) / maxLen;
  };

  // Find similar names from a list
  const findSimilarNames = (targetName: string, allNames: string[], threshold = 0.7): string[] => {
    const targetLower = targetName.toLowerCase().trim();
    // Extract core name by removing common prefixes/suffixes
    const prefixes = ['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.', 'prof', 'prof.', 'shri', 'smt'];
    const suffixes = ['sir', 'mam', 'ma\'am', 'madam', 'madem', 'mem', 'maam', 'ji', 'g'];
    
    const cleanName = (name: string): string => {
      let cleaned = name.toLowerCase().trim().replace(/\s+/g, ' ');
      let words = cleaned.split(' ');
      if (words.length > 1 && prefixes.includes(words[0].replace(/\./g, ''))) {
        words = words.slice(1);
      }
      if (words.length > 1 && suffixes.includes(words[words.length - 1].replace(/\./g, ''))) {
        words = words.slice(0, -1);
      }
      return words.join(' ');
    };
    
    const targetClean = cleanName(targetName);
    
    return allNames.filter(name => {
      if (name === targetName) return false;
      const nameClean = cleanName(name);
      const similarity = calculateSimilarity(targetClean, nameClean);
      // Also check if one contains the other
      const containsMatch = nameClean.includes(targetClean) || targetClean.includes(nameClean);
      return similarity >= threshold || (containsMatch && Math.min(nameClean.length, targetClean.length) >= 4);
    });
  };

  // Fetch metadata and analytics
  const refreshData = React.useCallback(async (isBackground = false) => {
    if (!activeSheet) return;
    
    if (isBackground) setBackgroundRefreshing(true);
    else setLoading(true);
    setError('');
    
    try {
      // 1. Get Metadata (Headers & Unique Values for Filters)
      const metaResponse = await dataService.getSheetMetadata(activeSheet.url);
      if (metaResponse.success && metaResponse.data) {
        setDynamicFilters(metaResponse.data.filters);
      } else if (!metaResponse.success) {
        setError(metaResponse.error || 'Failed to fetch sheet metadata');
        return;
      }

      // 2. Get Aggregated Analytics based on current filters
      const analyticsResponse = await dataService.fetchAnalytics(activeSheet.url, filterState);
      if (analyticsResponse.success && analyticsResponse.data) {
        setAnalytics(analyticsResponse.data);
        setLastSynced(new Date());
      } else if (!analyticsResponse.success) {
        setError(analyticsResponse.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setError('Failed to connect to the server. Please check if the backend is running.');
    } finally {
      setLoading(false);
      setBackgroundRefreshing(false);
    }
  }, [activeSheet, filterState]);

  // Fetch filtered data for table view
  const fetchFilteredData = React.useCallback(async (page: number = 1) => {
    if (!activeSheet) return;
    
    setFilteredDataLoading(true);
    
    try {
      const response = await dataService.getFilteredData(activeSheet.url, filterState, page, 50);
      if (response.success && response.data) {
        setFilteredDataHeaders(response.data.headers);
        setFilteredData(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (err) {
      console.error("Fetch filtered data error:", err);
    } finally {
      setFilteredDataLoading(false);
    }
  }, [activeSheet, filterState]);

  // Persist settings whenever they change
  React.useEffect(() => {
    if (activeSheet) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SHEET, JSON.stringify(activeSheet));
    }
  }, [activeSheet]);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILTER_STATE, JSON.stringify(filterState));
  }, [filterState]);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUTO_REFRESH, JSON.stringify(autoRefresh));
  }, [autoRefresh]);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SAVED_SHEETS, JSON.stringify(availableSheets));
  }, [availableSheets]);

  // Load merged names from backend when activeSheet changes
  React.useEffect(() => {
    const loadMergedNames = async () => {
      if (!activeSheet?.id) {
        setMergedNames({});
        return;
      }
      
      setMergedNamesLoading(true);
      try {
        const response = await dataService.getMergedNames(activeSheet.id);
        if (response.success && response.data) {
          setMergedNames(response.data);
        } else {
          setMergedNames({});
        }
      } catch (err) {
        console.error('Failed to load merged names:', err);
        setMergedNames({});
      } finally {
        setMergedNamesLoading(false);
      }
    };
    
    loadMergedNames();
  }, [activeSheet?.id]);

  // Calculate faculty averages when filtered data changes
  React.useEffect(() => {
    const calculateFacultyAverages = async () => {
      if (!activeSheet) {
        setFacultyAverages(null);
        return;
      }
      
      // Check if any filter is applied
      const hasFilters = Object.values(filterState).some(v => v.length > 0);
      if (!hasFilters) {
        setFacultyAverages(null);
        return;
      }
      
      try {
        const response = await dataService.getExportData(activeSheet.url, filterState);
        
        if (response.success && response.data) {
          const { headers, data } = response.data;
          
          // Identify column indices
          const findHeader = (patterns: string[]): string | null => {
            return headers.find(h => patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))) || null;
          };
          
          const facultyCol = findHeader(['faculty', 'teacher']);
          
          // Collect exact metadata column names to exclude
          const schoolCol = findHeader(['school']);
          const deptCol = findHeader(['department']);
          const semesterCol = findHeader(['semester']);
          const sectionCol = findHeader(['section', 'class-section']);
          const courseCol = findHeader(['course']);
          const remarkCol = findHeader(['remark', 'comment', 'feedback', 'suggestion']);
          
          const metadataColumns = new Set<string>(
            [facultyCol, schoolCol, deptCol, semesterCol, sectionCol, courseCol, remarkCol]
              .filter((col): col is string => col !== null)
              .map(col => col.toLowerCase())
          );
          
          // Find question columns
          const questionColumns = headers.filter(h => {
            const hLower = h.toLowerCase();
            if (metadataColumns.has(hLower)) return false;
            const shortSkipPatterns = ['timestamp', 'email', 's.no', 's. no', 'sno', 'roll no', 'roll number'];
            if (shortSkipPatterns.some(p => hLower === p || hLower.includes('timestamp') || hLower.includes('email address'))) {
              return false;
            }
            
            let numericCount = 0;
            let totalCount = 0;
            data.forEach(row => {
              const val = row[h];
              if (val !== null && val !== undefined && String(val).trim() !== '') {
                totalCount++;
                if (!isNaN(Number(val))) numericCount++;
              }
            });
            return totalCount > 0 && (numericCount / totalCount) >= 0.5;
          });
          
          if (questionColumns.length === 0) {
            setFacultyAverages(null);
            return;
          }
          
          // Calculate averages
          const questionTotals: Record<string, { sum: number; count: number }> = {};
          let facultyName = 'Selected Faculty';
          let school = '';
          let department = '';
          let course = '';
          let section = '';
          const comments: string[] = [];
          
          // Helper to check if comment is valid
          const isValidComment = (comment: string): boolean => {
            if (!comment || typeof comment !== 'string') return false;
            const trimmed = comment.trim().toLowerCase();
            if (trimmed.length === 0) return false;
            const skipWords = ['na', 'n/a', 'nil', 'none', 'good', 'ok', 'okay', 'nice', 'fine', '-', '.', '..', '...'];
            if (skipWords.includes(trimmed)) return false;
            const words = trimmed.split(/\s+/).filter(w => w.length > 0);
            if (words.length <= 1) return false;
            return true;
          };
          
          // Get canonical faculty name from merged names or filter
          if (facultyCol) {
            const facultyFilter = Object.entries(filterState).find(([key]) => 
              key.toLowerCase().includes('faculty') || key.toLowerCase().includes('teacher')
            );
            if (facultyFilter && facultyFilter[1].length > 0) {
              // Get canonical name from mergedNames if available
              const selectedNames = facultyFilter[1];
              const categoryMerges = mergedNames[facultyFilter[0]] || {};
              
              // Find canonical name
              let canonicalName = selectedNames[0];
              for (const [canonical, variants] of Object.entries(categoryMerges)) {
                if (selectedNames.some(name => variants.includes(name) || canonical === name)) {
                  canonicalName = canonical;
                  break;
                }
              }
              facultyName = canonicalName;
            }
          }
          
          // Collect metadata and scores from first row and aggregate
          const uniqueCourses = new Set<string>();
          const uniqueSections = new Set<string>();
          
          data.forEach((row, idx) => {
            // Get metadata from first row
            if (idx === 0) {
              school = schoolCol ? String(row[schoolCol] || '') : '';
              department = deptCol ? String(row[deptCol] || '') : '';
            }
            
            // Collect unique courses and sections
            if (courseCol && row[courseCol]) uniqueCourses.add(String(row[courseCol]));
            if (sectionCol && row[sectionCol]) uniqueSections.add(String(row[sectionCol]));
            
            // Collect question scores
            questionColumns.forEach(qCol => {
              const val = Number(row[qCol]);
              if (!isNaN(val)) {
                if (!questionTotals[qCol]) {
                  questionTotals[qCol] = { sum: 0, count: 0 };
                }
                questionTotals[qCol].sum += val;
                questionTotals[qCol].count += 1;
              }
            });
            
            // Collect valid comments
            if (remarkCol) {
              const comment = String(row[remarkCol] || '').trim();
              if (isValidComment(comment) && !comments.includes(comment)) {
                comments.push(comment);
              }
            }
          });
          
          course = Array.from(uniqueCourses).join(', ');
          section = Array.from(uniqueSections).join(', ');
          
          const questionScores = questionColumns.map((qCol, i) => {
            const totals = questionTotals[qCol];
            const avg = totals && totals.count > 0 ? totals.sum / totals.count : 0;
            return { name: `Q${i + 1}`, avg };
          });
          
          const overallAvg = questionScores.length > 0 
            ? questionScores.reduce((a, b) => a + b.avg, 0) / questionScores.length 
            : 0;
          
          setFacultyAverages({
            questionScores,
            overallAvg,
            facultyName,
            school,
            department,
            course,
            section,
            comments
          });
        }
      } catch (err) {
        console.error('Failed to calculate faculty averages:', err);
        setFacultyAverages(null);
      }
    };
    
    calculateFacultyAverages();
  }, [activeSheet, filterState]);

  // Apply merge mapping to filter options - returns deduplicated options with canonical names
  const getDisplayOptions = React.useCallback((category: string, options: string[]): { displayName: string; originalNames: string[] }[] => {
    const categoryMerges = mergedNames[category] || {};
    const displayMap = new Map<string, string[]>();
    
    options.forEach(opt => {
      let foundCanonical = opt;
      // Check if this option is a variant
      for (const [canonical, variants] of Object.entries(categoryMerges)) {
        if (variants.includes(opt) || canonical === opt) {
          foundCanonical = canonical;
          break;
        }
      }
      
      if (!displayMap.has(foundCanonical)) {
        displayMap.set(foundCanonical, []);
      }
      displayMap.get(foundCanonical)!.push(opt);
    });
    
    return Array.from(displayMap.entries()).map(([displayName, originalNames]) => ({
      displayName,
      originalNames
    }));
  }, [mergedNames]);

  // Handle opening merge modal
  const handleOpenMergeModal = (category: string, selectedNames: string[]) => {
    setMergeCategory(category);
    setMergeSelectedNames(selectedNames);
    // Default canonical name to the first selected or most common
    setMergeCanonicalName(selectedNames[0] || '');
    setShowMergeModal(true);
  };

  // Handle confirming merge
  const handleConfirmMerge = async () => {
    if (!mergeCanonicalName || mergeSelectedNames.length < 2 || !activeSheet?.id) return;
    
    const newMergedNames = { ...mergedNames };
    const categoryMerges = { ...newMergedNames[mergeCategory] } || {};
    
    // Remove any existing merges that include these names
    for (const canonical of Object.keys(categoryMerges)) {
      categoryMerges[canonical] = categoryMerges[canonical].filter(
        v => !mergeSelectedNames.includes(v)
      );
      // Remove empty entries
      if (categoryMerges[canonical].length === 0) {
        delete categoryMerges[canonical];
      }
    }
    
    // Add new merge with all selected names as variants
    categoryMerges[mergeCanonicalName] = [...mergeSelectedNames];
    newMergedNames[mergeCategory] = categoryMerges;
    
    // Update local state immediately
    setMergedNames(newMergedNames);
    
    // Update filter state to include ALL original variant names (not just canonical)
    // This ensures the backend filters by all the merged names
    setFilterState(prev => {
      const currentValues = prev[mergeCategory] || [];
      // Keep values that are not part of the merge
      const otherValues = currentValues.filter(v => !mergeSelectedNames.includes(v));
      // Add all the merged variant names to ensure filtering works correctly
      const newValues = [...new Set([...otherValues, ...mergeSelectedNames])];
      return { ...prev, [mergeCategory]: newValues };
    });
    
    // Save to backend
    try {
      await dataService.updateMergedNames(activeSheet.id, newMergedNames);
    } catch (err) {
      console.error('Failed to save merged names:', err);
    }
    
    setShowMergeModal(false);
    setMergeCategory('');
    setMergeSelectedNames([]);
    setMergeCanonicalName('');
  };

  // Handle unmerging a canonical name
  const handleUnmerge = async (category: string, canonicalName: string) => {
    if (!activeSheet?.id) return;
    
    const newMergedNames = { ...mergedNames };
    const categoryMerges = { ...newMergedNames[category] };
    delete categoryMerges[canonicalName];
    newMergedNames[category] = categoryMerges;
    
    // Update local state immediately
    setMergedNames(newMergedNames);
    
    // Save to backend
    try {
      await dataService.updateMergedNames(activeSheet.id, newMergedNames);
    } catch (err) {
      console.error('Failed to save unmerge:', err);
    }
  };

  // Initial and reactive data fetch
  React.useEffect(() => {
    if (activeSheet) {
      refreshData();
    }
  }, [activeSheet, refreshData]);

  // Load user's sheets from MongoDB on mount
  React.useEffect(() => {
    const loadUserSheets = async () => {
      try {
        const response = await dataService.getUserSheets();
        if (response.success && response.data) {
          const { sheets, defaultSheetId } = response.data;
          if (sheets && sheets.length > 0) {
            // Convert UserSheet to SheetSource format
            const sheetSources: SheetSource[] = sheets.map((s: UserSheet) => ({
              id: s.sheetId,
              name: s.name,
              url: s.url,
              dateAdded: s.addedAt.split('T')[0]
            }));
            setAvailableSheets(sheetSources);
            localStorage.setItem(STORAGE_KEYS.SAVED_SHEETS, JSON.stringify(sheetSources));
            
            // Set active sheet to default or first
            const defaultSheet = sheetSources.find(s => s.id === defaultSheetId) || sheetSources[0];
            if (defaultSheet) {
              setActiveSheet(defaultSheet);
              localStorage.setItem(STORAGE_KEYS.ACTIVE_SHEET, JSON.stringify(defaultSheet));
            }
          } else {
            // No sheets in MongoDB - sync local sheets if any exist
            const localSheets = localStorage.getItem(STORAGE_KEYS.SAVED_SHEETS);
            if (localSheets) {
              const localSheetsParsed: SheetSource[] = JSON.parse(localSheets);
              if (localSheetsParsed.length > 0) {
                // Sync local sheets to MongoDB
                console.log('Syncing local sheets to MongoDB...');
                for (const sheet of localSheetsParsed) {
                  try {
                    await dataService.saveUserSheet(sheet.id, sheet.name, sheet.url);
                  } catch (err) {
                    console.error('Failed to sync sheet:', sheet.name, err);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load user sheets from database:', err);
      } finally {
        setSheetsLoadedFromDb(true);
      }
    };

    loadUserSheets();
  }, []);

  // Fetch filtered data when switching to data view or when filters change
  React.useEffect(() => {
    if (viewMode === 'data' && activeSheet) {
      fetchFilteredData(1);
    }
  }, [viewMode, filterState, activeSheet, fetchFilteredData]);

  // Handle Polling / Smart Real-time Sync
  // Checks for updates every 30 seconds, instant refresh for 1-10 new responses
  React.useEffect(() => {
    if (autoRefresh && activeSheet) {
      const smartRefresh = async () => {
        try {
          const result = await dataService.checkForUpdates(activeSheet.url);
          if (result.success && result.data) {
            const { hasChanged, delta, shouldInstantRefresh } = result.data;
            
            if (hasChanged) {
              console.log(`Smart refresh: ${delta} changes detected`);
              
              if (shouldInstantRefresh) {
                // 1-10 changes: instant refresh (already triggered on backend)
                console.log('Instant refresh triggered for small change');
                await refreshData(true); // Background refresh
              } else if (Math.abs(delta) > 10) {
                // Large change: just notify, use cached data
                console.log('Large change detected, will use cache');
              }
            }
          }
        } catch (error) {
          console.error('Smart refresh check failed:', error);
        }
      };
      
      // Check every 30 seconds for updates
      refreshTimerRef.current = window.setInterval(smartRefresh, 30000);
      
      // Also run immediately on enable
      smartRefresh();
    } else {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [autoRefresh, refreshData, activeSheet]);

  const handleFilterChange = (key: string, value: string) => {
    setFilterState(prev => {
      const currentValues = prev[key] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      return { ...prev, [key]: newValues };
    });
  };

  const handleFilterSearch = (category: string, query: string) => {
    setFilterSearchQueries(prev => ({ ...prev, [category]: query }));
  };

  const handleGenerateAiReport = async () => {
    if (!analytics) return;
    setIsGeneratingAi(true);
    try {
      const report = await geminiService.generateInsights(analytics);
      setAiInsights(report);
    } catch (err) {
      setAiInsights("Error generating AI report. Please check your Gemini API configuration.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const validateSheetUrl = async () => {
    if (!newSheetUrl) return;
    
    setSheetValidating(true);
    setSheetValidationResult(null);
    
    try {
      const result = await dataService.validateSheet(newSheetUrl);
      if (result.success && result.data) {
        setSheetValidationResult({ valid: true, title: result.data.title });
        if (!newSheetName && result.data.title) {
          setNewSheetName(result.data.title);
        }
      } else {
        setSheetValidationResult({ valid: false });
      }
    } catch (err) {
      setSheetValidationResult({ valid: false });
    } finally {
      setSheetValidating(false);
    }
  };

  const handleAddSheet = async () => {
    if (!newSheetUrl || !newSheetName) return;
    
    const sheetId = Date.now().toString();
    const newSheet: SheetSource = {
      id: sheetId,
      name: newSheetName,
      url: newSheetUrl,
      dateAdded: new Date().toISOString().split('T')[0]
    };
    
    // Save to MongoDB
    try {
      await dataService.saveUserSheet(sheetId, newSheetName, newSheetUrl);
    } catch (err) {
      console.error('Failed to save sheet to database:', err);
    }
    
    setAvailableSheets(prev => [...prev, newSheet]);
    setActiveSheet(newSheet);
    setShowSheetModal(false);
    setNewSheetUrl('');
    setNewSheetName('');
    setSheetValidationResult(null);
  };

  const handleDeleteSheet = async (sheetId: string) => {
    // Remove from MongoDB
    try {
      await dataService.removeUserSheet(sheetId);
    } catch (err) {
      console.error('Failed to remove sheet from database:', err);
    }
    
    setAvailableSheets(prev => prev.filter(s => s.id !== sheetId));
    if (activeSheet?.id === sheetId) {
      const remaining = availableSheets.filter(s => s.id !== sheetId);
      setActiveSheet(remaining.length > 0 ? remaining[0] : null);
    }
  };

  // Fetch all filtered data for average calculations
  const fetchAllFilteredData = async (): Promise<FilteredDataRow[]> => {
    if (!activeSheet) return [];
    
    try {
      const response = await dataService.getExportData(activeSheet.url, filterState);
      
      if (response.success && response.data) {
        return response.data.data;
      }
      return [];
    } catch (err) {
      console.error('Failed to fetch all filtered data:', err);
      return [];
    }
  };

  // Export filtered data as CSV with optional averages
  interface QuestionAverage {
    question: string;
    average: number;
    count: number;
    total: number;
  }

  const exportFilteredCSV = async (includeAverages: boolean = false, averages: QuestionAverage[] = [], overallAverage: number = 0) => {
    if (!activeSheet) return;
    
    setExporting(true);
    try {
      const response = await dataService.getExportData(activeSheet.url, filterState);
      
      if (response.success && response.data) {
        const { headers, data } = response.data;
        
        // Build CSV content
        let csv = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
        
        data.forEach(row => {
          const rowValues = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
          });
          csv += rowValues.join(',') + '\n';
        });
        
        // Add averages section if requested
        if (includeAverages && averages.length > 0) {
          csv += '\n\n';
          csv += '"","","AVERAGES SUMMARY","",""\n';
          csv += '"Question","Average Score","Responses","Rating"\n';
          
          averages.forEach(avg => {
            const rating = avg.average >= 4.5 ? 'Excellent' : 
                          avg.average >= 4.0 ? 'Very Good' : 
                          avg.average >= 3.5 ? 'Good' : 
                          avg.average >= 3.0 ? 'Satisfactory' : 'Needs Improvement';
            csv += `"${avg.question.replace(/"/g, '""')}","${avg.average.toFixed(2)}","${avg.count}","${rating}"\n`;
          });
          
          // Add overall average
          csv += '\n';
          const overallRating = overallAverage >= 4.5 ? 'Excellent' : 
                               overallAverage >= 4.0 ? 'Very Good' : 
                               overallAverage >= 3.5 ? 'Good' : 
                               overallAverage >= 3.0 ? 'Satisfactory' : 'Needs Improvement';
          csv += `"OVERALL AVERAGE","${overallAverage.toFixed(2)}","","${overallRating}"\n`;
        }
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filterCount = Object.values(filterState).filter(v => v.length > 0).length;
        const suffix = filterCount > 0 ? '_filtered' : '_all';
        const avgSuffix = includeAverages ? '_with_averages' : '';
        a.download = `${activeSheet.name.replace(/\s+/g, '_')}${suffix}${avgSuffix}_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // Export analytics summary as CSV
  const exportAnalyticsCSV = () => {
    if (!analytics || !activeSheet) return;
    
    let csv = "Parameter,Score\n";
    analytics.questionScores.forEach(q => {
      csv += `"${q.question.replace(/"/g, '""')}",${q.score}\n`;
    });
    
    csv += "\nDepartment,Score,Responses\n";
    analytics.departmentWise.forEach(d => {
      csv += `"${d.name}",${d.score},${d.count}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${activeSheet.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Export filtered data as formatted Excel with averages and comments
  const exportFilteredAverageExcel = async (averages: QuestionAverage[] = [], overallAverage: number = 0) => {
    if (!activeSheet) return;
    
    setExporting(true);
    try {
      const response = await dataService.getExportData(activeSheet.url, filterState);
      
      if (response.success && response.data) {
        const { headers, data } = response.data;
        
        // Identify column indices for required fields
        const findHeader = (patterns: string[]): string | null => {
          return headers.find(h => patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))) || null;
        };
        
        const facultyCol = findHeader(['faculty', 'teacher']);
        const schoolCol = findHeader(['school']);
        const deptCol = findHeader(['department']);
        const semesterCol = findHeader(['semester']);
        const sectionCol = findHeader(['section', 'class-section']);
        const courseCol = findHeader(['course']);
        const remarkCol = findHeader(['remark', 'comment', 'feedback', 'suggestion']);
        
        // Collect exact metadata column names to exclude
        const metadataColumns = new Set<string>(
          [facultyCol, schoolCol, deptCol, semesterCol, sectionCol, courseCol, remarkCol]
            .filter((col): col is string => col !== null)
            .map(col => col.toLowerCase())
        );
        
        // Find question columns (numeric score columns)
        const questionColumns = headers.filter(h => {
          const hLower = h.toLowerCase();
          
          // Skip if it's an exact metadata column
          if (metadataColumns.has(hLower)) {
            return false;
          }
          
          // Skip obvious non-question columns by exact short names
          const shortSkipPatterns = ['timestamp', 'email', 's.no', 's. no', 'sno', 'roll no', 'roll number'];
          if (shortSkipPatterns.some(p => hLower === p || hLower.includes('timestamp') || hLower.includes('email address'))) {
            return false;
          }
          
          // Check if column has mostly numeric values (ratings)
          let numericCount = 0;
          let totalCount = 0;
          data.forEach(row => {
            const val = row[h];
            if (val !== null && val !== undefined && String(val).trim() !== '') {
              totalCount++;
              if (!isNaN(Number(val))) {
                numericCount++;
              }
            }
          });
          // Consider it a question column if at least 50% of values are numeric
          return totalCount > 0 && (numericCount / totalCount) >= 0.5;
        });
        
        // Helper to check if comment is valid
        const isValidComment = (comment: string): boolean => {
          if (!comment || typeof comment !== 'string') return false;
          const trimmed = comment.trim().toLowerCase();
          if (trimmed.length === 0) return false;
          // Skip na, NA, n/a, good, ok, nice, etc.
          const skipWords = ['na', 'n/a', 'nil', 'none', 'good', 'ok', 'okay', 'nice', 'fine', '-', '.', '..', '...'];
          if (skipWords.includes(trimmed)) return false;
          // Skip single word comments
          const words = trimmed.split(/\s+/).filter(w => w.length > 0);
          if (words.length <= 1) return false;
          return true;
        };
        
        // Helper to get canonical name using merged names mapping
        const getCanonicalFacultyName = (name: string): string => {
          if (!facultyCol) return name;
          const categoryKey = facultyCol;
          const categoryMerges = mergedNames[categoryKey];
          if (!categoryMerges) return name;
          
          // Check if this name is a variant of any canonical name
          for (const [canonical, variants] of Object.entries(categoryMerges)) {
            if (variants.includes(name) || canonical === name) {
              return canonical;
            }
          }
          return name;
        };
        
        // Group data by faculty (using merged canonical names)
        const facultyGroups: Record<string, { 
          info: Record<string, string>;
          questionTotals: Record<string, { sum: number; count: number }>;
          comments: string[];
        }> = {};
        
        data.forEach(row => {
          const originalFaculty = facultyCol ? String(row[facultyCol] || '').trim() : 'Unknown';
          if (!originalFaculty) return;
          
          // Get canonical name for grouping
          const faculty = getCanonicalFacultyName(originalFaculty);
          
          if (!facultyGroups[faculty]) {
            facultyGroups[faculty] = {
              info: {
                'Faculty Name': faculty,
                'School': schoolCol ? String(row[schoolCol] || '') : '',
                'Department': deptCol ? String(row[deptCol] || '') : '',
                'Semester': semesterCol ? String(row[semesterCol] || '') : '',
                'Section': sectionCol ? String(row[sectionCol] || '') : '',
                'Course Name': courseCol ? String(row[courseCol] || '') : ''
              },
              questionTotals: {},
              comments: []
            };
          }
          
          // Accumulate question scores
          questionColumns.forEach(qCol => {
            const val = Number(row[qCol]);
            if (!isNaN(val)) {
              if (!facultyGroups[faculty].questionTotals[qCol]) {
                facultyGroups[faculty].questionTotals[qCol] = { sum: 0, count: 0 };
              }
              facultyGroups[faculty].questionTotals[qCol].sum += val;
              facultyGroups[faculty].questionTotals[qCol].count += 1;
            }
          });
          
          // Collect valid comments
          if (remarkCol) {
            const comment = String(row[remarkCol] || '').trim();
            if (isValidComment(comment)) {
              facultyGroups[faculty].comments.push(comment);
            }
          }
        });
        
        // Build Excel data
        const excelData: Record<string, unknown>[] = [];
        const shortQuestionNames = questionColumns.map((q, i) => `Q${i + 1}`);
        
        // Headers for the main data
        const mainHeaders = [
          'S.No', 'Faculty Name', 'School', 'Department', 'Semester', 'Section', 'Course Name',
          ...shortQuestionNames, 'Overall Avg', 'Comments'
        ];
        
        let serialNo = 1;
        Object.entries(facultyGroups).forEach(([faculty, group]) => {
          // Calculate averages
          const questionAvgs: number[] = questionColumns.map(qCol => {
            const totals = group.questionTotals[qCol];
            return totals && totals.count > 0 ? totals.sum / totals.count : 0;
          });
          
          const overallAvg = questionAvgs.length > 0 
            ? questionAvgs.reduce((a, b) => a + b, 0) / questionAvgs.length 
            : 0;
          
          // Format comments with serial numbers
          const formattedComments = group.comments.map((c, i) => `${i + 1}. ${c}`).join('\n');
          
          const row: Record<string, unknown> = {
            'S.No': serialNo++,
            'Faculty Name': group.info['Faculty Name'],
            'School': group.info['School'],
            'Department': group.info['Department'],
            'Semester': group.info['Semester'],
            'Section': group.info['Section'],
            'Course Name': group.info['Course Name'],
            'Overall Avg': overallAvg.toFixed(2),
            'Comments': formattedComments
          };
          
          // Add question averages
          questionColumns.forEach((qCol, i) => {
            row[shortQuestionNames[i]] = questionAvgs[i].toFixed(2);
          });
          
          excelData.push(row);
        });
        
        // Calculate grand averages for summary row
        const grandTotals: Record<string, { sum: number; count: number }> = {};
        Object.values(facultyGroups).forEach(group => {
          Object.entries(group.questionTotals).forEach(([qCol, totals]) => {
            if (!grandTotals[qCol]) {
              grandTotals[qCol] = { sum: 0, count: 0 };
            }
            grandTotals[qCol].sum += totals.sum;
            grandTotals[qCol].count += totals.count;
          });
        });
        
        const grandQuestionAvgs = questionColumns.map(qCol => {
          const totals = grandTotals[qCol];
          return totals && totals.count > 0 ? totals.sum / totals.count : 0;
        });
        const grandOverallAvg = grandQuestionAvgs.length > 0 
          ? grandQuestionAvgs.reduce((a, b) => a + b, 0) / grandQuestionAvgs.length 
          : 0;
        
        // Add summary row
        const summaryRow: Record<string, unknown> = {
          'S.No': '',
          'Faculty Name': 'AVERAGE SUMMARY',
          'School': '',
          'Department': '',
          'Semester': '',
          'Section': '',
          'Course Name': '',
          'Overall Avg': grandOverallAvg.toFixed(2),
          'Comments': ''
        };
        questionColumns.forEach((qCol, i) => {
          summaryRow[shortQuestionNames[i]] = grandQuestionAvgs[i].toFixed(2);
        });
        excelData.push(summaryRow);
        
        // Create a question legend sheet
        const legendData = questionColumns.map((q, i) => ({
          'Code': shortQuestionNames[i],
          'Full Question': q
        }));
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Create main data sheet
        const ws = XLSX.utils.json_to_sheet(excelData, { header: mainHeaders });
        
        // Set column widths
        const colWidths = [
          { wch: 5 },  // S.No
          { wch: 25 }, // Faculty Name
          { wch: 20 }, // School
          { wch: 20 }, // Department
          { wch: 10 }, // Semester
          { wch: 10 }, // Section
          { wch: 25 }, // Course Name
          ...shortQuestionNames.map(() => ({ wch: 8 })), // Questions
          { wch: 10 }, // Overall Avg
          { wch: 60 }  // Comments
        ];
        ws['!cols'] = colWidths;
        
        // Style the summary row (last row) with background color
        const summaryRowIdx = excelData.length + 1; // +1 for header row
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: summaryRowIdx - 1, c: col });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "FFE699" } }, // Yellow background
              font: { bold: true },
              alignment: { horizontal: "center" }
            };
          }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, 'Faculty Averages');
        
        // Create legend sheet
        const legendWs = XLSX.utils.json_to_sheet(legendData);
        legendWs['!cols'] = [{ wch: 10 }, { wch: 100 }];
        XLSX.utils.book_append_sheet(wb, legendWs, 'Question Legend');
        
        // Create Raw Data sheet with all filtered data
        const rawDataSheet: Record<string, unknown>[] = data.map((row, idx) => {
          const rawRow: Record<string, unknown> = { 'S.No': idx + 1 };
          headers.forEach(header => {
            rawRow[header] = row[header] ?? '';
          });
          return rawRow;
        });
        const rawWs = XLSX.utils.json_to_sheet(rawDataSheet, { header: ['S.No', ...headers] });
        // Set column widths for raw data
        const rawColWidths = [{ wch: 6 }, ...headers.map(h => ({ wch: Math.min(Math.max(h.length, 10), 40) }))];
        rawWs['!cols'] = rawColWidths;
        XLSX.utils.book_append_sheet(wb, rawWs, 'Raw Data');
        
        // Download
        const filterCount = Object.values(filterState).filter(v => v.length > 0).length;
        const suffix = filterCount > 0 ? '_filtered' : '_all';
        const fileName = `${activeSheet.name.replace(/\s+/g, '_')}_report${suffix}_${new Date().toISOString().slice(0,10)}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
      }
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handlePageChange = (page: number) => {
    fetchFilteredData(page);
  };

  // Count active filters
  const activeFilterCount = Object.values(filterState).filter(v => v.length > 0).length;

  // Sidebar resize handlers
  const startResizing = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback((e: MouseEvent) => {
    if (isResizing && sidebarRef.current) {
      const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar Filters - Resizable */}
      <aside 
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
        className="bg-white border-r border-slate-200 hidden md:flex flex-col relative flex-shrink-0"
      >
        {/* Resize Handle */}
        <div
          onMouseDown={startResizing}
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-400 transition-colors z-10 ${isResizing ? 'bg-indigo-500' : 'bg-transparent hover:bg-indigo-300'}`}
          title="Drag to resize"
        />
        
        {/* Fixed Header Section */}
        <div className="p-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3 text-indigo-600 mb-6">
            <div className="flex flex-col items-center justify-center">
              <div className="bg-white border border-indigo-200 shadow mb-1 flex items-center justify-center" style={{height:'72px',width:'160px',borderRadius:'6px'}}>
                <img src="/image.png" alt="QAA–Insight4Excellence Logo" className="object-contain h-full w-full" style={{borderRadius:'4px'}} />
              </div>
              <span className="font-bold text-lg tracking-tight text-indigo-700 text-center">QAA–Insight4Excellence</span>
            </div>
          </div>
          
          <div className="space-y-1">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Active Feedback Source</h4>
            <div className="relative group">
              <button className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition">
                <span className="truncate mr-2">{activeSheet?.name || 'Select a sheet...'}</span>
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              </button>
              <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50 overflow-hidden max-h-64 overflow-y-auto">
                {availableSheets.length > 0 ? (
                  availableSheets.map(s => (
                    <div key={s.id} className="flex items-center justify-between border-b border-slate-50 last:border-0">
                      <button 
                        onClick={() => setActiveSheet(s)}
                        className={`flex-1 text-left px-4 py-2.5 text-xs font-medium transition ${activeSheet?.id === s.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-indigo-50 hover:text-indigo-600'}`}
                      >
                        {s.name}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSheet(s.id); }}
                        className="px-2 py-2 text-slate-400 hover:text-red-500 transition"
                        title="Remove sheet"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-3 text-xs text-slate-400">No sheets added yet</p>
                )}
                <button 
                  onClick={() => setShowSheetModal(true)}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition flex items-center gap-2 border-t border-slate-100"
                >
                  <Plus className="w-3 h-3" /> Connect New Sheet
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Filters Section */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Dynamic Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px]">
                  {activeFilterCount}
                </span>
              )}
            </h4>
            <Filter className="w-3.5 h-3.5 text-slate-400" />
          </div>

{!activeSheet ? (
            <p className="text-sm text-slate-400 italic">Connect a Google Sheet to see filters</p>
          ) : Object.keys(dynamicFilters).length === 0 ? (
            <p className="text-sm text-slate-400 italic">{loading ? 'Loading filters...' : 'No filterable columns found'}</p>
          ) : (
            <div className="space-y-6">
              {(Object.entries(dynamicFilters) as [string, string[]][]).map(([category, options]) => {
                const searchQuery = filterSearchQueries[category] || '';
                
                // Apply merge mapping to get display options
                const displayOptions = getDisplayOptions(category, options);
                
                // Filter by search query (search canonical name and all variants)
                const filteredDisplayOptions = displayOptions.filter(({ displayName, originalNames }) => 
                  displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  originalNames.some(n => n.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                
                const selectedInCategory = filterState[category] || [];
                
                // Check if a display option is selected (any of its variants selected)
                const isDisplayOptionSelected = (originalNames: string[]) => 
                  originalNames.some(n => selectedInCategory.includes(n));
                
                // Separate selected and unselected display options
                const selectedDisplayOptions = filteredDisplayOptions.filter(opt => isDisplayOptionSelected(opt.originalNames));
                const unselectedDisplayOptions = filteredDisplayOptions.filter(opt => !isDisplayOptionSelected(opt.originalNames));
                
                const selectedCount = selectedDisplayOptions.length;
                
                // Check if all filtered options are selected
                const allFilteredSelected = filteredDisplayOptions.length > 0 && 
                  filteredDisplayOptions.every(opt => isDisplayOptionSelected(opt.originalNames));

                // Handle select all filtered options (adds all original names)
                const handleSelectAllFiltered = () => {
                  const currentSelected = filterState[category] || [];
                  const allOriginalNames = filteredDisplayOptions.flatMap(opt => opt.originalNames);
                  const newSelected = [...new Set([...currentSelected, ...allOriginalNames])];
                  setFilterState(prev => ({
                    ...prev,
                    [category]: newSelected
                  }));
                };

                // Handle deselect all filtered options
                const handleDeselectAllFiltered = () => {
                  const currentSelected = filterState[category] || [];
                  const allOriginalNames = filteredDisplayOptions.flatMap(opt => opt.originalNames);
                  const newSelected = currentSelected.filter(opt => !allOriginalNames.includes(opt));
                  setFilterState(prev => ({
                    ...prev,
                    [category]: newSelected
                  }));
                };
                
                // Handle clicking on a merged display option
                const handleMergedOptionChange = (displayName: string, originalNames: string[]) => {
                  const isSelected = isDisplayOptionSelected(originalNames);
                  const currentSelected = filterState[category] || [];
                  
                  if (isSelected) {
                    // Deselect all variants
                    setFilterState(prev => ({
                      ...prev,
                      [category]: (prev[category] || []).filter(n => !originalNames.includes(n))
                    }));
                  } else {
                    // Select all variants
                    const newSelected = [...new Set([...currentSelected, ...originalNames])];
                    setFilterState(prev => ({
                      ...prev,
                      [category]: newSelected
                    }));
                  }
                };

                return (
                  <div key={category}>
                    <label className="block text-xs font-bold text-slate-600 mb-2">
                      {category}
                      {selectedCount > 0 && (
                        <span className="ml-2 text-indigo-600">({selectedCount})</span>
                      )}
                    </label>
                    
                    {/* Filter Search Input */}
                    <div className="relative mb-2">
                      <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text"
                        placeholder={`Search ${category}...`}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                        value={searchQuery}
                        onChange={(e) => handleFilterSearch(category, e.target.value)}
                      />
                    </div>

                    {/* Select All / Deselect All / Merge Buttons */}
                    {filteredDisplayOptions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        <button
                          onClick={handleSelectAllFiltered}
                          disabled={allFilteredSelected}
                          className="flex-1 min-w-[80px] px-2 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Select All ({filteredDisplayOptions.length})
                        </button>
                        <button
                          onClick={handleDeselectAllFiltered}
                          disabled={selectedDisplayOptions.length === 0}
                          className="flex-1 min-w-[80px] px-2 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Deselect All
                        </button>
                        {selectedDisplayOptions.length >= 2 && (
                          <button
                            onClick={() => handleOpenMergeModal(category, selectedDisplayOptions.flatMap(o => o.originalNames))}
                            className="flex-1 min-w-[80px] px-2 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded transition flex items-center justify-center gap-1"
                          >
                            <Layers className="w-3 h-3" /> Merge ({selectedDisplayOptions.length})
                          </button>
                        )}
                      </div>
                    )}

                    <div className="space-y-1 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {/* Show selected options first with highlight */}
                      {selectedDisplayOptions.length > 0 && (
                        <>
                          {selectedDisplayOptions.map(({ displayName, originalNames }) => {
                            const isMerged = originalNames.length > 1;
                            return (
                              <div key={displayName} className="flex items-center gap-2 px-2 py-1.5 bg-indigo-50 rounded cursor-pointer transition border-l-2 border-indigo-500">
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={true}
                                    onChange={() => handleMergedOptionChange(displayName, originalNames)}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                  />
                                  <span className="text-sm text-indigo-700 font-medium truncate">{displayName}</span>
                                  {isMerged && (
                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold" title={`Merged: ${originalNames.join(', ')}`}>
                                      +{originalNames.length - 1}
                                    </span>
                                  )}
                                </label>
                                {isMerged && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUnmerge(category, displayName); }}
                                    className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded transition"
                                    title={`Unmerge: ${originalNames.join(', ')}`}
                                  >
                                    <X className="w-3 h-3" />
                                    <span className="font-medium">Unmerge</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {unselectedDisplayOptions.length > 0 && (
                            <div className="border-t border-slate-200 my-2"></div>
                          )}
                        </>
                      )}
                      
                      {/* Unselected options */}
                      {unselectedDisplayOptions.length > 0 ? (
                        unselectedDisplayOptions.map(({ displayName, originalNames }) => {
                          const isMerged = originalNames.length > 1;
                          return (
                            <div key={displayName} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer transition">
                              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={false}
                                  onChange={() => handleMergedOptionChange(displayName, originalNames)}
                                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-600 truncate">{displayName}</span>
                                {isMerged && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold" title={`Merged: ${originalNames.join(', ')}`}>
                                    +{originalNames.length - 1}
                                  </span>
                                )}
                              </label>
                              {isMerged && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUnmerge(category, displayName); }}
                                  className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded transition"
                                  title={`Unmerge: ${originalNames.join(', ')}`}
                                >
                                  <X className="w-3 h-3" />
                                  <span className="font-medium">Unmerge</span>
                                </button>
                              )}
                            </div>
                          );
                        })
                      ) : selectedDisplayOptions.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic px-2 py-1">No matching options</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="mt-8 space-y-3">
            <button 
              onClick={() => refreshData()}
              disabled={!activeSheet || loading}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Update Now
            </button>
            <button 
              onClick={() => { setFilterState({}); setFilterSearchQueries({}); }}
              disabled={activeFilterCount === 0}
              className="w-full py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0 z-40">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">QAA–Insight4Excellence Dashboard</h2>
              {activeSheet && analytics && (
                <div className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  Live Data
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-4 border-l border-slate-100 pl-6">
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={autoRefresh}
                    onChange={() => setAutoRefresh(!autoRefresh)}
                    disabled={!activeSheet}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-disabled:opacity-50"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Auto-Sync</span>
                </label>
              </div>
              {analytics && (
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last synced: {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Global Search Bar - Commented out for now
            <div className="hidden md:flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-64 lg:w-80">
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Search faculty, course, section..."
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
              />
              {globalSearchQuery && (
                <button onClick={() => setGlobalSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            */}

            {backgroundRefreshing && (
              <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded animate-pulse">
                Updating...
              </div>
            )}
            
            <div className="hidden lg:flex items-center gap-3 mr-4 py-1 px-3 bg-slate-50 rounded-full border border-slate-200">
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-sm font-semibold text-slate-700">{user.username}</span>
            </div>
            
            <button 
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-red-500 transition"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
                <button onClick={() => setError('')} className="ml-auto">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* No Sheet Selected State */}
            {!activeSheet ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                <Database className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Faculty Feedback Analysis System</h2>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  Connect your Google Sheet containing student feedback data to analyze faculty performance, generate scorecards, and gain actionable insights.
                </p>
                <div className="flex flex-wrap justify-center gap-4 mb-8 text-sm text-slate-600">
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Faculty Performance Rankings</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Course-wise Analysis</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Section Comparison</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg">
                    <Award className="w-4 h-4 text-indigo-600" />
                    <span>Faculty Scorecards</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowSheetModal(true)}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition"
                >
                  <Plus className="w-5 h-5" /> Connect Google Sheet
                </button>
              </div>
            ) : (
              <>
                {/* Top Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">{activeSheet.name}</h1>
                    <p className="text-slate-500 text-sm">
                      {analytics 
                        ? `Analyzing ${analytics.totalResponses.toLocaleString()} responses${activeFilterCount > 0 ? ` (${activeFilterCount} filters applied)` : ''}`
                        : 'Loading data...'}
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    {/* View Mode Toggle - Analytics and Scorecard commented out for now */}
                    <div className="flex bg-white border border-slate-200 rounded-lg p-1">
                      {/* 
                      <button
                        onClick={() => setViewMode('analytics')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                          viewMode === 'analytics' 
                            ? 'bg-indigo-600 text-white' 
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <BarChart3 className="w-4 h-4" /> Analytics
                      </button>
                      <button
                        onClick={() => setViewMode('scorecard')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                          viewMode === 'scorecard' 
                            ? 'bg-indigo-600 text-white' 
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Award className="w-4 h-4" /> Scorecard
                      </button>
                      */}
                      <button
                        onClick={() => setViewMode('data')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                          viewMode === 'data' 
                            ? 'bg-indigo-600 text-white' 
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Table className="w-4 h-4" /> Data
                      </button>
                    </div>

                    <button 
                      onClick={handleGenerateAiReport}
                      disabled={isGeneratingAi || !analytics}
                      className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-100 transition active:scale-95 disabled:opacity-50"
                    >
                      {isGeneratingAi ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : <BrainCircuit className="w-4 h-4" />}
                      AI Insights
                    </button>
                    <button 
                      onClick={viewMode === 'analytics' ? exportAnalyticsCSV : exportFilteredCSV}
                      disabled={!analytics || exporting}
                      className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50"
                    >
                      {exporting ? (
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Export CSV
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500 font-medium animate-pulse">Processing your data...</p>
                  </div>
                ) : analytics ? (
                  <>
                    <StatsCards data={analytics} />

                    {/* Faculty Averages Card - shown when filters are applied */}
                    {facultyAverages && (
                      <div className="mb-6 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-xl border border-emerald-200 shadow-sm">
                        {/* Header with faculty name */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-emerald-500 rounded-lg">
                            <Star className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-emerald-800 text-lg">{facultyAverages.facultyName}</h3>
                            <p className="text-xs text-emerald-600">Average scores based on filtered data</p>
                          </div>
                        </div>
                        
                        {/* Metadata: School, Department, Course, Section */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                          {facultyAverages.school && (
                            <div className="bg-white/70 rounded-lg px-3 py-2 border border-emerald-100">
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">School</p>
                              <p className="text-sm text-slate-700 truncate">{facultyAverages.school}</p>
                            </div>
                          )}
                          {facultyAverages.department && (
                            <div className="bg-white/70 rounded-lg px-3 py-2 border border-emerald-100">
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Department</p>
                              <p className="text-sm text-slate-700 truncate">{facultyAverages.department}</p>
                            </div>
                          )}
                          {facultyAverages.section && (
                            <div className="bg-white/70 rounded-lg px-3 py-2 border border-emerald-100">
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Section</p>
                              <p className="text-sm text-slate-700 truncate">{facultyAverages.section}</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Question Scores */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 mb-4">
                          {facultyAverages.questionScores.map((q, idx) => (
                            <div 
                              key={idx} 
                              className="bg-white rounded-lg p-3 border border-emerald-100 shadow-sm text-center"
                            >
                              <p className="text-xs font-bold text-emerald-600 mb-1">{q.name}</p>
                              <p className={`text-xl font-bold ${
                                q.avg >= 4.0 ? 'text-emerald-600' : 
                                q.avg >= 3.5 ? 'text-blue-600' : 
                                q.avg >= 3.0 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {q.avg.toFixed(2)}
                              </p>
                            </div>
                          ))}
                          
                          {/* Overall Average */}
                          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg p-3 shadow-md text-center col-span-2">
                            <p className="text-xs font-bold text-emerald-100 mb-1">Overall Avg</p>
                            <div className="flex items-center justify-center gap-2">
                              <p className="text-2xl font-bold text-white">
                                {facultyAverages.overallAvg.toFixed(2)}
                              </p>
                              <span className="text-emerald-200 text-sm">/5.00</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Comments Section */}
                        {facultyAverages.comments.length > 0 && (
                          <div className="bg-white/70 rounded-lg p-4 border border-emerald-100">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-3">
                              Comments ({facultyAverages.comments.length})
                            </p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {facultyAverages.comments.map((comment, idx) => (
                                <div key={idx} className="flex gap-2 text-sm text-slate-700">
                                  <span className="text-emerald-500 font-bold flex-shrink-0">{idx + 1}.</span>
                                  <p>{comment}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {aiInsights && (
                      <div className="mb-8 bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-xl animate-in slide-in-from-top duration-500">
                        <div className="flex items-center gap-2 text-indigo-700 mb-4">
                          <BrainCircuit className="w-5 h-5" />
                          <h3 className="font-bold">Gemini AI Strategic Analysis</h3>
                        </div>
                        <div className="prose prose-sm prose-indigo max-w-none text-slate-700 space-y-2 whitespace-pre-wrap text-sm leading-relaxed">
                          {aiInsights}
                        </div>
                        <button 
                          onClick={() => setAiInsights('')}
                          className="mt-4 text-xs font-bold text-indigo-600 hover:underline"
                        >
                          Dismiss Analysis
                        </button>
                      </div>
                    )}

                    {/* Conditional View */}
                    {viewMode === 'analytics' ? (
                      <>
                        <AnalyticsCharts data={analytics} />

                        {/* Question Details Table */}
                        <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-slate-800">Detailed Feedback Parameters</h3>
                              <p className="text-sm text-slate-500 mt-1">Assessment scores for each feedback criterion</p>
                            </div>
                            <FileText className="w-4 h-4 text-slate-400" />
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                                  <th className="px-6 py-4">Assessment Parameter</th>
                                  <th className="px-6 py-4">Average Score</th>
                                  <th className="px-6 py-4">Response Count</th>
                                  <th className="px-6 py-4">Rating Distribution</th>
                                  <th className="px-6 py-4">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {analytics.questionScores.map((q, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-700 max-w-xs">{q.question}</td>
                                    <td className="px-6 py-4">
                                      <span className="text-sm font-bold text-slate-900">{q.score.toFixed(2)}</span>
                                      <span className="text-xs text-slate-400">/5.00</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600">
                                      {q.validResponses || analytics.totalResponses}
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex h-2 w-48 rounded-full overflow-hidden bg-slate-100">
                                        <div className="bg-emerald-500" style={{ width: `${((q.distribution['5'] || q.distribution['Strongly Agree'] || 0) + (q.distribution['4'] || q.distribution['Agree'] || 0)) / Math.max(q.validResponses || analytics.totalResponses, 1) * 100}%` }}></div>
                                        <div className="bg-amber-400" style={{ width: `${(q.distribution['3'] || q.distribution['Neutral'] || 0) / Math.max(q.validResponses || analytics.totalResponses, 1) * 100}%` }}></div>
                                        <div className="bg-rose-500" style={{ width: `${((q.distribution['2'] || q.distribution['Disagree'] || 0) + (q.distribution['1'] || q.distribution['Strongly Disagree'] || 0)) / Math.max(q.validResponses || analytics.totalResponses, 1) * 100}%` }}></div>
                                      </div>
                                      <div className="flex gap-2 mt-1 text-[9px] text-slate-400">
                                        <span className="flex items-center gap-0.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Good</span>
                                        <span className="flex items-center gap-0.5"><div className="w-2 h-2 rounded-full bg-amber-400"></div> Neutral</span>
                                        <span className="flex items-center gap-0.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Poor</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      {q.score >= 4.5 ? (
                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">Excellent</span>
                                      ) : q.score >= 4.0 ? (
                                        <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">Very Good</span>
                                      ) : q.score >= 3.5 ? (
                                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">Good</span>
                                      ) : q.score >= 3.0 ? (
                                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">Satisfactory</span>
                                      ) : (
                                        <span className="px-2 py-1 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full">Needs Attention</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : viewMode === 'scorecard' ? (
                      <FacultyScorecard 
                        data={analytics} 
                        searchQuery={globalSearchQuery}
                        onFacultySelect={(facultyName) => {
                          // Apply filter for selected faculty
                          const facultyKey = Object.keys(dynamicFilters).find(k => 
                            k.toLowerCase().includes('faculty') || k.toLowerCase().includes('teacher')
                          );
                          if (facultyKey) {
                            setFilterState(prev => ({ ...prev, [facultyKey]: [facultyName] }));
                          }
                        }}
                      />
                    ) : (
                      <FilteredDataTable
                        headers={filteredDataHeaders}
                        data={filteredData}
                        pagination={pagination}
                        loading={filteredDataLoading}
                        onPageChange={handlePageChange}
                        onExportCSV={exportFilteredCSV}
                        onExportAverageExcel={exportFilteredAverageExcel}
                        exporting={exporting}
                        fetchAllData={fetchAllFilteredData}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">No Data Available</h2>
                    <p className="text-slate-500">Check your Google Sheet URL or filter configuration.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* New Sheet Modal */}
      {showSheetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowSheetModal(false); setSheetValidationResult(null); }}></div>
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 animate-in zoom-in duration-300">
            <button onClick={() => { setShowSheetModal(false); setSheetValidationResult(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Connect Google Sheet Source</h3>
            <p className="text-sm text-slate-500 mb-6">Connect your Google Form response sheet. Ensure the sheet is shared (at least "Anyone with the link can view").</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Google Sheet URL</label>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={newSheetUrl}
                    onChange={(e) => { setNewSheetUrl(e.target.value); setSheetValidationResult(null); }}
                  />
                  <button
                    onClick={validateSheetUrl}
                    disabled={!newSheetUrl || sheetValidating}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition disabled:opacity-50"
                  >
                    {sheetValidating ? (
                      <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : 'Validate'}
                  </button>
                </div>
                {sheetValidationResult && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${sheetValidationResult.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {sheetValidationResult.valid ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Sheet validated: {sheetValidationResult.title}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Cannot access sheet. Make sure it's shared publicly.</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Dataset Name</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="e.g. Autumn Semester 2024 Feedback"
                  value={newSheetName}
                  onChange={(e) => setNewSheetName(e.target.value)}
                />
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-3 mt-4">
                <div className="bg-amber-100 p-1.5 h-fit rounded text-amber-700">
                  <Database className="w-4 h-4" />
                </div>
                <div className="text-xs text-amber-800 leading-relaxed">
                  <strong>Important:</strong> Your Google Sheet must be shared with view access. Go to your sheet &gt; Share &gt; "Anyone with the link" &gt; Viewer.
                </div>
              </div>
              <button 
                onClick={handleAddSheet}
                disabled={!newSheetUrl || !newSheetName}
                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect Data Source
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Names Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowMergeModal(false)}></div>
          <div className="relative bg-white w-full max-w-md max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in duration-300">
            <button onClick={() => setShowMergeModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition z-10">
              <X className="w-5 h-5" />
            </button>
            <div className="p-6 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <Layers className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Merge Names</h3>
              </div>
              <p className="text-sm text-slate-500">
                Merge these {mergeSelectedNames.length} names into one. They will appear as a single entry in filters.
              </p>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Names to Merge</label>
                  <div className="bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {mergeSelectedNames.map((name, idx) => (
                      <div key={idx} className="text-sm text-slate-600 py-1 border-b border-slate-100 last:border-0">
                        {name}
                      </div>
                    ))}
                </div>
              </div>
              
              {/* Similar Names Suggestion in Merge Modal */}
              {(() => {
                // Find similar names not already in merge list
                const allOptions = dynamicFilters[mergeCategory] || [];
                const similarNames: string[] = [];
                mergeSelectedNames.forEach(selectedName => {
                  const similar = findSimilarNames(selectedName, allOptions, 0.65);
                  similar.forEach(s => {
                    if (!mergeSelectedNames.includes(s) && !similarNames.includes(s)) {
                      similarNames.push(s);
                    }
                  });
                });
                
                if (similarNames.length === 0) return null;
                
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <p className="text-xs font-bold text-amber-800">Similar names found!</p>
                    </div>
                    <p className="text-[11px] text-amber-700 mb-2">
                      These names might also be the same person. Click to add them:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {similarNames.map((name, idx) => (
                        <button
                          key={idx}
                          onClick={() => setMergeSelectedNames(prev => [...prev, name])}
                          className="px-2 py-1 text-xs bg-white border border-amber-300 text-amber-700 rounded hover:bg-amber-100 transition flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          {name}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setMergeSelectedNames(prev => [...prev, ...similarNames])}
                      className="mt-2 w-full py-1.5 text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded transition"
                    >
                      Add All Similar Names
                    </button>
                  </div>
                );
              })()}
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Display As (Canonical Name)</label>
                <select
                  value={mergeCanonicalName}
                  onChange={(e) => setMergeCanonicalName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none mb-2"
                >
                  {mergeSelectedNames.map((name, idx) => (
                    <option key={idx} value={name}>{name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">Or enter a custom name:</p>
                <input
                  type="text"
                  value={mergeCanonicalName}
                  onChange={(e) => setMergeCanonicalName(e.target.value)}
                  placeholder="Enter custom display name..."
                  className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="text-xs text-emerald-800 leading-relaxed">
                  <strong>Note:</strong> Merged names will be saved locally. When filtering, all variants will be treated as "<strong>{mergeCanonicalName || 'the chosen name'}</strong>".
                </div>
              </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="p-4 border-t border-slate-100 flex-shrink-0">
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowMergeModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmMerge}
                  disabled={!mergeCanonicalName}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg shadow-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Merge Names
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
