
export const LIKERT_MAPPING: { [key: string]: number } = {
  'Strongly Agree': 5,
  'Agree': 4,
  'Neutral': 3,
  'Disagree': 2,
  'Strongly Disagree': 1,
  'Excellent': 5,
  'Very Good': 4,
  'Good': 3,
  'Satisfactory': 2,
  'Poor': 1,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
  '1': 1
};

// Rating thresholds for faculty scorecard
export const RATING_THRESHOLDS = {
  EXCELLENT: 4.5,
  VERY_GOOD: 4.0,
  GOOD: 3.5,
  SATISFACTORY: 3.0,
  NEEDS_IMPROVEMENT: 0
};

export const getRatingLabel = (score: number): string => {
  if (score >= RATING_THRESHOLDS.EXCELLENT) return 'Excellent';
  if (score >= RATING_THRESHOLDS.VERY_GOOD) return 'Very Good';
  if (score >= RATING_THRESHOLDS.GOOD) return 'Good';
  if (score >= RATING_THRESHOLDS.SATISFACTORY) return 'Satisfactory';
  return 'Needs Improvement';
};

export const getRatingColor = (score: number): string => {
  if (score >= RATING_THRESHOLDS.EXCELLENT) return 'text-emerald-600 bg-emerald-100';
  if (score >= RATING_THRESHOLDS.VERY_GOOD) return 'text-green-600 bg-green-100';
  if (score >= RATING_THRESHOLDS.GOOD) return 'text-blue-600 bg-blue-100';
  if (score >= RATING_THRESHOLDS.SATISFACTORY) return 'text-amber-600 bg-amber-100';
  return 'text-red-600 bg-red-100';
};

// Feedback parameter descriptions based on typical faculty feedback forms
export const FEEDBACK_PARAMETERS: { [key: string]: string } = {
  'Class starts and ends on time': 'Punctuality - Faculty adheres to scheduled class timings',
  'sufficient time is allotted': 'Time Management - Adequate time allocation for course content',
  'Faculty is well prepared': 'Preparedness - Level of faculty preparation for classes',
  'confident, and demonstrates': 'Content Delivery - Confidence and clarity in delivering content',
  'Content is delivered clearly': 'Clarity - Content is delivered clearly and confidently',
  'Faculty uses respectful': 'Communication - Use of respectful, clear, and simple language',
  'Faculty encourages questions': 'Engagement - Encouragement of questions, discussions, and participation',
  'Feedback provided': 'Feedback - Quality of feedback provided on assignments/projects'
};

// Column name mappings for standardization
export const COLUMN_MAPPINGS: { [key: string]: string } = {
  'Timestamp': 'timestamp',
  'School Name': 'schoolName',
  'Department': 'department',
  'Semester': 'semester',
  'Class Section': 'classSection',
  'Class/Section': 'classSection',
  'Name of Faculty': 'facultyName',
  'Faculty Name': 'facultyName',
  'Course Name': 'courseName',
  'Subject': 'courseName',
  'Special Remarks': 'specialRemarks',
  'Remarks': 'specialRemarks'
};

// Backend API URL - Change this based on your deployment
// For local development with Node.js backend:
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// For Google Apps Script deployment (uncomment and use if not using Node.js backend):
// export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
