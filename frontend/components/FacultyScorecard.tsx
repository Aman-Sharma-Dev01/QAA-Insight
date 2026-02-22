import * as React from 'react';
import { FacultyScore, AggregatedData } from '../types';
import { getRatingLabel, getRatingColor } from '../constants';
import { User, Award, TrendingUp, TrendingDown, Star, BookOpen, Users, BarChart2, ChevronDown, ChevronUp, Search, FileText, Download } from 'lucide-react';

interface FacultyScorecardProps {
  data: AggregatedData;
  searchQuery?: string;
  onFacultySelect?: (facultyName: string) => void;
}

const FacultyScorecard: React.FC<FacultyScorecardProps> = ({ data, searchQuery = '', onFacultySelect }) => {
  const [expandedFaculty, setExpandedFaculty] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<'score' | 'name' | 'feedbacks'>('score');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');

  if (!data.facultyScores || data.facultyScores.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Faculty Data Available</h3>
        <p className="text-slate-500 text-sm">Faculty scorecards will appear here once feedback data is loaded.</p>
      </div>
    );
  }

  // Filter and sort faculty
  const filteredFaculty = data.facultyScores
    .filter(faculty =>
      faculty.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (faculty.coursesHandled || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'feedbacks':
          comparison = (a.feedbackCount || 0) - (b.feedbackCount || 0);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  // Assign ranks based on score
  const rankedFaculty = filteredFaculty.map((faculty, index) => ({
    ...faculty,
    rank: sortBy === 'score' ? (sortOrder === 'desc' ? index + 1 : filteredFaculty.length - index) : faculty.rank
  }));

  const handleSort = (field: 'score' | 'name' | 'feedbacks') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const toggleExpand = (facultyName: string) => {
    setExpandedFaculty(expandedFaculty === facultyName ? null : facultyName);
  };

  const getRankBadge = (rank: number | undefined) => {
    if (!rank) return null;
    if (rank === 1) return <span className="px-2 py-0.5 bg-amber-400 text-amber-900 text-xs font-bold rounded-full flex items-center gap-1"><Award className="w-3 h-3" />1st</span>;
    if (rank === 2) return <span className="px-2 py-0.5 bg-slate-300 text-slate-700 text-xs font-bold rounded-full">2nd</span>;
    if (rank === 3) return <span className="px-2 py-0.5 bg-amber-600 text-white text-xs font-bold rounded-full">3rd</span>;
    return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded">{rank}th</span>;
  };

  const getScoreBar = (score: number) => {
    const percentage = (score / 5) * 100;
    let bgColor = 'bg-red-500';
    if (score >= 4.5) bgColor = 'bg-emerald-500';
    else if (score >= 4.0) bgColor = 'bg-green-500';
    else if (score >= 3.5) bgColor = 'bg-blue-500';
    else if (score >= 3.0) bgColor = 'bg-amber-500';

    return (
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${bgColor} transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
              <Award className="w-5 h-5 text-indigo-600" />
              Faculty Performance Scorecard
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Comprehensive performance analysis for {rankedFaculty.length} faculty members
            </p>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Sort by:</span>
            <button
              onClick={() => handleSort('score')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${sortBy === 'score' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              Score {sortBy === 'score' && (sortOrder === 'desc' ? '↓' : '↑')}
            </button>
            <button
              onClick={() => handleSort('name')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${sortBy === 'name' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              Name {sortBy === 'name' && (sortOrder === 'desc' ? '↓' : '↑')}
            </button>
            <button
              onClick={() => handleSort('feedbacks')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${sortBy === 'feedbacks' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              Feedbacks {sortBy === 'feedbacks' && (sortOrder === 'desc' ? '↓' : '↑')}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 bg-slate-50 border-b border-slate-100">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-800">{rankedFaculty.length}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Faculty</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {rankedFaculty.filter(f => f.score >= 4.0).length}
          </p>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Above 4.0</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600">
            {rankedFaculty.filter(f => f.score >= 3.0 && f.score < 4.0).length}
          </p>
          <p className="text-xs text-slate-500 uppercase tracking-wide">3.0 - 4.0</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">
            {rankedFaculty.filter(f => f.score < 3.0).length}
          </p>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Below 3.0</p>
        </div>
      </div>

      {/* Faculty List */}
      <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
        {rankedFaculty.map((faculty, index) => (
          <div
            key={faculty.name}
            className={`transition-all duration-200 ${expandedFaculty === faculty.name ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
          >
            {/* Main Row */}
            <div
              className="flex items-center gap-4 p-4 cursor-pointer"
              onClick={() => toggleExpand(faculty.name)}
            >
              {/* Rank */}
              <div className="w-16 flex-shrink-0 text-center">
                {getRankBadge(faculty.rank || index + 1)}
              </div>

              {/* Faculty Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-slate-800 truncate">{faculty.name}</h4>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${getRatingColor(faculty.score)}`}>
                    {getRatingLabel(faculty.score)}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {faculty.feedbackCount || 0} feedbacks
                  </span>
                  {faculty.coursesHandled && faculty.coursesHandled.length > 0 && (
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {faculty.coursesHandled.length} course(s)
                    </span>
                  )}
                  {faculty.sectionsHandled && faculty.sectionsHandled.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {faculty.sectionsHandled.length} section(s)
                    </span>
                  )}
                </div>
              </div>

              {/* Score */}
              <div className="w-32 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xl font-bold text-slate-800">{faculty.score.toFixed(1)}</span>
                  <span className="text-xs text-slate-400">/5.0</span>
                </div>
                {getScoreBar(faculty.score)}
              </div>

              {/* Expand Icon */}
              <div className="flex-shrink-0">
                {expandedFaculty === faculty.name ?
                  <ChevronUp className="w-5 h-5 text-slate-400" /> :
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                }
              </div>
            </div>

            {/* Expanded Details */}
            {expandedFaculty === faculty.name && (
              <div className="px-4 pb-4 animate-in slide-in-from-top duration-200">
                <div className="ml-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Courses */}
                  {faculty.coursesHandled && faculty.coursesHandled.length > 0 && (
                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> Courses Handled
                      </h5>
                      <div className="space-y-1">
                        {faculty.coursesHandled.map((course, i) => (
                          <p key={i} className="text-sm text-slate-700">{course}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sections */}
                  {faculty.sectionsHandled && faculty.sectionsHandled.length > 0 && (
                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Sections
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {faculty.sectionsHandled.map((section, i) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Stats */}
                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <BarChart2 className="w-3 h-3" /> Performance Summary
                    </h5>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Overall Score</span>
                        <span className="font-semibold text-slate-800">{faculty.score.toFixed(1)}/5.0</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total Feedbacks</span>
                        <span className="font-semibold text-slate-800">{faculty.feedbackCount || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Rank</span>
                        <span className="font-semibold text-slate-800">#{faculty.rank || index + 1} of {rankedFaculty.length}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="ml-16 mt-4 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFacultySelect?.(faculty.name);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
                  >
                    <BarChart2 className="w-3 h-3" /> View Detailed Analysis
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* No Results */}
      {rankedFaculty.length === 0 && searchQuery && (
        <div className="p-8 text-center">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No faculty matching "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
};

export default FacultyScorecard;
