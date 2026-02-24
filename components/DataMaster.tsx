import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MasterData, MasterDataItem, User } from '../types';
import ConfirmationModal from './ConfirmationModal';

interface DataMasterProps {
  masterData: MasterData;
  users: User[];
  onAddItem: (type: ActiveTab, newItemName: string) => void;
  onUpdateItem: (type: ActiveTab, item: MasterDataItem) => void;
  onDeleteItem: (type: ActiveTab, item: MasterDataItem) => void;
  onMergeMasterData: (type: 'classes' | 'majors', idsToMerge: string[], targetItem: MasterDataItem) => void;
}

type ActiveTab = 'classes' | 'majors';

const cardColors = [
  'from-blue-500 to-purple-600',
  'from-green-500 to-teal-500',
  'from-yellow-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-sky-600',
  'from-indigo-500 to-violet-600',
];

const DataMaster: React.FC<DataMasterProps> = ({ masterData, users, onAddItem, onUpdateItem, onDeleteItem, onMergeMasterData }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('classes');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [previewUserList, setPreviewUserList] = useState<{ title: string; users: User[] } | null>(null);
  
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [itemToDelete, setItemToDelete] = useState<MasterDataItem | null>(null);

  const data = masterData[activeTab];
  const tabTitle = activeTab === 'classes' ? 'Kelas' : 'Jurusan';

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, searchTerm]);

  const getStudentCount = (itemName: string) => {
    const key = activeTab === 'classes' ? 'class' : 'major';
    return users.filter(u => u[key] === itemName).length;
  };

  const handleCardClick = (item: MasterDataItem) => {
    if (isSelectionMode) {
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(item.id)) newSet.delete(item.id);
        else newSet.add(item.id);
        return newSet;
      });
    } else {
      const key = activeTab === 'classes' ? 'class' : 'major';
      const associatedUsers = users.filter(u => u[key] === item.name);
      setPreviewUserList({ title: `${tabTitle}: ${item.name}`, users: associatedUsers });
    }
  };
  
  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItems(new Set());
  };

  const handleSaveInModal = () => {
    if (!newItemName.trim()) return;

    // Check for duplicates before saving
    const isDuplicate = data.some(item => 
        item.name.toLowerCase() === newItemName.trim().toLowerCase() &&
        (!editingItem || item.id !== editingItem.id)
    );

    if (isDuplicate) {
        alert(`Nama "${newItemName.trim()}" sudah ada. Silakan gunakan nama lain.`);
        return;
    }

    if (editingItem) { // Update
      onUpdateItem(activeTab, { ...editingItem, name: newItemName.trim() });
    } else { // Add
      onAddItem(activeTab, newItemName.trim());
    }
    setIsAddEditModalOpen(false);
    setNewItemName('');
    setEditingItem(null);
  };
  
  const handleDeleteItem = () => {
    if (!itemToDelete) return;
    onDeleteItem(activeTab, itemToDelete);
    setItemToDelete(null);
  };
  
  const handleConfirmMerge = (targetItem: MasterDataItem) => {
      onMergeMasterData(activeTab, Array.from(selectedItems), targetItem);
      setIsMergeModalOpen(false);
      setIsSelectionMode(false);
      setSelectedItems(new Set());
  };

  return (
    <div className="animate-fade-in flex space-x-6">
      {/* Main Content */}
      <div className="flex-grow">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Data Master</h1>
        <div className="bg-white rounded-xl shadow-xl">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              <button onClick={() => { setActiveTab('classes'); setSearchTerm(''); }} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'classes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Manajemen Kelas</button>
              <button onClick={() => { setActiveTab('majors'); setSearchTerm(''); }} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'majors' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Manajemen Jurusan</button>
            </nav>
          </div>
          <div className="p-4 bg-gray-50/50 border-b flex flex-col sm:flex-row gap-4 justify-between items-center">
             <div className="relative w-full sm:w-auto flex-grow">
                 <input type="text" placeholder={`Cari ${tabTitle}...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 w-full sm:w-64 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg></span>
             </div>
             <div className="flex items-center space-x-2">
                {!isSelectionMode ? (
                  <>
                    <button onClick={handleToggleSelectionMode} className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg text-sm">Pilih untuk Gabung</button>
                    <button onClick={() => { setEditingItem(null); setNewItemName(''); setIsAddEditModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Tambah Baru</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsMergeModalOpen(true)} disabled={selectedItems.size < 2} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm disabled:bg-gray-400 disabled:cursor-not-allowed">Gabungkan ({selectedItems.size})</button>
                    <button onClick={handleToggleSelectionMode} className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg text-sm">Batal</button>
                  </>
                )}
             </div>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredData.map((item, index) => {
              const colorClass = cardColors[index % cardColors.length];
              return (
                <div 
                  key={item.id} 
                  onClick={() => handleCardClick(item)} 
                  className={`relative p-4 rounded-xl cursor-pointer transition-all duration-300 text-white bg-gradient-to-br ${colorClass} shadow-lg hover:shadow-xl hover:-translate-y-1 ${isSelectionMode && selectedItems.has(item.id) ? 'ring-4 ring-offset-2 ring-blue-500' : 'hover:brightness-110'}`}
                >
                  {isSelectionMode && <input type="checkbox" checked={selectedItems.has(item.id)} readOnly className="absolute top-3 right-3 h-5 w-5 rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300"/>}
                  <h3 className="font-bold text-xl truncate">{item.name}</h3>
                  <p className="text-sm opacity-80">{getStudentCount(item.name)} Siswa</p>
                  {!isSelectionMode && (
                    <div className="mt-3 pt-3 border-t border-white/30 flex space-x-2 text-sm">
                      <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setNewItemName(item.name); setIsAddEditModalOpen(true); }} className="font-semibold opacity-80 hover:opacity-100 hover:underline">Edit</button>
                      <span>&middot;</span>
                      <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); }} className="font-semibold opacity-80 hover:opacity-100 hover:underline">Hapus</button>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredData.length === 0 && <p className="text-gray-500 col-span-full text-center">Tidak ada data ditemukan.</p>}
          </div>
        </div>
      </div>

      {/* Side Panel for Student Preview */}
      <div className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-20 transition-transform duration-300 ease-in-out ${previewUserList ? 'translate-x-0' : 'translate-x-full'}`} style={{width: '350px'}}>
          {previewUserList && (
              <div className="flex flex-col h-full">
                  <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="text-lg font-bold text-gray-800">{previewUserList.title}</h3>
                      <button onClick={() => setPreviewUserList(null)} className="p-1 rounded-full hover:bg-gray-200">&times;</button>
                  </div>
                  <ul className="overflow-y-auto p-4 flex-grow divide-y">
                      {previewUserList.users.length > 0 ? previewUserList.users.map(u => (
                          <li key={u.id} className="py-2 text-sm text-gray-700">{u.fullName}</li>
                      )) : <li className="py-2 text-sm text-gray-500">Tidak ada siswa.</li>}
                  </ul>
              </div>
          )}
      </div>
      {previewUserList && <div onClick={() => setPreviewUserList(null)} className="fixed inset-0 bg-black/30 z-10"></div>}

      {/* Modals */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">{editingItem ? 'Edit' : 'Tambah'} {tabTitle}</h3>
            <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full p-2 border rounded-md" />
            <div className="mt-4 flex justify-end space-x-2">
              <button onClick={() => setIsAddEditModalOpen(false)} className="bg-gray-200 px-4 py-2 rounded-md">Batal</button>
              <button onClick={handleSaveInModal} className="bg-blue-600 text-white px-4 py-2 rounded-md">Simpan</button>
            </div>
          </div>
        </div>
      )}
      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-2">Gabungkan Data</h3>
            <p className="text-sm text-gray-600 mb-4">Pilih nama yang benar untuk dijadikan data utama. Data siswa akan diperbarui sesuai pilihan ini.</p>
            <div className="space-y-2">
                {data.filter(i => selectedItems.has(i.id)).map(item => (
                    <button key={item.id} onClick={() => handleConfirmMerge(item)} className="w-full text-left p-3 bg-gray-100 hover:bg-blue-100 rounded-md">
                        {item.name}
                    </button>
                ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setIsMergeModalOpen(false)} className="bg-gray-200 px-4 py-2 rounded-md">Batal</button>
            </div>
          </div>
        </div>
      )}
      {itemToDelete && (
          <ConfirmationModal
            title={`Hapus ${tabTitle}`}
            message={`Yakin ingin menghapus "${itemToDelete.name}"? ${getStudentCount(itemToDelete.name) > 0 ? `Ada ${getStudentCount(itemToDelete.name)} siswa yang terhubung dengan data ini.` : ''}`}
            confirmText="Ya, Hapus"
            cancelText="Batal"
            onConfirm={handleDeleteItem}
            onCancel={() => setItemToDelete(null)}
            confirmColor="red"
            cancelColor="green"
          />
      )}
    </div>
  );
};

export default DataMaster;