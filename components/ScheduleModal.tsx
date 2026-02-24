import React, { useState } from 'react';
import { Schedule, Test, MasterData } from '../types';
import CustomDateTimePicker from './CustomDateTimePicker';

interface ScheduleModalProps {
  scheduleToEdit: Schedule | null;
  tests: Map<string, Test>;
  masterData: MasterData;
  onSave: (schedule: Omit<Schedule, 'id'> | Schedule) => void;
  onClose: () => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ scheduleToEdit, tests, masterData, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    testToken: scheduleToEdit?.testToken || '',
    startTime: scheduleToEdit?.startTime ? new Date(scheduleToEdit.startTime) : new Date(),
    endTime: scheduleToEdit?.endTime ? new Date(scheduleToEdit.endTime) : new Date(new Date().getTime() + 60 * 60 * 1000), // Default to 1 hour later
    assignedTo: new Set<string>(scheduleToEdit?.assignedTo || []),
  });
  
  const allAssignable = [...masterData.classes, ...masterData.majors].map(i => i.name);

  const handleDateChange = (name: 'startTime' | 'endTime', date: Date) => {
    setFormData(prev => ({ ...prev, [name]: date }));
  };
  
  const handleAssignToChange = (name: string) => {
      setFormData(prev => {
          const newAssignedTo = new Set(prev.assignedTo);
          if (newAssignedTo.has(name)) {
              newAssignedTo.delete(name);
          } else {
              newAssignedTo.add(name);
          }
          return { ...prev, assignedTo: newAssignedTo };
      });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setFormData(prev => ({
        ...prev,
        assignedTo: isChecked ? new Set(allAssignable) : new Set(),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.testToken || !formData.startTime || !formData.endTime || formData.assignedTo.size === 0) {
        alert("Harap isi semua kolom yang diperlukan.");
        return;
    }
    if (formData.endTime <= formData.startTime) {
        alert("Waktu Selesai harus setelah Waktu Mulai.");
        return;
    }

    const scheduleData = {
        testToken: formData.testToken,
        startTime: formData.startTime.toISOString(),
        endTime: formData.endTime.toISOString(),
        assignedTo: Array.from(formData.assignedTo),
    };

    if (scheduleToEdit) {
      onSave({ ...scheduleData, id: scheduleToEdit.id });
    } else {
      onSave(scheduleData);
    }
  };

  const title = scheduleToEdit ? 'Edit Jadwal Ujian' : 'Buat Jadwal Ujian Baru';
  const testsArray = Array.from(tests.entries());

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col transform animate-scale-up">
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700">Pilih Ujian</label>
            <select name="testToken" value={formData.testToken} onChange={(e) => setFormData(p => ({...p, testToken: e.target.value}))} className="mt-1 w-full p-2 border rounded-md bg-white" required>
              <option value="">-- Pilih Mata Pelajaran --</option>
              {testsArray.map(([token, test]) => (
                <option key={token} value={token}>{test.details.subject} ({token})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Waktu Mulai</label>
                <CustomDateTimePicker value={formData.startTime} onChange={(date) => handleDateChange('startTime', date)} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Waktu Selesai</label>
                <CustomDateTimePicker value={formData.endTime} onChange={(date) => handleDateChange('endTime', date)} />
            </div>
          </div>
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tetapkan untuk Peserta</label>
              <div className="border rounded-md">
                <div className="p-2 border-b">
                    <label className="flex items-center space-x-2 p-1">
                        <input
                            type="checkbox"
                            onChange={handleSelectAll}
                            checked={allAssignable.length > 0 && formData.assignedTo.size === allAssignable.length}
                            className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-semibold text-gray-800">Centang Semua</span>
                    </label>
                </div>
                <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                  {allAssignable.map(name => (
                      <label key={name} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                          <input type="checkbox" checked={formData.assignedTo.has(name)} onChange={() => handleAssignToChange(name)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm text-gray-800">{name}</span>
                      </label>
                  ))}
                </div>
              </div>
          </div>
          
          <div className="p-5 border-t flex justify-end space-x-4">
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Simpan Jadwal</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleModal;