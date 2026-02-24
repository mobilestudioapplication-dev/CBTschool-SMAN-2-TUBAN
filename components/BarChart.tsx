import React from 'react';

interface ChartData {
  label: string;
  value: number;
}

interface BarChartProps {
  data: ChartData[];
}

const BarChart: React.FC<BarChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
        <div className="w-full h-72 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
            <p className="text-slate-400 text-sm font-medium">Tidak ada data statistik untuk ditampilkan.</p>
        </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1); // Prevent division by zero if all values are 0
  
  // Palet warna cerah dan beragam untuk membedakan setiap jurusan
  const colors = [
    '#3B82F6', // Blue-500
    '#10B981', // Emerald-500
    '#F59E0B', // Amber-500
    '#EF4444', // Red-500
    '#8B5CF6', // Violet-500
    '#EC4899', // Pink-500
    '#06B6D4', // Cyan-500
    '#F97316', // Orange-500
    '#6366F1', // Indigo-500
    '#84CC16', // Lime-500
    '#D946EF', // Fuchsia-500
    '#0EA5E9', // Sky-500
  ];

  return (
    <div className="w-full h-80 flex items-end space-x-3 sm:space-x-6 p-4 sm:p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
      {data.map((item, index) => {
        // Calculate percentage relative to max value
        const percentage = Math.round((item.value / maxValue) * 100);
        const color = colors[index % colors.length];

        return (
          <div key={index} className="flex-1 h-full flex flex-col justify-end items-center group">
            
            {/* Area Batang & Angka: Mengambil sisa ruang vertikal di atas label */}
            <div className="w-full flex-1 flex flex-col justify-end items-center relative pb-2">
                
                {/* Angka Jumlah Siswa (Di atas batang) */}
                <span className="mb-2 text-sm sm:text-base font-bold text-slate-700 opacity-90 group-hover:scale-110 group-hover:text-slate-900 transition-all duration-300">
                    {item.value}
                </span>
                
                {/* Batang Grafik */}
                <div 
                    className="w-full rounded-t-lg shadow-sm group-hover:shadow-lg transition-all duration-700 ease-out relative"
                    style={{ 
                        height: `${percentage}%`, 
                        backgroundColor: color,
                        minHeight: percentage > 0 ? '8px' : '2px', // Pastikan visual tetap ada walau kecil
                        opacity: percentage === 0 ? 0.3 : 1
                    }}
                >
                    {/* Efek Kilau Halus di atas batang */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent rounded-t-lg pointer-events-none"></div>
                </div>
            </div>

            {/* Label Jurusan (Di bawah batang) */}
            {/* Menggunakan ketinggian tetap (h-10) agar alignment batang tetap sejajar */}
            <div className="h-10 w-full flex items-start justify-center border-t border-slate-100 pt-2">
                <p 
                    className="text-[10px] sm:text-xs font-bold text-slate-500 text-center leading-tight line-clamp-2 w-full break-words group-hover:text-slate-800 transition-colors uppercase tracking-wide"
                    title={item.label}
                >
                    {item.label}
                </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;