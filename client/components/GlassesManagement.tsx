import { useState, useEffect, useRef } from 'react';
import { API_BASE, UPLOADS_BASE } from '../apiBase';

const getToken = () => localStorage.getItem('edumind_token') ?? '';

type ItemType = 'glasses' | 'lens';

interface GlassesItem {
  id: string;
  name: string;
  item_type: ItemType;
  image_url: string;
  frame_shape?: string;
  thickness?: string;
  material?: string;
  style?: string;
  suitable_face_types: string[];
  lens_color?: string;
  description?: string;
  is_active: boolean;
}

const FACE_SHAPES = ['round', 'oval', 'square', 'heart', 'long'];
const FACE_SHAPE_LABELS: Record<string, string> = {
  round: '圓臉', oval: '鵝蛋臉', square: '方臉', heart: '心型臉', long: '長臉',
};
const FRAME_SHAPES = ['round', 'square', 'semi', 'rimless', 'cat_eye', 'oval'];
const FRAME_LABELS: Record<string, string> = {
  round: '圓框', square: '方框', semi: '半框', rimless: '無框', cat_eye: '貓眼框', oval: '橢圓框',
};
const STYLES = ['business', 'fashion', 'sport', 'casual', 'vintage'];
const STYLE_LABELS: Record<string, string> = {
  business: '商務', fashion: '時尚', sport: '運動', casual: '休閒', vintage: '復古',
};
const MATERIALS = ['metal', 'plastic', 'mixed', 'titanium'];
const MATERIAL_LABELS: Record<string, string> = {
  metal: '金屬', plastic: '塑膠', mixed: '混合', titanium: '鈦金屬',
};
const THICKNESS = ['thin', 'medium', 'thick'];
const THICKNESS_LABELS: Record<string, string> = { thin: '細框', medium: '中等', thick: '粗框' };

