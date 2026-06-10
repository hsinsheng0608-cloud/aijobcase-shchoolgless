import { useState, useEffect } from 'react';
import { IconCheck, IconX, IconWarning } from './Icons';

const API = import.meta.env.VITE_API_URL || '';
const getToken = () => localStorage.getItem('edumind_token') ?? '';

interface QuizItem {
  id: string;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
}

type Phase = 'setup' | 'quiz' | 'result';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function QuizPage() {
  const token = getToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [phase, setPhase] = useState<Phase>('setup');
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quizError, setQuizError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/exams/qa-categories`, { headers: authHeader })
      .then(r => r.json())
      .then(d => { if (d.success) setCategories(d.data); });
  }, []);

  async function startQuiz() {
    setLoading(true);
    setQuizError('');
    try {
      const params = new URLSearchParams({ count: String(questionCount) });
      if (selectedCategory) params.set('category', selectedCategory);
      const r = await fetch(`${API}/api/exams/qa-quiz?${params}`, { headers: authHeader });
      const d = await r.json();
      if (d.success && d.data.length > 0) {
        setQuiz(d.data);
        setAnswers(new Array(d.data.length).fill(null));
        setCurrent(0);
        setConfirmed(false);
        setPhase('quiz');
      } else {
        setQuizError(d.success ? '此分類題目不足，請換個分類或減少題數。' : (d.error || '載入題目失敗，請稍後再試。'));
      }
    } catch {
      setQuizError('網路連線失敗，請檢查網路後再試。');
    } finally {
      setLoading(false);
    }
  }

  function selectOption(idx: number) {
    if (confirmed) return;
    const next = [...answers];
    next[current] = idx;
    setAnswers(next);
  }

  function confirmAnswer() {
    if (answers[current] === null) return;
    setConfirmed(true);
  }

  function next() {
    if (current + 1 >= quiz.length) {
      setPhase('result');
    } else {
      setCurrent(c => c + 1);
      setConfirmed(false);
    }
  }

  const correctCount = answers.filter((a, i) => a === quiz[i]?.correctIndex).length;
  const accuracy = quiz.length > 0 ? Math.round(correctCount / quiz.length * 100) : 0;

  // ── Setup Screen ──
  if (phase === 'setup') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">知識測驗</h1>
        <p className="text-sm text-slate-500 mb-8">從題庫隨機抽題，測試視光專業知識</p>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          {/* 分類選擇 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">選擇分類</label>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
                 style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <button
                onClick={() => setSelectedCategory('')}
                className={`flex-shrink-0 text-sm px-4 py-2 rounded-full border transition-all whitespace-nowrap ${
                  selectedCategory === ''
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'text-slate-600 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                }`}>
                全部 <span className="opacity-70">({categories.reduce((s, c) => s + Number(c.count), 0)})</span>
              </button>
              {categories.map(c => (
                <button key={c.category}
                  onClick={() => setSelectedCategory(c.category)}
                  className={`flex-shrink-0 text-sm px-4 py-2 rounded-full border transition-all whitespace-nowrap ${
                    selectedCategory === c.category
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'text-slate-600 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}>
                  {c.category} <span className="opacity-70">({c.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* 題數選擇 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">題目數量</label>
            <div className="flex gap-2">
              {[5, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setQuestionCount(n)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                    questionCount === n
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'text-slate-600 border-slate-200 hover:border-indigo-400'
                  }`}>
                  {n} 題
                </button>
              ))}
            </div>
          </div>

          {quizError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{quizError}</div>
          )}
          <button
            onClick={startQuiz}
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {loading ? '載入題目中...' : '開始測驗 →'}
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz Screen ──
  if (phase === 'quiz') {
    const item = quiz[current];
    const chosen = answers[current];
    const isCorrect = chosen === item.correctIndex;

    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-slate-500 font-medium">
            第 {current + 1} / {quiz.length} 題
          </span>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">
            {item.category}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all"
            style={{ width: `${((current + (confirmed ? 1 : 0)) / quiz.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <p className="text-base font-semibold text-slate-900 leading-relaxed">{item.question}</p>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {item.options.map((opt, i) => {
            let cls = 'border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50';
            if (chosen === i) cls = 'border-indigo-500 bg-indigo-50 text-indigo-900';
            if (confirmed) {
              if (i === item.correctIndex) cls = 'border-green-500 bg-green-50 text-green-900';
              else if (chosen === i && !isCorrect) cls = 'border-red-400 bg-red-50 text-red-800';
              else cls = 'border-slate-100 text-slate-400';
            }

            return (
              <button key={i}
                onClick={() => selectOption(i)}
                disabled={confirmed}
                className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 transition-all ${cls}`}>
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                  confirmed && i === item.correctIndex ? 'bg-green-500 text-white' :
                  confirmed && chosen === i && !isCorrect ? 'bg-red-400 text-white' :
                  chosen === i ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {OPTION_LABELS[i]}
                </span>
                <span className="text-sm leading-relaxed">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {confirmed && (
          <div className={`rounded-xl p-4 mb-4 ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <p className={`font-semibold text-sm mb-1 flex items-center gap-1.5 ${isCorrect ? 'text-green-800' : 'text-amber-800'}`}>
              {isCorrect ? <IconCheck className="w-4 h-4" /> : <IconX className="w-4 h-4" />}
              {isCorrect ? '答對了！' : '答錯了'}
            </p>
            {!isCorrect && (
              <p className="text-xs text-amber-700">
                正確答案：<span className="font-semibold">{OPTION_LABELS[item.correctIndex]}</span>
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {!confirmed ? (
          <button
            onClick={confirmAnswer}
            disabled={chosen === null}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
            確認作答
          </button>
        ) : (
          <button
            onClick={next}
            className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-900 transition-colors">
            {current + 1 >= quiz.length ? '查看結果' : '下一題 →'}
          </button>
        )}
      </div>
    );
  }

  // ── Result Screen ──
  const grade = accuracy >= 80 ? { label: '優秀', color: 'text-green-600', bg: 'bg-green-50' }
    : accuracy >= 60 ? { label: '良好', color: 'text-indigo-600', bg: 'bg-indigo-50' }
    : { label: '繼續加油', color: 'text-amber-600', bg: 'bg-amber-50' };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Score card */}
      <div className={`${grade.bg} rounded-2xl p-8 text-center mb-6`}>
        <p className={`text-5xl font-bold ${grade.color} mb-1`}>{accuracy}%</p>
        <p className={`text-lg font-semibold ${grade.color} mb-1`}>{grade.label}</p>
        <p className="text-sm text-slate-500">{quiz.length} 題中答對 {correctCount} 題</p>
      </div>

      {/* Review list */}
      <h3 className="text-base font-bold text-slate-700 mb-3">答題回顧</h3>
      <div className="space-y-3">
        {quiz.map((item, i) => {
          const correct = answers[i] === item.correctIndex;
          return (
            <div key={item.id} className={`bg-white rounded-xl border p-4 ${correct ? 'border-green-200' : 'border-red-200'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                  correct ? 'bg-green-500 text-white' : 'bg-red-400 text-white'
                }`}>
                  {correct ? <IconCheck className="w-3.5 h-3.5" /> : <IconX className="w-3.5 h-3.5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 mb-1.5">{item.question}</p>
                  {!correct && (
                    <p className="text-xs text-slate-500 mb-1">
                      你選了：<span className="text-red-600">{OPTION_LABELS[answers[i] as number]}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    正確：<span className="text-green-700 font-medium">{OPTION_LABELS[item.correctIndex]}. </span>
                    <span className="text-slate-600">{item.options[item.correctIndex].slice(0, 80)}{item.options[item.correctIndex].length > 80 ? '...' : ''}</span>
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Retry */}
      <div className="flex gap-3 mt-6">
        <button onClick={() => setPhase('setup')}
          className="flex-1 border border-slate-200 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-50 transition-colors">
          重新設定
        </button>
        <button onClick={startQuiz}
          className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors">
          再測一次
        </button>
      </div>
    </div>
  );
}
