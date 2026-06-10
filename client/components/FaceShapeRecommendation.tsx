import React, { useState, useEffect, useRef } from 'react';
import { recommend, FACE_SHAPE_LABELS, FACE_SHAPE_DESCRIPTIONS } from '../ar/modules/recommendation-engine';
import type { GlassesItem, RecommendationResult } from '../ar/modules/recommendation-engine';
import type { FaceShape } from '../ar/modules/face-shape-analyzer';
import {
  IconTarget, IconPerson, IconCheck, IconWarning,
  IconFaceRound, IconFaceOval, IconFaceSquare, IconFaceHeart, IconFaceLong,
} from './Icons';

const API = import.meta.env.VITE_API_URL || '';
const getToken = () => localStorage.getItem('edumind_token') ?? '';

const FACE_SHAPE_ICONS: Record<FaceShape, React.FC<{ className?: string }>> = {
  round: IconFaceRound, oval: IconFaceOval, square: IconFaceSquare,
  heart: IconFaceHeart, long: IconFaceLong,
};

const FRAME_LABELS: Record<string, string> = {
  round: '圓框', square: '方框', semi: '半框', rimless: '無框', cat_eye: '貓眼框', oval: '橢圓框',
};
const STYLE_LABELS: Record<string, string> = {
  business: '商務', fashion: '時尚', sport: '運動', casual: '休閒', vintage: '復古',
};

interface Props {
  /** 由 AR 主程式傳入自動辨識的臉型 */
  detectedFaceShape?: FaceShape | null;
  /** 使用者選完眼鏡後通知 AR 主程式 */
  onSelectItem?: (item: GlassesItem) => void;
}