export default function GlassesManagement() {
  const token = getToken();
  const [items, setItems] = useState<GlassesItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | ItemType>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editItem, setEditItem] = useState<GlassesItem | null>(null);
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', item_type: 'glasses' as ItemType,
    frame_shape: '', thickness: '', material: '', style: '',
    suitable_face_types: [] as string[],
    lens_color: '', description: '',
  });

  const authHeader = { Authorization: `Bearer ${token}` };

  async function fetchItems() {
    setLoading(true);
    try {
      const q = filterType !== 'all' ? `?item_type=${filterType}` : '';
      const r = await fetch(`${API_BASE}/glasses${q}`, { headers: authHeader });
      const d = await r.json();
      if (d.success) setItems(d.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchItems(); }, [filterType]);

  function toggleFaceType(ft: string) {
    setForm(f => ({
      ...f,
      suitable_face_types: f.suitable_face_types.includes(ft)
        ? f.suitable_face_types.filter(x => x !== ft)
        : [...f.suitable_face_types, ft],
    }));
  }

  async function handleUpload(e: { preventDefault: () => void }) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('請選擇圖片');
    if (!form.name) return setError('請填入名稱');

    setUploading(true); setError(''); setSuccess('');

    // 自動去背：把老師拍的眼鏡照去背成乾淨透明圖（瀏覽器本地、不耗 API）
    let imageBlob: Blob = file;
    if (autoRemoveBg) {
      try {
        setSuccess('正在自動去背…（首次需下載高精度模型，請稍候）');
        const { removeBackground } = await import('@imgly/background-removal');
        // 手機記憶體有限：全精度 isnet 會讓 iOS Safari 爆記憶體當機 → 手機改用量化小模型
        const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
        imageBlob = await removeBackground(file, {
          model: isMobile ? 'isnet_quint8' : 'isnet',
          device: 'gpu',                                // 有 WebGL 就用 GPU，邊緣更乾淨
          output: { format: 'image/png', quality: 1 },  // 無損 PNG，保留 alpha 邊緣
        });
        setSuccess('');
      } catch (err) {
        console.warn('[glasses] 去背失敗，改用原圖上傳:', err);
        imageBlob = file;
        setSuccess('');
      }
    }

    const fd = new FormData();
    fd.append('image', imageBlob, autoRemoveBg ? 'glasses.png' : file.name);
    Object.entries(form).forEach(([k, v]) => {
      fd.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    });

    try {
      const r = await fetch(`${API_BASE}/glasses/upload`, {
        method: 'POST', headers: authHeader, body: fd,
      });
      const d = await r.json();
      if (d.success) {
        setSuccess(`"${form.name}" 上傳成功`);
        setForm({ name: '', item_type: 'glasses', frame_shape: '', thickness: '', material: '', style: '', suitable_face_types: [], lens_color: '', description: '' });
        if (fileRef.current) fileRef.current.value = '';
        fetchItems();
      } else { setError(d.error || '上傳失敗'); }
    } catch { setError('網路錯誤'); }
    finally { setUploading(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`確定刪除「${name}」？`)) return;
    const r = await fetch(`${API_BASE}/glasses/${id}`, { method: 'DELETE', headers: authHeader });
    const d = await r.json();
    if (d.success) { setSuccess(`已刪除「${name}」`); fetchItems(); }
    else setError(d.error || '刪除失敗');
  }

  async function handleToggleActive(item: GlassesItem) {
    const r = await fetch(`${API_BASE}/glasses/${item.id}`, {
      method: 'PATCH',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !item.is_active }),
    });
    const d = await r.json();
    if (d.success) fetchItems();
  }

  const imgSrc = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // relative paths (e.g. /uploads/glasses/...) need backend origin prepended
    const origin = UPLOADS_BASE.replace('/uploads', '');
    return `${origin}${url}`;
  };

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">眼鏡 / 隱形眼鏡 管理</h1>

      {/* 上傳表單 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">新增品項</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名稱 *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：黑色方框眼鏡" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.item_type}
                onChange={e => setForm(f => ({ ...f, item_type: e.target.value as ItemType }))}>
                <option value="glasses">眼鏡框</option>
                <option value="lens">隱形眼鏡</option>
              </select>
            </div>
          </div>

          {form.item_type === 'glasses' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">框型</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.frame_shape}
                  onChange={e => setForm(f => ({ ...f, frame_shape: e.target.value }))}>
                  <option value="">—</option>
                  {FRAME_SHAPES.map(s => <option key={s} value={s}>{FRAME_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">框粗細</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.thickness}
                  onChange={e => setForm(f => ({ ...f, thickness: e.target.value }))}>
                  <option value="">—</option>
                  {THICKNESS.map(t => <option key={t} value={t}>{THICKNESS_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">材質</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.material}
                  onChange={e => setForm(f => ({ ...f, material: e.target.value }))}>
                  <option value="">—</option>
                  {MATERIALS.map(m => <option key={m} value={m}>{MATERIAL_LABELS[m]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">風格</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.style}
                  onChange={e => setForm(f => ({ ...f, style: e.target.value }))}>
                  <option value="">—</option>
                  {STYLES.map(s => <option key={s} value={s}>{STYLE_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顏色</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.lens_color}
                onChange={e => setForm(f => ({ ...f, lens_color: e.target.value }))} placeholder="例：藍色、棕色漸層" />
            </div>
          )}

          {/* 適合臉型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">適合臉型（可複選）</label>
            <div className="flex flex-wrap gap-2">
              {FACE_SHAPES.map(ft => (
                <button key={ft} type="button"
                  onClick={() => toggleFaceType(ft)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.suitable_face_types.includes(ft)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}>
                  {FACE_SHAPE_LABELS[ft]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明（可選）</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="搭配說明或推薦原因" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">圖片 * (PNG/JPG，最大 5MB)</label>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100" />
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={autoRemoveBg} onChange={e => setAutoRemoveBg(e.target.checked)} className="rounded" />
              上傳時自動去背（建議拍眼鏡放桌上、背景單純）
            </label>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}

          <button type="submit" disabled={uploading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {uploading ? '上傳中...' : '新增品項'}
          </button>
        </form>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b flex items-center gap-3">
          <h2 className="text-lg font-semibold flex-1">品項列表</h2>
          <span className="text-sm text-gray-500">{items.length} 筆</span>
          {(['all', 'glasses', 'lens'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-full text-sm border ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-300 hover:border-blue-400'}`}>
              {t === 'all' ? '全部' : t === 'glasses' ? '眼鏡框' : '隱形眼鏡'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">載入中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">尚無品項，請上傳第一個！</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {items.map(item => (
              <div key={item.id} className={`border rounded-xl overflow-hidden ${item.is_active ? '' : 'opacity-50'}`}>
                <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-300 relative">
                  <img src={imgSrc(item.image_url)} alt={item.name}
                    className="w-full h-full object-contain p-2" />
                  <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.item_type === 'glasses' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {item.item_type === 'glasses' ? '眼鏡' : '隱眼'}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                  {item.frame_shape && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {FRAME_LABELS[item.frame_shape] ?? item.frame_shape}
                      {item.thickness ? ` · ${THICKNESS_LABELS[item.thickness] ?? item.thickness}` : ''}
                    </p>
                  )}
                  {item.suitable_face_types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.suitable_face_types.map(ft => (
                        <span key={ft} className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                          {FACE_SHAPE_LABELS[ft] ?? ft}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleToggleActive(item)}
                      className="flex-1 text-xs py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600">
                      {item.is_active ? '停用' : '啟用'}
                    </button>
                    <button onClick={() => handleDelete(item.id, item.name)}
                      className="flex-1 text-xs py-1 rounded border border-red-200 hover:bg-red-50 text-red-600">
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
