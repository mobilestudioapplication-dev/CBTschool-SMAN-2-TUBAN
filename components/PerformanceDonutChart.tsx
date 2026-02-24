import React from 'react';

interface ChartDataItem {
  name: string;
  value: number;
  color: string;
}

interface PerformanceDonutChartProps {
  data: ChartDataItem[];
  total: number;
}

const PerformanceDonutChart: React.FC<PerformanceDonutChartProps> = ({ data, total }) => {
  const size = 200;
  const strokeWidth = 18;
  const center = size / 2;
  
  // Define radii for concentric circles
  const radii = [center - strokeWidth, center - strokeWidth * 2.5];

  // Ensure data always has at least two items for Lulus and Tidak Lulus
  const passedData = data.find(d => d.name === 'Lulus') || { name: 'Lulus', value: 0, color: '#10B981' };
  const failedData = data.find(d => d.name === 'Tidak Lulus') || { name: 'Tidak Lulus', value: 0, color: '#EF4444' };
  
  const chartItems = [
      { ...passedData, radius: radii[0] }, // Lulus (Outer circle)
      { ...failedData, radius: radii[1] }  // Tidak Lulus (Inner circle)
  ];

  return (
    <div className="flex flex-col items-center p-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <defs>
            <linearGradient id="gradient-passed" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
            <linearGradient id="gradient-failed" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F87171" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>
          </defs>
          
          {/* Background Tracks */}
          {chartItems.map((item, index) => (
            <circle
              key={`track-${index}`}
              cx={center}
              cy={center}
              r={item.radius}
              fill="transparent"
              stroke="#e5e7eb" // gray-200
              strokeWidth={strokeWidth}
            />
          ))}

          {/* Data Arcs */}
          {chartItems.map((item, index) => {
            const circumference = 2 * Math.PI * item.radius;
            // Prevent division by zero if total is 0.
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            const offset = circumference - (percent / 100) * circumference;
            const gradientUrl = item.name === 'Lulus' ? 'url(#gradient-passed)' : 'url(#gradient-failed)';

            return (
              <circle
                key={`arc-${index}`}
                cx={center}
                cy={center}
                r={item.radius}
                fill="transparent"
                stroke={gradientUrl}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={circumference}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
                style={{ strokeDashoffset: offset }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-4xl font-extrabold text-slate-800">{total}</span>
          <span className="text-sm font-medium text-slate-500 -mt-1">Siswa</span>
        </div>
      </div>
      <div className="flex justify-center space-x-6 mt-6 w-full">
        {chartItems.map(item => (
          <div key={item.name} className="flex items-center text-sm">
            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
            <span className="text-slate-600">{item.name}: <strong className="text-slate-800">{item.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PerformanceDonutChart;