export default function FaceShapeRecommendation({ detectedFaceShape, onSelectItem }: Props) {
  const token = getToken();
  const [catalog, setCatalog] = useState<GlassesItem[]>([]);
  const [faceShape, setFaceShape] = useState<FaceShape | null>(detectedFaceShape ?? null);
  const [results, setResults] = useState<RecommendationResult[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'glasses' | 'lens'>('all');
  const [selectedItem, setSelectedItem] = useState<GlassesItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [logSent, setLogSent] = useState(false);
  const authHeader = { Authorization: `Bearer ${token}` };

  // 當 AR 主程式偵測到臉型時同步
  useEffect(() => {
    if (detectedFaceShape && !faceShape) setFaceShape(detectedFaceShape);
  }, [detectedFaceShape]);

  // 載入目錄
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/glasses`, { headers: authHeader })
      .then(r => r.json())
      .then(d => { if (d.success) setCatalog(d.data); })
      .finally(() => setLoading(false));
  }, []);

  // 依臉型推薦
  useEffect(() => {
    if (!faceShape || !catalog.length) { setResults([]); return; }
    const opts = filterType !== 'all' ? { itemType: filterType as 'glasses' | 'lens' } : {};
    setResults(recommend(catalog, faceShape, { ...opts, topN: 12 }));
    setLogSent(false);
  }, [faceShape, catalog, filterType]);

  async function handleSelect(item: GlassesItem) {
    setSelectedItem(item);
    onSelectItem?.(item);

    // 記錄推薦事件（教育追蹤）
    if (!logSent && faceShape) {
      setLogSent(true);
      fetch(`${API}/api/glasses/log`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          face_shape: faceShape,
          recommended_ids: results.map(r => r.item.id),
          selected_id: item.id,
          detection_method: detectedFaceShape ? 'auto' : 'manual',
        }),
      }).catch(() => {});
    }
  }

  const imgSrc = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    // 相對路徑（/uploads/...）要指向後端網域，否則會去要前端網域而 404 破圖
    return `${API}${url}`;
  };
  const allFaceShapes: FaceShape[] = ['round', 'oval', 'square', 'heart', 'long'];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 標題 */}
      <div className="bg-white border-b px-6 py-4">
        <h2 className="text-xl font-bold text-gray-900">臉型眼鏡推薦</h2>
        <p className="text-sm text-gray-500 mt-0.5">選擇臉型，系統推薦最適合的鏡框與隱形眼鏡</p>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* 臉型選擇：手機＝頂部橫向膠囊列（省空間）；桌機＝左側欄 */}
        <div className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r p-3 md:p-4 flex flex-col gap-2 md:overflow-y-auto shrink-0">
          <p className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">選擇臉型</p>

          {detectedFaceShape && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 md:mb-2 text-xs text-blue-700 flex items-center gap-1.5">
              <IconTarget className="w-4 h-4 flex-shrink-0" />
              AR 自動辨識：{FACE_SHAPE_LABELS[detectedFaceShape]}
            </div>
          )}

          {/* 臉型列：手機橫向滑動、桌機直立清單 */}
          <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0 -mx-1 px-1 scrollbar-none">
            {allFaceShapes.map(shape => (
              <button key={shape} onClick={() => setFaceShape(shape)}
                className={`shrink-0 md:w-full text-left px-3 py-2 md:py-3 rounded-full md:rounded-xl border transition-all ${
                  faceShape === shape
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                }`}>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {React.createElement(FACE_SHAPE_ICONS[shape], { className: 'w-5 h-5 flex-shrink-0' })}
                  <div>
                    <p className="font-semibold text-sm">{FACE_SHAPE_LABELS[shape]}</p>
                    <p className={`hidden md:block text-xs mt-0.5 ${faceShape === shape ? 'text-blue-100' : 'text-gray-400'}`}>
                      {FACE_SHAPE_DESCRIPTIONS[shape]}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 類型篩選：手機＝分段按鈕列；桌機＝直立清單 */}
          <div className="md:mt-4 md:pt-4 md:border-t flex md:block items-center gap-1.5">
            <p className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">類型篩選</p>
            {([['all', '全部'], ['glasses', '眼鏡框'], ['lens', '隱形眼鏡']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setFilterType(v)}
                className={`shrink-0 md:w-full text-center md:text-left px-3 py-1.5 md:py-2 rounded-full md:rounded-lg text-xs md:text-sm md:mb-1 border md:border-0 ${
                  filterType === v
                    ? 'bg-gray-900 text-white border-gray-900 md:bg-gray-100 md:text-gray-900 md:font-semibold'
                    : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 右側：推薦結果 */}
        <div className="flex-1 overflow-y-auto p-6">
          {!faceShape ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <IconPerson className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">請選擇臉型</p>
              <p className="text-sm mt-1">或開啟攝影機自動辨識</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">載入中...</div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-lg">目前尚無品項</p>
              <p className="text-sm mt-1">請管理員至後台上傳眼鏡圖片</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <h3 className="text-lg font-bold text-gray-900">
                  {FACE_SHAPE_LABELS[faceShape]} 推薦結果
                </h3>
                <span className="text-sm text-gray-400">{results.length} 款</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {results.map(({ item, score, reasons, warnings }) => (
                  <div key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`bg-white rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md ${
                      selectedItem?.id === item.id
                        ? 'border-blue-500 shadow-blue-100 shadow-md'
                        : 'border-gray-100 hover:border-blue-300'
                    }`}>

                    {/* 圖片 */}
                    <div className="aspect-[4/3] md:aspect-square bg-gradient-to-br from-slate-100 to-slate-300 rounded-t-2xl overflow-hidden relative">
                      <img src={imgSrc(item.image_url)} alt={item.name}
                        className="w-full h-full object-contain p-4" />

                      {/* 推薦分數 */}
                      <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                        score >= 75 ? 'bg-green-500 text-white'
                          : score >= 50 ? 'bg-yellow-400 text-white'
                          : 'bg-gray-300 text-gray-700'
                      }`}>
                        {score >= 75 ? '強推' : score >= 50 ? '適合' : '普通'}
                      </div>

                      {selectedItem?.id === item.id && (
                        <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                          <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center"><IconCheck className="w-4 h-4" /></span>
                        </div>
                      )}
                    </div>

                    {/* 資訊 */}
                    <div className="p-3">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.frame_shape && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            {FRAME_LABELS[item.frame_shape] ?? item.frame_shape}
                          </span>
                        )}
                        {item.style && (
                          <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                            {STYLE_LABELS[item.style] ?? item.style}
                          </span>
                        )}
                      </div>

                      {/* 推薦原因（教育說明） */}
                      {reasons.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          {reasons.slice(0, 1).map((r, i) => (
                            <p key={i} className="text-xs text-green-700 flex items-start gap-1">
                              <IconCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{r}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                          <IconWarning className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{warnings[0]}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 底部：已選擇提示 */}
      {selectedItem && (
        <div className="bg-blue-600 text-white px-6 py-3 flex items-center gap-3">
          <img src={imgSrc(selectedItem.image_url)} alt={selectedItem.name}
            className="w-10 h-10 object-contain bg-white/20 rounded-lg p-1" />
          <div className="flex-1">
            <p className="font-semibold text-sm">{selectedItem.name}</p>
            <p className="text-xs text-blue-200">已選擇，返回 AR 試戴頁面即可預覽</p>
          </div>
          <button onClick={() => { setSelectedItem(null); onSelectItem?.(null as any); }}
            className="text-blue-200 hover:text-white text-sm">取消</button>
        </div>
      )}
    </div>
  );
}
