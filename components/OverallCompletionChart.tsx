import React from 'react';

interface OverallCompletionChartProps {
  completed: number;
  total: number;
}

const OverallCompletionChart: React.FC<OverallCompletionChartProps> = ({ completed, total }) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const size = 180;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            {/* Background circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="url(#gradient-bg)"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={0}
            />
            {/* Foreground (progress) circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="url(#gradient-fg)"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
            <defs>
                <linearGradient id="gradient-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#e5e7eb" />
                    <stop offset="100%" stopColor="#d1d5db" />
                </linearGradient>
                <linearGradient id="gradient-fg" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#EC4899" />
                </linearGradient>
            </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500">{percentage}%</span>
          <span className="text-sm text-gray-500 -mt-1">Selesai</span>
        </div>
      </div>
       <div className="text-center mt-4">
        <p className="text-gray-600 font-semibold">{completed} dari {total} siswa</p>
        <p className="text-xs text-gray-500">telah menyelesaikan ujian</p>
      </div>
    </div>
  );
};

export default OverallCompletionChart;