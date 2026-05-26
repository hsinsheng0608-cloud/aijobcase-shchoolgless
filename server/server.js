/**
 * EduMind AI - Express Server
 * AI 課程複習助教系統 MVP
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const multer = require('multer');
const { pool } = require('./db');
const { requireAuth } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== Security ====================
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ==================== Rate Limiting ====================
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '請求過於頻繁，請稍後再試' },
});
app.use('/api', globalLimiter);

// ==================== CORS ====================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

app.use(cors({
  origin: function (origin, callback) {
    // Production: same-origin requests (no origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow localhost dev
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
    // Allow Render / Supabase / any HTTPS deploy
    if (/\.onrender\.com$/.test(origin) || /\.zeabur\.app$/.test(origin)) return callback(null, true);
    if (/\.pages\.dev$/.test(origin)) return callback(null, true);
    console.warn(`CORS 拒絕: ${origin}`);
    callback(new Error('CORS 不允許此 origin'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ==================== Body Parser ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== File Upload (Multer) ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMime = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream', // 部分上傳端（如某些瀏覽器或 curl 預設）會送這個
    ];
    const allowedExt = ['.pdf', '.docx', '.pptx', '.xlsx', '.xls'];
    // 修正檔名 UTF-8 亂碼（multer 預設以 latin1 解析）
    if (file.originalname) {
      try {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch (_) { /* keep original */ }
    }
    const ext = (file.originalname.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
    if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('僅接受 PDF、Word、PPT、Excel 檔案'), false);
    }
  },
});
app.locals.upload = upload;

// ==================== Request Logging ====================
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// ==================== Auth Middleware ====================
app.use('/api', (req, res, next) => {
  // Glasses catalog list is public (read-only product data)
  if (req.method === 'GET' && req.path === '/glasses') return next();
  return requireAuth(req, res, next);
});

// ==================== Routes ====================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/users', require('./routes/users'));
app.use('/api/ar-practice', require('./routes/ar-practice'));
app.use('/api/stats',      require('./routes/stats'));
app.use('/api/glasses',    require('./routes/glasses'));
app.use('/api/knowledge',  require('./routes/knowledge'));

// 靜態提供眼鏡圖片
app.use('/uploads/glasses', express.static(path.join(__dirname, 'uploads', 'glasses')));

// ==================== Health Check ====================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', db: 'connected' } });
  } catch (err) {
    res.status(503).json({ success: false, error: 'DB 連線失敗' });
  }
});

// ==================== Static Files (Production) ====================
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('{*path}', (req, res) => {
    // AR page has its own index.html
    if (req.path.startsWith('/ar')) {
      const arFile = path.join(clientDist, req.path.endsWith('.html') ? req.path : 'ar/index.html');
      return res.sendFile(arFile);
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ==================== Error Handler ====================
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ success: false, error: '伺服器內部錯誤' });
});

// ==================== Start Server ====================
async function startServer() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected');
  } catch (err) {
    console.warn('⚠️ Database not available:', err.message);
    console.warn('   Server will start but DB features may fail');
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 EduMind AI Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    server.close(() => {
      pool.end();
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}

startServer();
