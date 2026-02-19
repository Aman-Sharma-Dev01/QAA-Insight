
// Fix: Use namespace import for React to ensure JSX types are correctly resolved
import * as React from 'react';
import { AggregatedData } from '../types';
import { FileText } from 'lucide-react';

interface StatsProps {
  data: AggregatedData;
}

const StatsCards: React.FC<StatsProps> = ({ data }) => {
  const { totalResponses } = data;

  return (
    <div className="mb-6">
      {/* Total Feedbacks */}
      <div className="inline-block bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-900">{totalResponses.toLocaleString()}</p>
        <p className="text-xs text-slate-500 uppercase tracking-wide mt-1">Total Feedbacks</p>
      </div>
    </div>
  );
};

export default StatsCards;
