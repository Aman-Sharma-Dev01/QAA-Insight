import * as React from 'react';
import { FilteredDataRow, PaginationInfo } from '../types';
import { ChevronLeft, ChevronRight, Download, Table, Calculator, X, TrendingUp, FileSpreadsheet, Check, FileText } from 'lucide-react';

interface QuestionAverage {
  question: string;
  average: number;
  count: number;
  total: number;
}

interface FilteredDataTableProps {
  headers: string[];
  data: FilteredDataRow[];
  pagination: PaginationInfo;
  loading: boolean;
  onPageChange: (page: number) => void;
  onExportCSV: (includeAverages: boolean, averages: QuestionAverage[], overallAverage: number) => void;
  onExportAverageExcel?: (averages: QuestionAverage[], overallAverage: number) => void;
  exporting: boolean;
  fetchAllData?: () => Promise<FilteredDataRow[]>; // Function to fetch all filtered data
}

const FilteredDataTable: React.FC<FilteredDataTableProps> = ({
  headers,
  data,
  pagination,
  loading,
  onPageChange,
  onExportCSV,
  onExportAverageExcel,
  exporting,
  fetchAllData
}) => {
  const [showAverages, setShowAverages] = React.useState(false);
  const [averages, setAverages] = React.useState<QuestionAverage[]>([]);
  const [overallAverage, setOverallAverage] = React.useState<number>(0);
  const [calculatingAverages, setCalculatingAverages] = React.useState(false);
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [exportAveragesCalculating, setExportAveragesCalculating] = React.useState(false);

  // Handle export with options
  const handleExportClick = () => {
    setShowExportModal(true);
  };

  const handleExportConfirm = async () => {
    let exportAverages = averages;
    let exportOverallAverage = overallAverage;

    if (averages.length === 0) {
      // Calculate averages first if not already calculated
      setExportAveragesCalculating(true);
      const result = await calculateAveragesInternal();
      if (result) {
        exportAverages = result.questionAverages;
        exportOverallAverage = result.totalAvg;
      }
      setExportAveragesCalculating(false);
    }
    setShowExportModal(false);

    // Always use Excel export which combines summary + raw data
    if (onExportAverageExcel) {
      onExportAverageExcel(exportAverages, exportOverallAverage);
    } else {
      // Fallback to CSV if Excel export not available
      onExportCSV(true, exportAverages, exportOverallAverage);
    }
  };

  // Internal calculate averages (shared between button and export)
  const calculateAveragesInternal = async () => {
    try {
      const dataToAnalyze = fetchAllData ? await fetchAllData() : data;

      if (dataToAnalyze.length === 0) return;

      const questionAverages: QuestionAverage[] = [];

      headers.forEach(header => {
        const headerLower = header.toLowerCase().trim();

        // Skip short columns (likely identifiers, not questions)
        if (header.trim().length < 15) {
          return;
        }

        // Skip metadata columns by exact match or pattern
        const metadataPatterns = [
          'timestamp', 'email', 'school name', 'department', 'semester',
          'class-section', 'name of faculty', 'course name', 'special remark'
        ];

        const isMetadata = metadataPatterns.some(pattern =>
          headerLower === pattern ||
          headerLower.startsWith(pattern) ||
          (headerLower.includes('remark') && headerLower.includes('special'))
        );

        if (isMetadata) {
          return;
        }

        let sum = 0;
        let count = 0;

        dataToAnalyze.forEach(row => {
          const value = row[header];
          const numValue = parseFloat(String(value));

          if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
            sum += numValue;
            count++;
          }
        });

        if (count > 0) {
          questionAverages.push({
            question: header,
            average: sum / count,
            count,
            total: dataToAnalyze.length
          });
        }
      });

      let totalAvg = 0;
      if (questionAverages.length > 0) {
        totalAvg = questionAverages.reduce((sum, q) => sum + q.average, 0) / questionAverages.length;
        setOverallAverage(totalAvg);
      }

      setAverages(questionAverages);
      return { questionAverages, totalAvg };
    } catch (error) {
      console.error('Error calculating averages:', error);
      return null;
    }
  };

  // Calculate averages for all question columns
  const calculateAverages = async () => {
    setCalculatingAverages(true);

    try {
      // Fetch all filtered data if available, otherwise use current page data
      const dataToAnalyze = fetchAllData ? await fetchAllData() : data;

      if (dataToAnalyze.length === 0) {
        setCalculatingAverages(false);
        return;
      }

      const questionAverages: QuestionAverage[] = [];

      // Identify question columns (columns with numeric ratings)
      headers.forEach(header => {
        const headerLower = header.toLowerCase().trim();

        // Skip short columns (likely identifiers, not questions)
        if (header.trim().length < 15) {
          return;
        }

        // Skip metadata columns by exact match or pattern
        const metadataPatterns = [
          'timestamp', 'email', 'school name', 'department', 'semester',
          'class-section', 'name of faculty', 'course name', 'special remark'
        ];

        const isMetadata = metadataPatterns.some(pattern =>
          headerLower === pattern ||
          headerLower.startsWith(pattern) ||
          (headerLower.includes('remark') && headerLower.includes('special'))
        );

        if (isMetadata) {
          return;
        }

        // Check if this column has numeric values (1-5 ratings)
        let sum = 0;
        let count = 0;

        dataToAnalyze.forEach(row => {
          const value = row[header];
          const numValue = parseFloat(String(value));

          if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
            sum += numValue;
            count++;
          }
        });

        // Only include if we found numeric values
        if (count > 0) {
          questionAverages.push({
            question: header,
            average: sum / count,
            count,
            total: dataToAnalyze.length
          });
        }
      });

      // Calculate overall average (average of all question averages)
      if (questionAverages.length > 0) {
        const totalAvg = questionAverages.reduce((sum, q) => sum + q.average, 0) / questionAverages.length;
        setOverallAverage(totalAvg);
      }

      setAverages(questionAverages);
      setShowAverages(true);
    } finally {
      setCalculatingAverages(false);
    }
  };

  // Get color based on rating
  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return 'text-emerald-600 bg-emerald-50';
    if (rating >= 4.0) return 'text-green-600 bg-green-50';
    if (rating >= 3.5) return 'text-lime-600 bg-lime-50';
    if (rating >= 3.0) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getRatingLabel = (rating: number) => {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 4.0) return 'Very Good';
    if (rating >= 3.5) return 'Good';
    if (rating >= 3.0) return 'Satisfactory';
    return 'Needs Improvement';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3"></div>
          <span className="text-slate-600">Loading filtered data...</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Table className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Data Found</h3>
        <p className="text-slate-500 text-sm">No records match the current filters.</p>
      </div>
    );
  }

  // Show all columns - no limit
  const displayHeaders = headers;

  return (
    <>
      {/* Averages Modal */}
      {showAverages && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Calculator className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Question Averages</h2>
                  <p className="text-indigo-100 text-sm">Based on {pagination.totalRows} filtered responses</p>
                </div>
              </div>
              <button
                onClick={() => setShowAverages(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Overall Average */}
            <div className="p-6 bg-gradient-to-r from-slate-50 to-indigo-50 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Overall Average</p>
                    <p className="text-xs text-slate-400">Average of all question averages</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-4xl font-bold ${getRatingColor(overallAverage).split(' ')[0]}`}>
                    {overallAverage.toFixed(1)}
                  </p>
                  <p className={`text-sm font-medium ${getRatingColor(overallAverage).split(' ')[0]}`}>
                    {getRatingLabel(overallAverage)}
                  </p>
                </div>
              </div>
            </div>

            {/* Question Averages List */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              <div className="space-y-3">
                {averages.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition">
                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate" title={item.question}>
                        {item.question}
                      </p>
                      <p className="text-xs text-slate-400">{item.count} responses</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.average >= 4 ? 'bg-emerald-500' : item.average >= 3 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${(item.average / 5) * 100}%` }}
                        />
                      </div>
                      <span className={`text-lg font-bold px-2 py-1 rounded ${getRatingColor(item.average)}`}>
                        {item.average.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowAverages(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Table className="w-5 h-5 text-indigo-600" />
              Filtered Data
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Showing {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.totalRows)} of {pagination.totalRows.toLocaleString()} records
              <span className="text-indigo-600 ml-2">({headers.length} columns)</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={calculateAverages}
              disabled={calculatingAverages}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {calculatingAverages ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Calculator className="w-4 h-4" />
              )}
              {calculatingAverages ? 'Calculating...' : 'Calculate Averages'}
            </button>
            <button
              onClick={handleExportClick}
              disabled={exporting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting ? 'Exporting...' : 'Export Filtered CSV'}
            </button>
          </div>
        </div>

        {/* Export Options Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg font-bold text-white">Export Report</h2>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 mb-2">
                  Export {pagination.totalRows.toLocaleString()} filtered records.
                </p>

                {/* Export Description */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-700">Complete Excel Report</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Your export will include 3 sheets:
                      </p>
                      <ul className="text-xs text-slate-600 mt-2 space-y-1">
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span><strong>Faculty Averages</strong> - Summary with question averages & comments</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span><strong>Question Legend</strong> - Full question text for each Q code</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span><strong>Raw Data</strong> - All {pagination.totalRows.toLocaleString()} filtered records</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExportConfirm}
                  disabled={exportAveragesCalculating}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
                >
                  {exportAveragesCalculating ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {exportAveragesCalculating ? 'Preparing...' : 'Export Excel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-max">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <th className="px-4 py-3 text-center w-12">#</th>
                {displayHeaders.map((header, idx) => (
                  <th key={idx} className="px-4 py-3 max-w-xs truncate" title={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-center text-xs text-slate-400">
                    {((pagination.page - 1) * pagination.pageSize) + rowIdx + 1}
                  </td>
                  {displayHeaders.map((header, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate"
                      title={String(row[header] || '')}
                    >
                      {String(row[header] || '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              {/* Page numbers */}
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1;
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.page - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => onPageChange(pageNum)}
                      className={`w-8 h-8 text-sm font-medium rounded-lg transition ${pageNum === pagination.page
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default FilteredDataTable;
