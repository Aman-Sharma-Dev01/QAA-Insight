
export interface UserSheet {
  sheetId: string;
  name: string;
  url: string;
  addedAt: string;
  lastAccessed: string;
}

export interface UserSettings {
  defaultSheetId: string | null;
  theme: 'light' | 'dark' | 'system';
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  sheets: UserSheet[];
  settings: UserSettings;
  lastLogin: string | null;
  createdAt: string;
}

// ============== Faculty Feedback Specific Types ==============

export interface FeedbackEntry {
  timestamp: string;
  schoolName: string;
  department: string;
  semester: string;
  classSection: string;
  facultyName: string;
  courseName: string;
  ratings: number[];  // Array of ratings Q1-Q7 (1-5 scale)
  specialRemarks?: string;
}

export interface FacultyScorecard {
  facultyName: string;
  department: string;
  coursesHandled: string[];
  sectionsHandled: string[];
  totalFeedbacks: number;
  overallScore: number;
  parameterScores: ParameterScore[];
  sectionWiseScores: SectionScore[];
  courseWiseScores: CourseScore[];
  rating: 'Excellent' | 'Very Good' | 'Good' | 'Satisfactory' | 'Needs Improvement';
  rank?: number;
}

export interface ParameterScore {
  parameter: string;
  description: string;
  averageScore: number;
  responseCount: number;
  distribution: RatingDistribution;
}

export interface RatingDistribution {
  '5': number;
  '4': number;
  '3': number;
  '2': number;
  '1': number;
}

export interface SectionScore {
  section: string;
  semester: string;
  course: string;
  averageScore: number;
  feedbackCount: number;
}

export interface CourseScore {
  courseName: string;
  averageScore: number;
  feedbackCount: number;
  sections: string[];
}

export interface DepartmentAnalytics {
  departmentName: string;
  totalFaculty: number;
  totalFeedbacks: number;
  averageScore: number;
  facultyScores: FacultyScore[];
  courseWiseAnalysis: CourseAnalysis[];
  sectionWiseAnalysis: SectionAnalysis[];
}

export interface CourseAnalysis {
  courseName: string;
  facultyComparison: {
    facultyName: string;
    section: string;
    averageScore: number;
    feedbackCount: number;
  }[];
}

export interface SectionAnalysis {
  semester: string;
  section: string;
  averageScore: number;
  facultyPerformance: {
    facultyName: string;
    course: string;
    score: number;
  }[];
}

export interface ComparativeAnalytics {
  facultyComparison: FacultyComparisonItem[];
  sectionComparison: SectionComparisonItem[];
  courseComparison: CourseComparisonItem[];
  semesterTrends: SemesterTrend[];
}

export interface FacultyComparisonItem {
  facultyName: string;
  department: string;
  overallScore: number;
  feedbackCount: number;
  parametersAboveAverage: number;
  rank: number;
}

export interface SectionComparisonItem {
  section: string;
  semester: string;
  averageScore: number;
  totalFeedbacks: number;
  topFaculty: string;
  topFacultyScore: number;
}

export interface CourseComparisonItem {
  courseName: string;
  averageScore: number;
  totalFeedbacks: number;
  facultyCount: number;
  bestPerformer: string;
  bestPerformerScore: number;
}

export interface SemesterTrend {
  semester: string;
  averageScore: number;
  totalFeedbacks: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface SheetSource {
  id: string;
  name: string;
  url: string;
  dateAdded: string;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface DynamicFilters {
  [key: string]: string[];
}

export interface FilterState {
  [key: string]: string[];
}

export interface QuestionScore {
  question: string;
  score: number;
  distribution: { [key: string]: number };
  validResponses?: number;
}

export interface DepartmentScore {
  name: string;
  score: number;
  count: number;
}

export interface TimeTrend {
  label: string;
  value: number;
}

export interface FacultyScore {
  name: string;
  score: number;
  feedbackCount?: number;
  coursesHandled?: string[];
  sectionsHandled?: string[];
  rank?: number;
  rating?: string;
}

export interface AggregatedData {
  totalResponses: number;
  averageRating: number;
  questionScores: QuestionScore[];
  departmentWise: DepartmentScore[];
  timeTrends: TimeTrend[];
  facultyScores: FacultyScore[];
  // Faculty Feedback Specific Analytics
  sectionWise?: SectionScore[];
  courseWise?: CourseScore[];
  semesterWise?: { semester: string; score: number; count: number }[];
  parameterDescriptions?: { [key: string]: string };
  comparativeData?: ComparativeAnalytics;
  topPerformers?: FacultyScore[];
  needsImprovement?: FacultyScore[];
  overallStats?: {
    totalFaculty: number;
    totalCourses: number;
    totalSections: number;
    averageByParameter: ParameterScore[];
  };
}

export interface SheetMetadata {
  headers: string[];
  filters: DynamicFilters;
  totalRows: number;
}

export interface FilteredDataRow {
  [key: string]: string | number;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export interface FilteredDataResponse {
  headers: string[];
  data: FilteredDataRow[];
  pagination: PaginationInfo;
}

export interface ExportDataResponse {
  headers: string[];
  data: FilteredDataRow[];
  totalRows: number;
}

/**
 * Response from check-updates endpoint for smart refresh
 */
export interface UpdateCheckResponse {
  hasChanged: boolean;
  delta: number;
  currentCount: number;
  cachedCount: number;
  shouldInstantRefresh: boolean;
  error?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
