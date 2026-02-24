import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Announcement } from '../types';
import ConfirmationModal from './ConfirmationModal';

interface AnnouncementsProps {
  announcements: Announcement[];
  onUpdate: (data: Announcement[]) => void;
}

const Announcements: React.FC<AnnouncementsProps> = ({ announcements, onUpdate }) => {
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);

  const sortedAnnouncements = [...announcements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleShowFormForAdd = () => {
    setEditingAnnouncement(null);
    setTitle('');
    setContent('');
    setIsFormVisible(true);
  };
  
  const handleShowFormForEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setTitle(announcement.title);
    setContent(announcement.content);
    setIsFormVisible(true);
  };

  const handleCancel = () => {
    setIsFormVisible(false);
    setEditingAnnouncement(null);
    setTitle('');
    setContent('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (editingAnnouncement) {
      // Update
      const updatedList = announcements.map(a => a.id === editingAnnouncement.id ? { ...a, title, content } : a);
      onUpdate(updatedList);
    } else {
      // Add
      const newAnnouncement: Announcement = {
        id: uuidv4(),
        title,
        content,
        date: new Date().toISOString()
      };
      onUpdate([...announcements, newAnnouncement]);
    }
    handleCancel();
  };
  
  const handleDelete = () => {
      if(!announcementToDelete) return;
      const updatedList = announcements.filter(a => a.id !== announcementToDelete.id);
      onUpdate(updatedList);
      setAnnouncementToDelete(null);
  }

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Pengumuman</h1>
        {!isFormVisible && (
            <button onClick={handleShowFormForAdd} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center space-x-2">
                <span>+</span>
                <span className="hidden sm:inline">Buat Pengumuman</span>
            </button>
        )}
      </div>

      {isFormVisible && (
        <div className="bg-white rounded-xl shadow-xl p-6 mb-8">
          <form onSubmit={handleSubmit}>
            <h2 className="text-xl font-bold mb-4">{editingAnnouncement ? 'Edit' : 'Buat'} Pengumuman</h2>
            <div className="mb-4">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">Judul</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="content" className="block text-sm font-medium text-gray-700">Isi Pengumuman</label>
              <textarea
                id="content"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
                className="mt-1 w-full p-2 border rounded-md"
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={handleCancel} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">Batal</button>
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Simpan</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-6">
        {sortedAnnouncements.map(announcement => (
          <div key={announcement.id} className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-800">{announcement.title}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Diposting pada: {new Date(announcement.date).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
                </p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleShowFormForEdit(announcement)} className="text-blue-500 hover:text-blue-700">Edit</button>
                <button onClick={() => setAnnouncementToDelete(announcement)} className="text-red-500 hover:text-red-700">Hapus</button>
              </div>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{announcement.content}</p>
          </div>
        ))}
      </div>
       {announcementToDelete && (
          <ConfirmationModal
            title="Hapus Pengumuman"
            message={`Apakah Anda yakin ingin menghapus pengumuman berjudul "${announcementToDelete.title}"?`}
            confirmText="Ya, Hapus"
            cancelText="Batal"
            onConfirm={handleDelete}
            onCancel={() => setAnnouncementToDelete(null)}
            confirmColor="red"
            cancelColor="green"
          />
      )}
    </div>
  );
};

export default Announcements;