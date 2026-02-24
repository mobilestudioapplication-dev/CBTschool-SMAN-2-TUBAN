import React, { useState, useMemo } from 'react';
import { Schedule, Test, MasterData, ScheduleStatus } from '../types';
import ScheduleModal from './ScheduleModal';
import ConfirmationModal from './ConfirmationModal';

interface ExamScheduleProps {
  schedules: Schedule[];
  tests: Map<string, Test>;
  masterData: MasterData;
  onAddSchedule: (schedule: Omit<Schedule, 'id'>) => void;
  onUpdateSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (scheduleId: string) => void;
}

const getScheduleStatus = (schedule: Schedule): ScheduleStatus => {
  const now = new Date();
  const start = new Date(schedule.startTime);
  const end = new Date(schedule.endTime);
  if (now < start) return 'Akan Datang';
  if (now > end) return 'Selesai';
  return 'Berlangsung';
};

const statusColors: Record<ScheduleStatus, { bg: string; text: string; dot: string; }> = {
  'Berlangsung': { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  'Akan Datang': { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  'Selesai': { bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-500' },
};

// Helper to determine the overall status for a day based on priority
const getDayOverallStatus = (schedules: Schedule[]): ScheduleStatus | null => {
  if (!schedules.length) return null;
  const statuses = new Set(schedules.map(getScheduleStatus));
  if (statuses.has('Berlangsung')) return 'Berlangsung';
  if (statuses.has('Akan Datang')) return 'Akan Datang';
  return 'Selesai';
};

const CalendarView: React.FC<{
  currentDate: Date,
  schedules: Schedule[],
  tests: Map<string, Test>,
  onDateChange: (newDate: Date) => void,
  onEdit: (schedule: Schedule) => void
}> = ({ currentDate, schedules, tests, onDateChange, onEdit }) => {
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const daysOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

  const handlePrevMonth = () => onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  
  const schedulesByDate = useMemo(() => {
      const map = new Map<number, Schedule[]>();
      schedules.forEach(s => {
          const startDate = new Date(s.startTime);
          if(startDate.getFullYear() === currentDate.getFullYear() && startDate.getMonth() === currentDate.getMonth()){
              const day = startDate.getDate();
              if(!map.has(day)) map.set(day, []);
              map.get(day)?.push(s);
          }
      });
      return map;
  }, [schedules, currentDate]);

  return (
    <div className="bg-white rounded-xl shadow-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-100">&lt;</button>
        <h2 className="text-xl font-bold">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
        <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-100">&gt;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm text-gray-500 mb-2">
        {daysOfWeek.map(day => <div key={day}>{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} className="border rounded-lg h-28 bg-gray-50/70"></div>)}
        {Array.from({ length: daysInMonth }).map((_, day) => {
          const daySchedules = schedulesByDate.get(day + 1) || [];
          const dayStatus = getDayOverallStatus(daySchedules);
          const dayClass = dayStatus ? statusColors[dayStatus].bg : '';
          
          return (
            <div key={day} className={`border rounded-lg h-28 p-1.5 flex flex-col transition-colors duration-200 ${dayClass}`}>
              <span className="font-semibold text-gray-800">{day + 1}</span>
              <div className="mt-1 space-y-1 overflow-y-auto text-xs">
                {daySchedules.map(s => {
                  const test = tests.get(s.testToken);
                  const status = getScheduleStatus(s);
                  return (
                      <div key={s.id} onClick={() => onEdit(s)} className="p-1.5 rounded-md cursor-pointer bg-white/70 backdrop-blur-sm shadow-sm hover:bg-white transition-all">
                        <div className="flex items-center space-x-1.5">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[status].dot}`}></div>
                          <p className={`font-bold truncate ${statusColors[status].text}`}>{test?.details.subject}</p>
                        </div>
                      </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};

const ListView: React.FC<{schedules: Schedule[], tests: Map<string, Test>, onEdit: (s: Schedule) => void, onDelete: (s: Schedule) => void}> = ({schedules, tests, onEdit, onDelete}) => {
    return (
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mata Pelajaran</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu Mulai</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Peserta</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {schedules.map(s => {
                        const test = tests.get(s.testToken);
                        const status = getScheduleStatus(s);
                        return (
                            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{test?.details.subject}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[status].bg} ${statusColors[status].text}`}>
                                        {status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(s.startTime).toLocaleString('id-ID')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(s.assignedTo || []).join(', ')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    <button onClick={() => onEdit(s)} className="text-blue-600 hover:text-blue-900">Edit</button>
                                    <button onClick={() => onDelete(s)} className="text-red-600 hover:text-red-900">Hapus</button>
                                </td>
                            </tr>
                        )
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


const ExamSchedule: React.FC<ExamScheduleProps> = (props) => {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<Schedule | null>(null);

  const sortedSchedules = useMemo(() => {
    return [...props.schedules].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [props.schedules]);

  const handleOpenModalForAdd = () => {
    setEditingSchedule(null);
    setIsModalOpen(true);
  };
  
  const handleOpenModalForEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setIsModalOpen(true);
  };
  
  const handleSaveSchedule = (scheduleData: Omit<Schedule, 'id'> | Schedule) => {
    if ('id' in scheduleData) {
      props.onUpdateSchedule(scheduleData);
    } else {
      props.onAddSchedule(scheduleData);
    }
    setIsModalOpen(false);
  };

  return (
     <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Jadwal Ujian</h1>
        <div className="flex items-center space-x-2">
            <div className="p-1 bg-gray-200 rounded-lg">
                <button onClick={() => setView('calendar')} className={`px-3 py-1 text-sm font-semibold rounded-md ${view === 'calendar' ? 'bg-white shadow' : 'text-gray-600'}`}>Kalender</button>
                <button onClick={() => setView('list')} className={`px-3 py-1 text-sm font-semibold rounded-md ${view === 'list' ? 'bg-white shadow' : 'text-gray-600'}`}>Daftar</button>
            </div>
            <button
                onClick={handleOpenModalForAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:-translate-y-0.5 flex items-center space-x-2"
            >
                <span>+</span>
                <span className="hidden sm:inline">Buat Jadwal</span>
            </button>
        </div>
      </div>
      
      {view === 'calendar' ? (
          <CalendarView currentDate={currentDate} schedules={props.schedules} tests={props.tests} onDateChange={setCurrentDate} onEdit={handleOpenModalForEdit} />
      ) : (
          <ListView schedules={sortedSchedules} tests={props.tests} onEdit={handleOpenModalForEdit} onDelete={setDeletingSchedule} />
      )}

      {isModalOpen && (
          <ScheduleModal 
            scheduleToEdit={editingSchedule} 
            onSave={handleSaveSchedule} 
            onClose={() => setIsModalOpen(false)} 
            tests={props.tests}
            masterData={props.masterData}
        />
      )}
      
       {deletingSchedule && (
        <ConfirmationModal 
          title="Hapus Jadwal"
          message={`Apakah Anda yakin ingin menghapus jadwal untuk "${props.tests.get(deletingSchedule.testToken)?.details.subject}"?`}
          confirmText="Ya, Hapus"
          cancelText="Batal"
          onConfirm={() => { props.onDeleteSchedule(deletingSchedule.id); setDeletingSchedule(null); }}
          onCancel={() => setDeletingSchedule(null)}
          confirmColor="red"
          cancelColor="green"
        />
      )}
    </div>
  );
};

export default ExamSchedule;