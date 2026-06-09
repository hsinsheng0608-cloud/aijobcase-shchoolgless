
import React, { useState, useRef, useEffect } from 'react';
import { Material } from '../types';
import {
  IconFile,
  IconPresentation,
  IconZap,
  IconPlus,
  IconX,
  IconUpload,
  IconTrash
} from './Icons';
import { uploadMaterial, getMaterials, pollMaterialStatus, deleteMaterial } from '../services/materialService';
import { API_BASE } from '../apiBase';
import { getAuthHeaders } from '../services/authService';

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl relative overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">{title}</h3>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><IconX className="w-6 h-6" /></button>
      </div>
      <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

interface MaterialManagementProps {
  courseId: string | null;
}

const MaterialManagement: React.FC<MaterialManagementProps> = ({ courseId }) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [activeModal, setActiveModal] = useState<'UPLOAD' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [courses, setCourses] = useState<{id: string; name: string}[]>([]);
  const [internalCourseId, setInternalCourseId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const effectiveCourseId = courseId ?? internalCourseId;

  useEffect(() => {
    if (effectiveCourseId) {
      getMaterials(effectiveCourseId).then(setMaterials).catch(console.error);
    }
  }, [effectiveCourseId]);

  useEffect(() => {
    if (!courseId) {
      fetch(`${API_BASE}/courses`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => {
          const list = d.data ?? d.courses ?? [];
          setCourses(list);
          // 自動選第一個課程，不需要手動選
          if (list.length > 0 && !internalCourseId) {
            setInternalCourseId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [courseId]);

  // 載入中
  if (!courseId && courses.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-6 h-6 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  const processFile = (file: File) => {
    setSelectedFile(file);
    setTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleConfirmUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setActiveModal(null);
    setIsProcessing(true);

    try {
      const { materialId } = await uploadMaterial(effectiveCourseId, selectedFile, title);

      // 加入 PROCESSING 狀態的教材
      setMaterials(prev => [{
        id: materialId, course_id: effectiveCourseId, title: title || selectedFile.name,
        type: selectedFile.name.split('.').pop()?.toUpperCase() as any || 'PDF',
        status: 'PROCESSING', created_at: new Date().toISOString(),
      }, ...prev]);

      // 輪詢狀態
      const result = await pollMaterialStatus(materialId);
      setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, ...result } : m));
    } catch (err: any) {
      alert('上傳失敗: ' + err.message);
    } finally {
      setIsProcessing(false);
      setSelectedFile(null);
      setTitle('');
    }
  };

  const handleDelete = async (mat: Material) => {
    if (!window.confirm(`確定要刪除教材「${mat.title}」嗎？\n此動作會一併移除它的 AI 索引，且無法復原。`)) return;
    setDeletingId(mat.id);
    try {
      await deleteMaterial(mat.id);
      setMaterials(prev => prev.filter(m => m.id !== mat.id));
    } catch (err: any) {
      alert('刪除失敗: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const currentCourseName = courses.find(c => c.id === effectiveCourseId)?.name ?? '';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-800">課程教材管理</h2>
          <p className="text-sm text-slate-500">上傳教材後系統將自動建立 AI 索引</p>
        </div>
        <button onClick={() => { setSelectedFile(null); setTitle(''); setActiveModal('UPLOAD'); }}
          className="flex-shrink-0 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 flex items-center gap-2 shadow-lg font-medium">
          <IconPlus className="w-5 h-5" /> 上傳新教材
        </button>
      </div>

      {/* 課程切換（只在沒有外部 courseId 時顯示） */}
      {!courseId && courses.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">課程：</span>
          {courses.map(c => (
            <button key={c.id}
              onClick={() => setInternalCourseId(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                effectiveCourseId === c.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
              }`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materials.map((mat) => (
          <div key={mat.id} className={`bg-white p-5 rounded-2xl border transition-all group ${
            mat.status === 'PROCESSING' ? 'border-indigo-100 bg-indigo-50/30' : 'border-slate-200 shadow-sm hover:shadow-md'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`p-4 rounded-xl ${
                mat.status === 'PROCESSING' ? 'bg-indigo-100 text-indigo-600 animate-pulse' :
                mat.type === 'PDF' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {mat.status === 'PROCESSING' ? <IconZap className="w-6 h-6" /> :
                 mat.type === 'PDF' ? <IconFile className="w-6 h-6" /> : <IconPresentation className="w-6 h-6" />}
              </div>
              <div className="flex-1 overflow-hidden">
                <h3 className="font-semibold text-slate-800 truncate">{mat.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">{mat.type}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    mat.status === 'READY' ? 'bg-emerald-100 text-emerald-700' :
                    mat.status === 'PROCESSING' ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {mat.status === 'READY' ? `已就緒 (${mat.chunk_count || 0} chunks)` : mat.status === 'PROCESSING' ? '建立索引中...' : '處理失敗'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(mat)}
                disabled={deletingId === mat.id || mat.status === 'PROCESSING'}
                title="刪除教材"
                aria-label="刪除教材"
                className="shrink-0 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {deletingId === mat.id ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <IconTrash className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        ))}
        {materials.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <p>尚未上傳任何教材</p>
          </div>
        )}
      </div>

      {activeModal === 'UPLOAD' && (
        <Modal title="上傳教材" onClose={() => setActiveModal(null)}>
          <form onSubmit={handleConfirmUpload} className="space-y-6">
            <div className={`relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300'
            }`} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                accept=".pdf,.docx,.pptx,.xlsx,.xls" />
              {!selectedFile ? (
                <>
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-indigo-500 mb-4"><IconUpload /></div>
                  <p className="text-slate-700 font-bold">點擊或拖拽檔案至此處</p>
                  <p className="text-slate-400 text-xs mt-1">支援 PDF, Word, PPT, Excel</p>
                </>
              ) : (
                <div className="w-full flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                  <div className="bg-indigo-50 text-indigo-600 p-3 rounded-xl"><IconFile className="w-8 h-8" /></div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold text-slate-800 truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg"><IconTrash /></button>
                </div>
              )}
            </div>
            <button type="submit" disabled={!selectedFile}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 shadow-xl disabled:opacity-50 flex items-center justify-center gap-2">
              <IconZap className="w-5 h-5" /> 上傳並建立 AI 索引
            </button>
          </form>
        </Modal>
      )}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-xs text-center border animate-pulse">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-slate-800">正在處理教材...</h3>
            <p className="text-sm text-slate-500 mt-2">解析 → 切片 → 向量化</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialManagement;
