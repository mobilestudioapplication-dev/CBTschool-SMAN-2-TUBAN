
import React, { useState, useEffect, useRef } from 'react';

interface CustomDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const CustomDateTimePicker: React.FC<CustomDateTimePickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hours = value.getHours();
  const minutes = value.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const changeMonth = (amount: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + amount, 1));
  };
  
  const handleTimeChange = (type: 'h' | 'm' | 'p', val: string) => {
    const newDate = new Date(value);
    if (type === 'h') {
        const newHour12 = parseInt(val, 10);
        const currentHour24 = newDate.getHours();
        const isPM = currentHour24 >= 12;
        let newHour24;
        if (isPM) {
            newHour24 = newHour12 === 12 ? 12 : newHour12 + 12;
        } else {
            newHour24 = newHour12 === 12 ? 0 : newHour12;
        }
        newDate.setHours(newHour24);
    } else if (type === 'm') {
        newDate.setMinutes(parseInt(val, 10));
    } else if (type === 'p') {
        const currentHour24 = newDate.getHours();
        if (val === 'PM' && currentHour24 < 12) {
            newDate.setHours(currentHour24 + 12);
        } else if (val === 'AM' && currentHour24 >= 12) {
            newDate.setHours(currentHour24 - 12);
        }
    }
    onChange(newDate);
  }
  
  const handleDayClick = (day: number) => {
      const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day, value.getHours(), value.getMinutes());
      onChange(newDate);
  }

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`b-${i}`}></div>);
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const isSelected = day === value.getDate() && month === value.getMonth() && year === value.getFullYear();
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

        return (
            <button key={day} type="button" onClick={() => handleDayClick(day)}
                className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors
                    ${isSelected ? 'bg-blue-600 text-white' : ''}
                    ${!isSelected && isToday ? 'border border-blue-500' : ''}
                    ${!isSelected ? 'hover:bg-gray-100' : ''}
                `}>
                {day}
            </button>
        );
    });
    return [...blanks, ...days];
  };
  
  const formatValue = (date: Date): string => {
    if (!date || isNaN(date.getTime())) return '';
    
    // Format tanggal: DD/MM/YYYY
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    // Format waktu: HH:MM AM/PM
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours %= 12;
    hours = hours || 12; // Jam 0 harus jadi 12
    const displayHours = hours.toString().padStart(2, '0');

    return `${day}/${month}/${year}, ${displayHours}:${minutes} ${ampm}`;
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="mt-1 w-full p-2 border rounded-md bg-white cursor-pointer flex justify-between items-center">
        <span>{formatValue(value)}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-2xl z-10 border p-4 w-80">
          {/* Calendar */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 rounded-full hover:bg-gray-100">&lt;</button>
            <span className="font-semibold text-sm">{MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
            <button type="button" onClick={() => changeMonth(1)} className="p-1 rounded-full hover:bg-gray-100">&gt;</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-2">
            {DAY_NAMES.map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 place-items-center">
            {renderCalendar()}
          </div>
          <hr className="my-3"/>
          {/* Time */}
          <div className="flex items-center justify-center space-x-2">
            <select value={displayHour} onChange={(e) => handleTimeChange('h', e.target.value)} className="p-1 border rounded-md bg-white text-sm">
              {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{(i+1).toString().padStart(2, '0')}</option>)}
            </select>
            <span className="font-bold">:</span>
            <select value={minutes} onChange={(e) => handleTimeChange('m', e.target.value)} className="p-1 border rounded-md bg-white text-sm">
               {Array.from({length: 60}, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>)}
            </select>
            <select value={period} onChange={(e) => handleTimeChange('p', e.target.value)} className="p-1 border rounded-md bg-white text-sm">
              <option value="AM">Pagi</option>
              <option value="PM">Sore</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDateTimePicker;
