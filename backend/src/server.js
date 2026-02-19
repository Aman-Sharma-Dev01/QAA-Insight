import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import sheetsRoutes from './routes/sheets.js';
import analyticsRoutes from './routes/analytics.js';
import userRoutes from './routes/user.js';
import { cacheService } from './services/cache.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Compression middleware - reduces response size by ~70% for large datasets
app.use(compression({
  level: 6, // Balance between speed and compression ratio
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Rate limiting - prevent API abuse
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for heavy analytics endpoints
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // 30 requests per minute for analytics
  message: { success: false, error: 'Too many analytics requests. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting
app.use(generalLimiter);

// Middleware - Allow all localhost origins for development
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Allow any localhost/127.0.0.1 origin for development
    if (origin.match(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Increase JSON body limit for large filter payloads
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes with targeted rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/analytics', analyticsLimiter, analyticsRoutes);
app.use('/api/user', userRoutes);

// Health check with cache stats
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cache: cacheService.getStats()
  });
});

// Cache management endpoint
app.get('/api/cache/stats', (req, res) => {
  res.json({
    success: true,
    stats: cacheService.getStats()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || 'Internal server error' 
  });
});

// Connect to MongoDB and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 EduPulse Backend running on http://localhost:${PORT}`);
    console.log(`📊 Analytics API available at http://localhost:${PORT}/api/analytics`);
    console.log(`🔐 User authentication with MongoDB enabled`);
  });
}).catch((error) => {
  console.error('Failed to connect to MongoDB:', error);
  process.exit(1);
});
