// Fix: Use namespace import for React to ensure JSX types are correctly resolved
import * as React from 'react';
import { User, AggregatedData, FilterState, DynamicFilters, SheetSource, FilteredDataRow, PaginationInfo, UserSheet } from '../types';
import { dataService } from '../services/dataService';
import { geminiService } from '../services/geminiService';
import StatsCards from './StatsCards';
import AnalyticsCharts from './AnalyticsCharts';
import FilteredDataTable from './FilteredDataTable';
import FacultyScorecard from './FacultyScorecard';
import { Filter, Download, Database, ChevronDown, ChevronLeft, ChevronRight, User as UserIcon, LogOut, BrainCircuit, Plus, FileText, X, RefreshCw, Clock, Search, AlertCircle, Table, BarChart3, CheckCircle, Award, Users, BookOpen, Layers, PanelLeftClose, PanelLeft, FileSpreadsheet, Star, StarHalf, AlertTriangle, Loader2, PieChart as PieChartIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell, Legend, PieChart, Pie } from 'recharts';
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

// Type for merged names: category -> { canonicalName: { variants: [variant1, variant2, ...], permanent: boolean } }
type MergedNamesMapping = Record<string, Record<string, { variants: string[], permanent: boolean }>>;

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
      // Default to false - use manual refresh button to save API quota
      return saved !== null ? JSON.parse(saved) : false;
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
  const [updateOriginalData, setUpdateOriginalData] = React.useState<boolean>(true);

  // Faculty averages state for display
  const [facultyAverages, setFacultyAverages] = React.useState<{
    questionScores: { name: string; fullName: string; avg: number }[];
    overallAvg: number;
    facultyName: string;
    school: string;
    department: string;
    course: string;
    section: string;
    comments: string[];
  } | null>(null);

  // Merge operation progress state
  const [mergeProgress, setMergeProgress] = React.useState<{
    isProcessing: boolean;
    step: 'confirming' | 'updating-sheet' | 'refreshing' | 'complete' | null;
    message: string;
  }>({ isProcessing: false, step: null, message: '' });

  // Scorecard view mode: 'details' shows boxes, 'graph' shows charts
  const [scorecardViewMode, setScorecardViewMode] = React.useState<'details' | 'graph'>('details');

  const refreshTimerRef = React.useRef<number | null>(null);

  // Compute display sheets (includes Master Sheet if > 1 sheets connected)
  const displaySheets = React.useMemo(() => {
    if (availableSheets.length > 1) {
      const masterSheet: SheetSource = {
        id: 'master',
        name: 'Master Sheet (All Connected Data)',
        url: availableSheets.map(s => s.url as string), // Extract URLs as array
        dateAdded: new Date().toISOString(),
        isMaster: true
      };
      return [masterSheet, ...availableSheets];
    }
    return availableSheets;
  }, [availableSheets]);

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

  // Force refresh - clears all cache and fetches fresh data immediately
  // This is used after merge/unmerge operations to ensure instant UI updates
  const forceRefreshData = React.useCallback(async () => {
    if (!activeSheet) return;

    setLoading(true);
    setError('');

    try {
      // 1. Force refresh on backend (clears all caches and fetches fresh data from Google Sheets)
      console.log('[FORCE REFRESH] Starting full data refresh...');
      await dataService.forceRefresh(activeSheet.url);

      // 2. Fetch fresh metadata, analytics, and filtered data in parallel for speed
      const [metaResponse, analyticsResponse, filteredResponse] = await Promise.all([
        dataService.getSheetMetadata(activeSheet.url),
        dataService.fetchAnalytics(activeSheet.url, filterState),
        dataService.getFilteredData(activeSheet.url, filterState, 1, 50)
      ]);

      // Update metadata/filters
      if (metaResponse.success && metaResponse.data) {
        setDynamicFilters(metaResponse.data.filters);
      }

      // Update analytics
      if (analyticsResponse.success && analyticsResponse.data) {
        setAnalytics(analyticsResponse.data);
        setLastSynced(new Date());
      }

      // Always update filtered data (ready for any view mode)
      if (filteredResponse.success && filteredResponse.data) {
        setFilteredDataHeaders(filteredResponse.data.headers);
        setFilteredData(filteredResponse.data.data);
        setPagination(filteredResponse.data.pagination);
      }

      console.log('[FORCE REFRESH] Completed successfully');
    } catch (err) {
      console.error("Force Refresh Error:", err);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setLoading(false);
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

  // Load merged names and merge history from backend when activeSheet changes
  React.useEffect(() => {
    const loadMergedNamesAndHistory = async () => {
      if (!activeSheet?.id) {
        setMergedNames({});
        setMergeHistory([]);
        return;
      }

      setMergedNamesLoading(true);
      try {
        // Load merged names and history in parallel for speed
        const [mergedResponse, historyResponse] = await Promise.all([
          dataService.getMergedNames(activeSheet.id),
          dataService.getMergeHistory(activeSheet.id)
        ]);

        if (mergedResponse.success && mergedResponse.data) {
          setMergedNames(mergedResponse.data);
        } else {
          setMergedNames({});
        }

        if (historyResponse.success && historyResponse.data) {
          setMergeHistory(historyResponse.data);
        } else {
          setMergeHistory([]);
        }
      } catch (err) {
        console.error('Failed to load merged names:', err);
        setMergedNames({});
        setMergeHistory([]);
      } finally {
        setMergedNamesLoading(false);
      }
    };

    loadMergedNamesAndHistory();
  }, [activeSheet?.id]);

  // Calculate faculty averages when filtered data changes
  React.useEffect(() => {
    const calculateFacultyAverages = async () => {
      if (!activeSheet) {
        setFacultyAverages(null);
        return;
      }

      // Check if any filter is applied
      const hasFilters = Object.values(filterState).some((v: any) => v && v.length > 0);
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
              for (const [canonical, mergeData] of Object.entries(categoryMerges)) {
                // Ensure backward compatibility with old data structure which was just a string array
                const isOldFormat = Array.isArray(mergeData);
                const variants: string[] = isOldFormat ? (mergeData as any) : ((mergeData as any).variants || []);
                if (selectedNames.some((name: string) => variants.includes(name) || canonical === name)) {
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
            return { name: `Q${i + 1}`, fullName: qCol, avg };
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
  const getDisplayOptions = React.useCallback((category: string, options: string[]): { displayName: string; originalNames: string[]; permanent: boolean }[] => {
    const categoryMerges = mergedNames[category] || {};
    const displayMap = new Map<string, { originalNames: string[]; permanent: boolean }>();

    options.forEach(opt => {
      let foundCanonical = opt;
      let isPermanent = false;
      // Check if this option is a variant
      for (const [canonical, mergeData] of Object.entries(categoryMerges)) {
        const isOldFormat = Array.isArray(mergeData);
        const variants = isOldFormat ? (mergeData as unknown as string[]) : (mergeData as { variants: string[] }).variants || [];
        if (variants.includes(opt) || canonical === opt) {
          foundCanonical = canonical;
          isPermanent = isOldFormat ? false : (mergeData as { permanent?: boolean }).permanent || false;
          break;
        }
      }

      if (!displayMap.has(foundCanonical)) {
        displayMap.set(foundCanonical, { originalNames: [], permanent: isPermanent });
      }
      displayMap.get(foundCanonical)!.originalNames.push(opt);
    });

    return Array.from(displayMap.entries()).map(([displayName, data]) => ({
      displayName,
      originalNames: data.originalNames,
      permanent: data.permanent
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

    // Start merge progress
    setMergeProgress({ isProcessing: true, step: 'confirming', message: 'Preparing merge...' });

    const newMergedNames = { ...mergedNames };
    const categoryMerges = newMergedNames[mergeCategory] ? { ...newMergedNames[mergeCategory] } : {};

    // Store original data
    const originalData: Record<string, string> = {};
    mergeSelectedNames.forEach(name => {
      originalData[name] = name;
    });

    // Remove any existing merges that include these names
    for (const canonical of Object.keys(categoryMerges)) {
      if (categoryMerges[canonical] && categoryMerges[canonical].variants) {
        categoryMerges[canonical].variants = categoryMerges[canonical].variants.filter(
          v => !mergeSelectedNames.includes(v)
        );
        if (categoryMerges[canonical].variants.length === 0) {
          delete categoryMerges[canonical];
        }
      }
    }

    // Add new merge with all selected names as variants
    categoryMerges[mergeCanonicalName] = {
      variants: [...mergeSelectedNames],
      permanent: updateOriginalData
    };
    newMergedNames[mergeCategory] = categoryMerges;

    // Update local state immediately (optimistic update)
    setMergedNames(newMergedNames);

    // Update filter state to include ALL original variant names
    setFilterState(prev => {
      const currentValues = prev[mergeCategory] || [];
      const otherValues = currentValues.filter(v => !mergeSelectedNames.includes(v));
      const newValues = [...new Set([...otherValues, ...mergeSelectedNames])];
      return { ...prev, [mergeCategory]: newValues };
    });

    // Save to backend and apply to Google Sheets
    setMergedNamesLoading(true);
    try {
      setMergeProgress({ isProcessing: true, step: 'confirming', message: 'Saving merge configuration...' });
      
      // Save merged names to backend
      await dataService.updateMergedNames(activeSheet.id, newMergedNames);
      
      // Add to history
      await dataService.addMergeHistory(
        activeSheet.id,
        'merge',
        mergeCategory,
        mergeCanonicalName,
        mergeSelectedNames,
        originalData
      );

      if (updateOriginalData) {
        setMergeProgress({ 
          isProcessing: true, 
          step: 'updating-sheet', 
          message: `Updating Google Sheets... Replacing ${mergeSelectedNames.length} names with "${mergeCanonicalName}"` 
        });
        
        console.log('[MERGE] Applying merge to Google Sheet...', {
          url: activeSheet.url,
          category: mergeCategory,
          canonical: mergeCanonicalName,
          variants: mergeSelectedNames
        });
        
        const mergeResult = await dataService.applyMergeToSheet(
          activeSheet.url,
          mergeCategory,
          mergeCanonicalName,
          mergeSelectedNames
        );
        
        if (!mergeResult.success) {
          console.error('[MERGE] Failed to apply merge to sheet:', mergeResult.error);
          // User-friendly error messages
          let errorMessage = mergeResult.error || 'Unknown error';
          if (errorMessage.includes('Quota') || errorMessage.includes('quota') || errorMessage.includes('Rate Limit')) {
            errorMessage = 'Google API quota limit reached. Please wait 1-2 minutes and try again. Tip: Avoid rapid refreshing.';
          }
          setError(`Failed to update Google Sheet: ${errorMessage}`);
          setMergeProgress({ isProcessing: false, step: null, message: '' });
          setMergedNamesLoading(false);
          return;
        } else {
          console.log('[MERGE] Successfully applied to Google Sheet:', mergeResult.data);
        }
      }

      // Show refreshing step
      setMergeProgress({ isProcessing: true, step: 'refreshing', message: 'Refreshing dashboard data...' });
      
      // FORCE refresh data to reflect the changes from the sheet immediately
      await forceRefreshData();
      
      // Show completion
      setMergeProgress({ isProcessing: true, step: 'complete', message: `Successfully merged ${mergeSelectedNames.length} names into "${mergeCanonicalName}"` });
      
      // Keep completion message visible briefly
      setTimeout(() => {
        setMergeProgress({ isProcessing: false, step: null, message: '' });
        setShowMergeModal(false);
        setMergeCategory('');
        setMergeSelectedNames([]);
        setMergeCanonicalName('');
      }, 1500);
    } catch (err) {
      console.error('Failed to save merged names or apply to sheet:', err);
      setMergeProgress({ isProcessing: false, step: null, message: '' });
      setError('Failed to complete merge. Please try again.');
    } finally {
      setMergedNamesLoading(false);
    }
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
      // FORCE refresh to ensure immediate UI update
      await forceRefreshData();
    } catch (err) {
      console.error('Failed to save unmerge:', err);
    }
  };

  // Handle making a local merge permanent
  const handleMakePermanent = async (category: string, canonicalName: string, originalNames: string[]) => {
    if (!activeSheet?.id || !activeSheet?.url) return;

    setMergedNamesLoading(true);
    try {
      // 1. Apply to Google Sheets
      console.log('[MERGE] Making merge permanent...', { category, canonicalName, variants: originalNames });
      
      const mergeResult = await dataService.applyMergeToSheet(
        activeSheet.url,
        category,
        canonicalName,
        originalNames
      );

      if (!mergeResult.success) {
        console.error('[MERGE] Failed to make permanent:', mergeResult.error);
        setError(`Failed to update Google Sheet: ${mergeResult.error || 'Unknown error'}`);
        setMergedNamesLoading(false);
        return;
      }
      
      console.log('[MERGE] Successfully made permanent:', mergeResult.data);

      // 2. Update local state to mark as permanent
      const newMergedNames = { ...mergedNames };
      if (!newMergedNames[category]) newMergedNames[category] = {};

      if (newMergedNames[category][canonicalName]) {
        newMergedNames[category][canonicalName].permanent = true;
      } else {
        // Fallback in case it wasn't properly structured
        newMergedNames[category][canonicalName] = {
          variants: originalNames,
          permanent: true
        };
      }

      setMergedNames(newMergedNames);

      // 3. Save updated state to backend
      await dataService.updateMergedNames(activeSheet.id, newMergedNames);

      // 4. FORCE refresh data to ensure immediate UI update
      await forceRefreshData();
    } catch (err) {
      console.error('Failed to make merge permanent:', err);
      setError('Failed to make merge permanent. Please try again.');
    } finally {
      setMergedNamesLoading(false);
    }
  };

  // Initial and reactive data fetch - also clears data when no sheet is active
  React.useEffect(() => {
    if (activeSheet) {
      refreshData();
    } else {
      // Clear all data when no sheet is active
      setAnalytics(null);
      setDynamicFilters({});
      setFilteredData([]);
      setFilteredDataHeaders([]);
      setFilterState({});
      setPagination({ page: 1, pageSize: 50, totalRows: 0, totalPages: 0 });
      setFacultyAverages(null);
      setError('');
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

            // Determine which sheet to show by default
            // Priority: Master Sheet (if multiple sheets) > User's default > First sheet
            let activeSheetToSet: SheetSource | null = null;

            if (sheetSources.length > 1) {
              // Create master sheet for multiple connected sheets
              const masterSheet: SheetSource = {
                id: 'master',
                name: 'Master Sheet (All Connected Data)',
                url: sheetSources.map(s => s.url as string),
                dateAdded: new Date().toISOString(),
                isMaster: true
              };
              activeSheetToSet = masterSheet;
            } else {
              // Single sheet or user's default
              activeSheetToSet = sheetSources.find(s => s.id === defaultSheetId) || sheetSources[0];
            }

            if (activeSheetToSet) {
              setActiveSheet(activeSheetToSet);
              localStorage.setItem(STORAGE_KEYS.ACTIVE_SHEET, JSON.stringify(activeSheetToSet));
            }
          } else {
            // No sheets in MongoDB - clear local state and localStorage
            setAvailableSheets([]);
            setActiveSheet(null);
            setAnalytics(null);
            setDynamicFilters({});
            setFilteredData([]);
            setFilteredDataHeaders([]);
            setFilterState({});
            setPagination({ page: 1, pageSize: 50, totalRows: 0, totalPages: 0 });
            setMergedNames({});
            setMergeHistory([]);
            setFacultyAverages(null);
            
            // Clear localStorage to avoid stale data
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHEET);
            localStorage.removeItem(STORAGE_KEYS.FILTER_STATE);
            localStorage.setItem(STORAGE_KEYS.SAVED_SHEETS, JSON.stringify([]));
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
  // Reduced to 60 seconds to avoid API quota issues
  const lastRefreshTimeRef = React.useRef<number>(0);
  const consecutiveRefreshesRef = React.useRef<number>(0);
  
  React.useEffect(() => {
    if (autoRefresh && activeSheet) {
      const smartRefresh = async () => {
        try {
          // Prevent too frequent refreshes (minimum 30 second gap)
          const now = Date.now();
          if (now - lastRefreshTimeRef.current < 30000) {
            console.log('Skipping refresh - too soon since last refresh');
            return;
          }

          // If we've done 3 consecutive refreshes, wait longer (backoff)
          if (consecutiveRefreshesRef.current >= 3) {
            console.log('Backoff: Too many consecutive refreshes, waiting...');
            consecutiveRefreshesRef.current = 0;
            return;
          }

          const result = await dataService.checkForUpdates(activeSheet.url);
          if (result.success && result.data) {
            const { hasChanged, delta, shouldInstantRefresh } = result.data;

            if (hasChanged) {
              console.log(`Smart refresh: ${delta} changes detected`);
              lastRefreshTimeRef.current = now;
              consecutiveRefreshesRef.current++;

              if (shouldInstantRefresh) {
                // 1-10 changes: instant refresh (already triggered on backend)
                console.log('Instant refresh triggered for small change');
                await refreshData(true); // Background refresh
              } else if (Math.abs(delta) > 10) {
                // Large change: force refresh but with backoff
                console.log('Large change detected, forcing refresh');
                await refreshData(true);
              }
            } else {
              // No changes - reset consecutive counter
              consecutiveRefreshesRef.current = 0;
            }
          }
        } catch (error) {
          console.error('Smart refresh check failed:', error);
          // On error (likely quota), wait longer
          consecutiveRefreshesRef.current = 5; // Force backoff
        }
      };

      // Check every 60 seconds to avoid API quota issues (was 5 seconds)
      refreshTimerRef.current = window.setInterval(smartRefresh, 60000);

      // Run once on enable (but not immediately to avoid quota)
      const initialTimeout = setTimeout(() => smartRefresh(), 5000);
      
      return () => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        clearTimeout(initialTimeout);
      };
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
    // Find the sheet to get its URL for cache clearing
    const sheetToDelete = availableSheets.find(s => s.id === sheetId);
    
    // Remove from MongoDB
    try {
      await dataService.removeUserSheet(sheetId);
      
      // Also clear the cache for this sheet's data
      if (sheetToDelete?.url) {
        await dataService.refreshCache(sheetToDelete.url);
      }
    } catch (err) {
      console.error('Failed to remove sheet from database:', err);
    }

    const remaining = availableSheets.filter(s => s.id !== sheetId);
    setAvailableSheets(remaining);
    
    if (activeSheet?.id === sheetId || activeSheet?.isMaster) {
      if (remaining.length > 0) {
        // If multiple sheets remain, use master sheet
        if (remaining.length > 1) {
          const masterSheet: SheetSource = {
            id: 'master',
            name: 'Master Sheet (All Connected Data)',
            url: remaining.map(s => s.url as string),
            dateAdded: new Date().toISOString(),
            isMaster: true
          };
          setActiveSheet(masterSheet);
        } else {
          setActiveSheet(remaining[0]);
        }
      } else {
        // No sheets remaining - clear all data
        setActiveSheet(null);
        setAnalytics(null);
        setDynamicFilters({});
        setFilteredData([]);
        setFilteredDataHeaders([]);
        setFilterState({});
        setPagination({ page: 1, pageSize: 50, totalRows: 0, totalPages: 0 });
        setMergedNames({});
        setMergeHistory([]);
        setFacultyAverages(null);
        
        // Clear localStorage
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHEET);
        localStorage.removeItem(STORAGE_KEYS.FILTER_STATE);
        localStorage.setItem(STORAGE_KEYS.SAVED_SHEETS, JSON.stringify([]));
      }
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
            csv += `"${avg.question.replace(/"/g, '""')}","${avg.average.toFixed(1)}","${avg.count}","${rating}"\n`;
          });

          // Add overall average
          csv += '\n';
          const overallRating = overallAverage >= 4.5 ? 'Excellent' :
            overallAverage >= 4.0 ? 'Very Good' :
              overallAverage >= 3.5 ? 'Good' :
                overallAverage >= 3.0 ? 'Satisfactory' : 'Needs Improvement';
          csv += `"OVERALL AVERAGE","${overallAverage.toFixed(1)}","","${overallRating}"\n`;
        }

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filterCount = Object.values(filterState).filter(v => v.length > 0).length;
        const suffix = filterCount > 0 ? '_filtered' : '_all';
        const avgSuffix = includeAverages ? '_with_averages' : '';
        a.download = `${activeSheet.name.replace(/\s+/g, '_')}${suffix}${avgSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
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
          for (const [canonical, mergeData] of Object.entries(categoryMerges)) {
            if (mergeData && (mergeData as any).variants && Array.isArray((mergeData as any).variants)) {
              if ((mergeData as any).variants.includes(name) || canonical === name) {
                return canonical;
              }
            } else if (Array.isArray(mergeData)) {
              // Fallback for old data structure where it was just an array
              if (mergeData.includes(name) || canonical === name) {
                return canonical;
              }
            }
          }
          return name;
        };

        // Group data by faculty and section
        const facultyGroups: Record<string, {
          info: Record<string, string>;
          rowCount: number;
          questionTotals: Record<string, { sum: number; count: number }>;
          comments: string[];
        }> = {};

        data.forEach(row => {
          const originalFaculty = facultyCol ? String(row[facultyCol] || '').trim() : 'Unknown';
          if (!originalFaculty) return;

          // Get canonical name for grouping
          const faculty = getCanonicalFacultyName(originalFaculty);
          // Get section for grouping
          const section = sectionCol ? String(row[sectionCol] || '').trim() : '';

          // Create a composite key for grouping by both faculty and section
          const groupKey = `${faculty}|${section}`;

          if (!facultyGroups[groupKey]) {
            facultyGroups[groupKey] = {
              info: {
                'Faculty Name': faculty,
                'School': schoolCol ? String(row[schoolCol] || '') : '',
                'Department': deptCol ? String(row[deptCol] || '') : '',
                'Semester': semesterCol ? String(row[semesterCol] || '') : '',
                'Section': section,
                'Course Name': courseCol ? String(row[courseCol] || '') : ''
              },
              rowCount: 0,
              questionTotals: {},
              comments: []
            };
          }

          // Increment count for this specific faculty+section combination
          facultyGroups[groupKey].rowCount++;

          // Accumulate question scores
          questionColumns.forEach(qCol => {
            const val = Number(row[qCol]);
            if (!isNaN(val)) {
              if (!facultyGroups[groupKey].questionTotals[qCol]) {
                facultyGroups[groupKey].questionTotals[qCol] = { sum: 0, count: 0 };
              }
              facultyGroups[groupKey].questionTotals[qCol].sum += val;
              facultyGroups[groupKey].questionTotals[qCol].count += 1;
            }
          });

          // Collect valid comments
          if (remarkCol) {
            const comment = String(row[remarkCol] || '').trim();
            if (isValidComment(comment)) {
              facultyGroups[groupKey].comments.push(comment);
            }
          }
        });

        // Build Excel data
        const excelData: Record<string, unknown>[] = [];
        const shortQuestionNames = questionColumns.map((q, i) => `Q${i + 1}`);

        // Headers for the main data
        const mainHeaders = [
          'S.No', 'Faculty Name', 'School', 'Department', 'Semester', 'Section', 'Course Name', 'Total Responses',
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
            'Total Responses': group.rowCount,
            'Overall Avg': overallAvg.toFixed(1),
            'Comments': formattedComments
          };

          // Add question averages
          questionColumns.forEach((qCol, i) => {
            row[shortQuestionNames[i]] = questionAvgs[i].toFixed(1);
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

        // Calculate total grand responses
        const grandTotalResponses = Object.values(facultyGroups).reduce((sum, group) => sum + group.rowCount, 0);

        // Add summary row
        const summaryRow: Record<string, unknown> = {
          'S.No': '',
          'Faculty Name': 'AVERAGE SUMMARY',
          'School': '',
          'Department': '',
          'Semester': '',
          'Section': '',
          'Course Name': '',
          'Total Responses': grandTotalResponses,
          'Overall Avg': grandOverallAvg.toFixed(1),
          'Comments': ''
        };
        questionColumns.forEach((qCol, i) => {
          summaryRow[shortQuestionNames[i]] = grandQuestionAvgs[i].toFixed(1);
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
        const filterCount = Object.values(filterState).filter((v: any) => v && v.length > 0).length;
        const suffix = filterCount > 0 ? '_filtered' : '_all';
        const fileName = `${activeSheet.name.replace(/\s+/g, '_')}_report${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;

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
              <div className="bg-white border border-indigo-200 shadow mb-1 flex items-center justify-center" style={{ height: '72px', width: '160px', borderRadius: '6px' }}>
                <img src="/image.png" alt="QAA–Insight4Excellence Logo" className="object-contain h-full w-full" style={{ borderRadius: '4px' }} />
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
                {displaySheets.length > 0 ? (
                  displaySheets.map(s => (
                    <div key={s.id} className="flex items-center justify-between border-b border-slate-50 last:border-0">
                      <button
                        onClick={() => setActiveSheet(s)}
                        className={`flex-1 text-left px-4 py-2.5 text-xs font-medium transition ${activeSheet?.id === s.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-indigo-50 hover:text-indigo-600'}`}
                      >
                        {s.name}
                      </button>
                      {!s.isMaster && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSheet(s.id); }}
                          className="px-2 py-2 text-slate-400 hover:text-red-500 transition"
                          title="Remove sheet"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
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
                          {selectedDisplayOptions.map(({ displayName, originalNames, permanent }) => {
                            const isMerged = originalNames.length > 1;
                            return (
                              <div key={displayName} className="flex items-center gap-2 px-2 py-1.5 bg-indigo-50 rounded cursor-pointer transition border-l-2 border-indigo-500">
                                <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    onChange={() => handleMergedOptionChange(displayName, originalNames)}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 flex-shrink-0"
                                  />
                                  <span className="text-sm text-indigo-700 font-medium truncate">{displayName}</span>
                                  {isMerged && (
                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0" title={`Merged: ${originalNames.join(', ')}`}>
                                      +{originalNames.length - 1}
                                    </span>
                                  )}
                                </label>
                                {isMerged && !permanent && (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMakePermanent(category, displayName, originalNames); }}
                                      className="flex items-center gap-0.5 text-[9px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition whitespace-nowrap"
                                      title={`Make Permanent in Google Sheets: ${originalNames.join(', ')}`}
                                      disabled={mergedNamesLoading}
                                    >
                                      <Database className="w-3 h-3 flex-shrink-0" />
                                      <span className="font-medium whitespace-nowrap">Make Permanent</span>
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUnmerge(category, displayName); }}
                                      className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded transition whitespace-nowrap"
                                      title={`Unmerge: ${originalNames.join(', ')}`}
                                      disabled={mergedNamesLoading}
                                    >
                                      <X className="w-3 h-3 flex-shrink-0" />
                                      <span className="font-medium whitespace-nowrap">Unmerge</span>
                                    </button>
                                  </div>
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
                        unselectedDisplayOptions.map(({ displayName, originalNames, permanent }) => {
                          const isMerged = originalNames.length > 1;
                          return (
                            <div key={displayName} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer transition">
                              <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                                <input
                                  type="checkbox"
                                  checked={false}
                                  onChange={() => handleMergedOptionChange(displayName, originalNames)}
                                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 flex-shrink-0"
                                />
                                <span className="text-sm text-slate-600 truncate">{displayName}</span>
                                {isMerged && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0" title={`Merged: ${originalNames.join(', ')}`}>
                                    +{originalNames.length - 1}
                                  </span>
                                )}
                              </label>
                              {isMerged && !permanent && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleMakePermanent(category, displayName, originalNames); }}
                                    className="flex items-center gap-0.5 text-[9px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition whitespace-nowrap"
                                    title={`Make Permanent in Google Sheets: ${originalNames.join(', ')}`}
                                    disabled={mergedNamesLoading}
                                  >
                                    <Database className="w-3 h-3 flex-shrink-0" />
                                    <span className="font-medium whitespace-nowrap">Make Permanent</span>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUnmerge(category, displayName); }}
                                    className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded transition whitespace-nowrap"
                                    title={`Unmerge: ${originalNames.join(', ')}`}
                                    disabled={mergedNamesLoading}
                                  >
                                    <X className="w-3 h-3 flex-shrink-0" />
                                    <span className="font-medium whitespace-nowrap">Unmerge</span>
                                  </button>
                                </div>
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
              onClick={() => forceRefreshData()}
              disabled={!activeSheet || loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Force Refresh Now
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

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => forceRefreshData()}
                      disabled={!activeSheet || loading}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Force Refresh Now
                    </button>

                    <button
                      onClick={() => { setFilterState({}); setFilterSearchQueries({}); }}
                      disabled={activeFilterCount === 0 && Object.keys(filterSearchQueries).length === 0}
                      className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" /> Clear Filters
                    </button>

                    <div className="w-px h-8 bg-slate-200 mx-1 self-center hidden sm:block"></div>

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
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'data'
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
                            <h3 className="font-bold text-emerald-800 text-lg flex items-center gap-3">
                              {facultyAverages.facultyName}
                              <div className="flex items-center gap-0.5 bg-white/60 px-2 py-1 rounded-md border border-emerald-100">
                                {[1, 2, 3, 4, 5].map((star) => {
                                  const roundedAvg = Number(facultyAverages.overallAvg.toFixed(1));
                                  const fill = roundedAvg >= star;
                                  const halfFill = !fill && roundedAvg >= star - 0.5;
                                  if (fill) {
                                    return <Star key={star} className="w-4 h-4 text-amber-400 fill-amber-400" />;
                                  } else if (halfFill) {
                                    return <StarHalf key={star} className="w-4 h-4 text-amber-400 fill-amber-400 md:text-amber-400 md:fill-amber-400" />;
                                  } else {
                                    return <Star key={star} className="w-4 h-4 text-slate-300" />;
                                  }
                                })}
                                <span className="ml-1 text-sm font-bold text-slate-700">
                                  {facultyAverages.overallAvg.toFixed(1)}
                                </span>
                              </div>
                            </h3>
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

                        {/* View Mode Tabs: Details | Graph */}
                        <div className="flex items-center gap-2 mb-4 bg-white/50 p-1 rounded-lg border border-emerald-100 w-fit">
                          <button
                            onClick={() => setScorecardViewMode('details')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${scorecardViewMode === 'details'
                              ? 'bg-emerald-500 text-white shadow-md'
                              : 'text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            <Table className="w-4 h-4" /> Details
                          </button>
                          <button
                            onClick={() => setScorecardViewMode('graph')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${scorecardViewMode === 'graph'
                              ? 'bg-emerald-500 text-white shadow-md'
                              : 'text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            <BarChart3 className="w-4 h-4" /> Graph
                          </button>
                        </div>

                        {/* Details View - Question Scores as cards */}
                        {scorecardViewMode === 'details' && (
                          <div className="space-y-3 mb-4">
                            {facultyAverages.questionScores.map((q, idx) => {
                              const score = q.avg;
                              const color = score >= 4.0 ? 'emerald' : score >= 3.5 ? 'blue' : score >= 3.0 ? 'amber' : 'red';
                              const status = score >= 4.0 ? 'Excellent' : score >= 3.5 ? 'Good' : score >= 3.0 ? 'Average' : 'Needs Improvement';
                              return (
                                <div
                                  key={idx}
                                  className={`bg-white rounded-xl p-4 border-l-4 shadow-sm hover:shadow-md transition-all duration-200 ${
                                    color === 'emerald' ? 'border-l-emerald-500' :
                                    color === 'blue' ? 'border-l-blue-500' :
                                    color === 'amber' ? 'border-l-amber-500' : 'border-l-red-500'
                                  }`}
                                >
                                  <div className="flex items-start gap-4">
                                    {/* Question Number Badge */}
                                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                                      color === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                                      color === 'blue' ? 'bg-blue-100 text-blue-700' :
                                      color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                      {q.name}
                                    </div>
                                    
                                    {/* Question Text */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-slate-700 leading-relaxed">{q.fullName}</p>
                                      <div className="flex items-center gap-3 mt-2">
                                        {/* Progress bar */}
                                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div 
                                            className={`h-full rounded-full transition-all duration-500 ${
                                              color === 'emerald' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                                              color === 'blue' ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                                              color === 'amber' ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-red-400 to-red-600'
                                            }`}
                                            style={{ width: `${(score / 5) * 100}%` }}
                                          />
                                        </div>
                                        {/* Status badge */}
                                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
                                          color === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                                          color === 'blue' ? 'bg-blue-100 text-blue-700' :
                                          color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                          {status}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* Score */}
                                    <div className="flex-shrink-0 text-right">
                                      <p className={`text-3xl font-black ${
                                        color === 'emerald' ? 'text-emerald-600' :
                                        color === 'blue' ? 'text-blue-600' :
                                        color === 'amber' ? 'text-amber-600' : 'text-red-600'
                                      }`}>
                                        {score.toFixed(1)}
                                      </p>
                                      <p className="text-xs text-slate-400">out of 5.0</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Overall Average Card */}
                            <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-xl p-5 shadow-lg">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wide">Overall Average</p>
                                  <div className="flex items-end gap-2 mt-1">
                                    <span className="text-4xl font-black text-white">{facultyAverages.overallAvg.toFixed(1)}</span>
                                    <span className="text-emerald-200 text-lg mb-1">/5.0</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-emerald-100 text-sm">
                                    {facultyAverages.overallAvg >= 4.5 ? '🌟 Outstanding!' :
                                     facultyAverages.overallAvg >= 4.0 ? '✨ Excellent!' :
                                     facultyAverages.overallAvg >= 3.5 ? '👍 Good' :
                                     facultyAverages.overallAvg >= 3.0 ? '📈 Average' :
                                     '⚠️ Needs Improvement'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Graph View - Beautiful charts */}
                        {scorecardViewMode === 'graph' && (
                          <div className="space-y-6 mb-4">
                            {/* Charts Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Bar Chart - Per Question Scores */}
                              <div className="bg-white rounded-xl p-5 border border-emerald-100 shadow-lg">
                                <h4 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                                  <BarChart3 className="w-4 h-4" /> Per-Question Performance
                                </h4>
                                <div className="h-72">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                      data={facultyAverages.questionScores.map(q => ({
                                        name: q.name,
                                        fullName: q.fullName,
                                        score: q.avg
                                      }))}
                                      margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                                    >
                                      <defs>
                                        <linearGradient id="barGradientGreen" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                                          <stop offset="100%" stopColor="#059669" stopOpacity={0.8}/>
                                        </linearGradient>
                                        <linearGradient id="barGradientBlue" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.8}/>
                                        </linearGradient>
                                        <linearGradient id="barGradientAmber" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                                          <stop offset="100%" stopColor="#d97706" stopOpacity={0.8}/>
                                        </linearGradient>
                                        <linearGradient id="barGradientRed" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                                          <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8}/>
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                      <XAxis 
                                        dataKey="name" 
                                        tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
                                        axisLine={{ stroke: '#e5e7eb' }}
                                        tickLine={false}
                                      />
                                      <YAxis 
                                        domain={[0, 5]} 
                                        tick={{ fontSize: 11, fill: '#6b7280' }}
                                        axisLine={false}
                                        tickLine={false}
                                        ticks={[0, 1, 2, 3, 4, 5]}
                                      />
                                      <Tooltip
                                        cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
                                        content={({ active, payload }) => {
                                          if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            const score = data.score;
                                            const color = score >= 4.0 ? '#10b981' : score >= 3.5 ? '#3b82f6' : score >= 3.0 ? '#f59e0b' : '#ef4444';
                                            const status = score >= 4.0 ? 'Excellent' : score >= 3.5 ? 'Good' : score >= 3.0 ? 'Average' : 'Needs Improvement';
                                            return (
                                              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-4 max-w-xs">
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                                                  <span className="font-bold text-slate-800">{data.name}</span>
                                                  <span className="ml-auto text-lg font-black" style={{ color }}>{score.toFixed(1)}</span>
                                                </div>
                                                <p className="text-xs text-slate-600 leading-relaxed mb-2">{data.fullName}</p>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>{status}</span>
                                                </div>
                                              </div>
                                            );
                                          }
                                          return null;
                                        }}
                                      />
                                      <Bar dataKey="score" radius={[8, 8, 0, 0]} maxBarSize={60}>
                                        {facultyAverages.questionScores.map((q, index) => (
                                          <Cell
                                            key={`cell-${index}`}
                                            fill={q.avg >= 4.0 ? 'url(#barGradientGreen)' : q.avg >= 3.5 ? 'url(#barGradientBlue)' : q.avg >= 3.0 ? 'url(#barGradientAmber)' : 'url(#barGradientRed)'}
                                          />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                {/* Legend */}
                                <div className="flex items-center justify-center gap-4 mt-3 text-xs">
                                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> ≥4.0 Excellent</span>
                                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> ≥3.5 Good</span>
                                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-500"></div> ≥3.0 Average</span>
                                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> &lt;3.0 Low</span>
                                </div>
                              </div>

                              {/* Radar Chart - Visual Performance Spider */}
                              <div className="bg-white rounded-xl p-5 border border-emerald-100 shadow-lg">
                                <h4 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                                  <Award className="w-4 h-4" /> Performance Radar
                                </h4>
                                <div className="h-72">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart
                                      data={facultyAverages.questionScores.map(q => ({
                                        question: q.name,
                                        fullName: q.fullName,
                                        score: q.avg,
                                        fullMark: 5
                                      }))}
                                    >
                                      <defs>
                                        <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.8}/>
                                          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.3}/>
                                        </linearGradient>
                                      </defs>
                                      <PolarGrid stroke="#d1d5db" strokeDasharray="3 3" />
                                      <PolarAngleAxis 
                                        dataKey="question" 
                                        tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
                                      />
                                      <PolarRadiusAxis 
                                        angle={90} 
                                        domain={[0, 5]} 
                                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                                        axisLine={false}
                                      />
                                      <Radar
                                        name="Score"
                                        dataKey="score"
                                        stroke="#10b981"
                                        fill="url(#radarGradient)"
                                        fillOpacity={0.6}
                                        strokeWidth={3}
                                        dot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                                      />
                                      <Tooltip
                                        content={({ active, payload }) => {
                                          if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            const score = data.score;
                                            const color = score >= 4.0 ? '#10b981' : score >= 3.5 ? '#3b82f6' : score >= 3.0 ? '#f59e0b' : '#ef4444';
                                            return (
                                              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-4 max-w-xs">
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                                                  <span className="font-bold text-slate-800">{data.question}</span>
                                                  <span className="ml-auto text-lg font-black" style={{ color }}>{score.toFixed(1)}</span>
                                                </div>
                                                <p className="text-xs text-slate-600 leading-relaxed">{data.fullName}</p>
                                              </div>
                                            );
                                          }
                                          return null;
                                        }}
                                      />
                                    </RadarChart>
                                  </ResponsiveContainer>
                                </div>
                                <p className="text-center text-xs text-slate-500 mt-2">Hover over points to see question details</p>
                              </div>
                            </div>

                            {/* Overall Score Gauge / Summary Card */}
                            <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-xl p-6 shadow-lg">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-emerald-100 text-sm font-semibold uppercase tracking-wide mb-1">Overall Performance</h4>
                                  <div className="flex items-end gap-2">
                                    <span className="text-5xl font-black text-white">{facultyAverages.overallAvg.toFixed(1)}</span>
                                    <span className="text-emerald-200 text-xl mb-2">/5.0</span>
                                  </div>
                                  <p className="text-emerald-100 text-sm mt-2">
                                    {facultyAverages.overallAvg >= 4.5 ? '🌟 Outstanding Performance!' :
                                     facultyAverages.overallAvg >= 4.0 ? '✨ Excellent Performance!' :
                                     facultyAverages.overallAvg >= 3.5 ? '👍 Good Performance' :
                                     facultyAverages.overallAvg >= 3.0 ? '📈 Average Performance' :
                                     '⚠️ Needs Improvement'}
                                  </p>
                                </div>
                                {/* Mini stats */}
                                <div className="grid grid-cols-2 gap-4 text-center">
                                  <div className="bg-white/20 rounded-lg px-4 py-3 backdrop-blur-sm">
                                    <p className="text-white text-2xl font-bold">
                                      {Math.max(...facultyAverages.questionScores.map(q => q.avg)).toFixed(1)}
                                    </p>
                                    <p className="text-emerald-100 text-xs uppercase tracking-wide">Best Score</p>
                                  </div>
                                  <div className="bg-white/20 rounded-lg px-4 py-3 backdrop-blur-sm">
                                    <p className="text-white text-2xl font-bold">
                                      {Math.min(...facultyAverages.questionScores.map(q => q.avg)).toFixed(1)}
                                    </p>
                                    <p className="text-emerald-100 text-xs uppercase tracking-wide">Lowest Score</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

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
                                      <span className="text-sm font-bold text-slate-900">{q.score.toFixed(1)}</span>
                                      <span className="text-xs text-slate-400">/5.0</span>
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
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !mergeProgress.isProcessing && setShowMergeModal(false)}></div>
          <div className="relative bg-white w-full max-w-md max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in duration-300">
            {!mergeProgress.isProcessing && (
              <button onClick={() => setShowMergeModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition z-10">
                <X className="w-5 h-5" />
              </button>
            )}
            
            {/* Progress Overlay */}
            {mergeProgress.isProcessing && (
              <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center rounded-2xl">
                <div className="text-center px-6">
                  {mergeProgress.step === 'complete' ? (
                    <CheckCircle className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
                  ) : (
                    <Loader2 className="w-16 h-16 mx-auto text-indigo-600 animate-spin mb-4" />
                  )}
                  <h3 className="text-lg font-bold text-slate-800 mb-2">
                    {mergeProgress.step === 'confirming' && 'Preparing Merge...'}
                    {mergeProgress.step === 'updating-sheet' && 'Updating Google Sheets...'}
                    {mergeProgress.step === 'refreshing' && 'Refreshing Dashboard...'}
                    {mergeProgress.step === 'complete' && 'Merge Complete!'}
                  </h3>
                  <p className="text-sm text-slate-500">{mergeProgress.message}</p>
                  
                  {/* Progress steps indicator */}
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <div className={`w-3 h-3 rounded-full ${mergeProgress.step === 'confirming' ? 'bg-indigo-600 animate-pulse' : 'bg-emerald-500'}`} />
                    <div className={`w-8 h-0.5 ${mergeProgress.step !== 'confirming' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`w-3 h-3 rounded-full ${mergeProgress.step === 'updating-sheet' ? 'bg-indigo-600 animate-pulse' : mergeProgress.step === 'refreshing' || mergeProgress.step === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`w-8 h-0.5 ${mergeProgress.step === 'refreshing' || mergeProgress.step === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`w-3 h-3 rounded-full ${mergeProgress.step === 'refreshing' ? 'bg-indigo-600 animate-pulse' : mergeProgress.step === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`w-8 h-0.5 ${mergeProgress.step === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`w-3 h-3 rounded-full ${mergeProgress.step === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-2">
                    <span>Save</span>
                    <span>Update Sheet</span>
                    <span>Refresh</span>
                    <span>Done</span>
                  </div>
                </div>
              </div>
            )}
            
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
                {/* PERMANENT WARNING */}
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-800 mb-1">This action is PERMANENT</p>
                      <p className="text-xs text-red-700 leading-relaxed">
                        Once merged, these names <strong>cannot be unmerged or reverted</strong>. 
                        The original data in your Google Sheets will be permanently changed.
                        Make sure you want to merge all these names before proceeding.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Names being merged - full list */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Names that will be merged ({mergeSelectedNames.length})
                  </label>
                  <div className="bg-slate-50 rounded-lg p-3 max-h-40 overflow-y-auto border border-slate-200">
                    {mergeSelectedNames.map((name, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm text-slate-600 py-1.5 border-b border-slate-100 last:border-0 group">
                        <span className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center text-[10px] text-slate-500 font-bold">
                            {idx + 1}
                          </span>
                          {name}
                        </span>
                        <div className="flex items-center gap-2">
                          {name === mergeCanonicalName && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">
                              DISPLAY NAME
                            </span>
                          )}
                          {mergeSelectedNames.length > 2 && (
                            <button
                              onClick={() => {
                                const newNames = mergeSelectedNames.filter((_, i) => i !== idx);
                                setMergeSelectedNames(newNames);
                                // If removing the canonical name, switch to first remaining name
                                if (name === mergeCanonicalName && newNames.length > 0) {
                                  setMergeCanonicalName(newNames[0]);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-600 text-[10px] font-bold rounded transition flex items-center gap-1"
                              title="Remove from merge"
                            >
                              <X className="w-3 h-3" />
                              Remove
                            </button>
                          )}
                        </div>
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

                {/* Summary of what will happen */}
                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 mb-2">What will happen:</p>
                  <ul className="text-xs text-slate-600 space-y-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      All {mergeSelectedNames.length} names will display as "<strong>{mergeCanonicalName || '...'}</strong>"
                    </li>
                    {updateOriginalData && (
                      <li className="flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        Google Sheets will be <strong>permanently modified</strong>
                      </li>
                    )}
                    <li className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      This change <strong>cannot be undone</strong>
                    </li>
                  </ul>
                </div>

                <label className="flex items-start gap-2 cursor-pointer p-3 bg-slate-50 rounded-lg border-2 border-slate-200 hover:border-slate-300 transition">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={updateOriginalData}
                    onChange={(e) => setUpdateOriginalData(e.target.checked)}
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    <strong>Update Google Sheets:</strong> Replace all variant names with "{mergeCanonicalName || '...'}" in the original spreadsheet data.
                  </span>
                </label>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="p-4 border-t border-slate-100 flex-shrink-0">
              <p className="text-[10px] text-center text-slate-400 mb-3">
                By clicking "Confirm Merge", you acknowledge that this action is permanent and cannot be reversed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowMergeModal(false)}
                  disabled={mergeProgress.isProcessing}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMerge}
                  disabled={!mergeCanonicalName || mergeProgress.isProcessing}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg shadow-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {mergeProgress.isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Confirm Merge (Permanent)'
                  )}
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
