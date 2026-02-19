# EduPulse - College Feedback Analytics Portal

A production-ready web portal for analyzing college feedback data collected via Google Forms and stored in Google Sheets. The system handles large datasets (20,000-25,000+ rows) efficiently by performing server-side aggregation.

## Features

- **Secure Admin Authentication**: JWT-based authentication for admin access
- **Google Sheets Integration**: Connect any Google Sheet containing feedback data
- **Dynamic Filters**: Auto-detected filters based on your sheet columns (Department, Course, Year, Faculty, etc.)
- **Real-time Analytics**: View aggregated statistics, charts, and trends
- **Large Data Handling**: Server-side processing for 25k+ rows - only sends summarized JSON to frontend
- **Filtered Data View**: View and browse filtered responses with pagination
- **CSV Export**: Export filtered data or analytics summary as CSV
- **AI Insights**: Generate strategic analysis using Google Gemini AI
- **Auto-Refresh**: Optional automatic data synchronization

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│    Backend      │────▶│  Google Sheets  │
│    (React)      │     │   (Node.js)     │     │      API        │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │   Cache Layer   │
        │               │  (Node-Cache)   │
        │               └─────────────────┘
        │
        ▼
┌─────────────────┐
│   Gemini AI     │
│   (Optional)    │
└─────────────────┘
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, JWT Authentication
- **Data Source**: Google Sheets API
- **AI**: Google Gemini (optional)
- **Caching**: Node-Cache

## Prerequisites

1. Node.js 18+ installed
2. A Google Cloud project with Sheets API enabled
3. A Google Service Account with access to your sheets
4. (Optional) Gemini API key for AI insights

## Setup Instructions

### 1. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin > Service Accounts**
5. Create a new service account
6. Create a JSON key and download it
7. Share your Google Sheet with the service account email (viewer access)

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your settings:
# - JWT_SECRET: A secure random string
# - GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: Paste the entire JSON content from step 6

# Start the server
npm run dev
```

The backend will run on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment (optional)
# Edit .env.local to set:
# - VITE_GEMINI_API_KEY: Your Gemini API key (for AI insights)
# - VITE_API_URL: Backend URL (defaults to http://localhost:5000/api)

# Start development server
npm run dev
```

The frontend will run on `http://localhost:5173`

### 4. Login Credentials

Default admin credentials:
- **Username**: admin
- **Password**: admin123

(Change these in backend `.env` for production)

## Google Sheet Format

Your feedback sheet should have:

1. **First row**: Column headers
2. **Filterable columns**: Columns containing categorical data like:
   - Department, Course, Year, Section, Semester
   - Faculty, Teacher, Professor, Subject
   - Gender, Branch, Batch, Division, Program

3. **Question columns**: Columns with Likert-scale responses:
   - "Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"
   - Or numeric scores: 1, 2, 3, 4, 5
   - Or: "Excellent", "Very Good", "Good", "Satisfactory", "Poor"

### Example Sheet Structure

| Timestamp | Department | Course | Year | Faculty | Q1: Clarity? | Q2: Content? |
|-----------|------------|--------|------|---------|--------------|--------------|
| 2024-01-15 | Computer Science | B.Tech | 2nd Year | Dr. Smith | Strongly Agree | Agree |
| 2024-01-15 | Electronics | M.Tech | 1st Year | Prof. Johnson | Agree | Neutral |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - Logout

### Sheets Management
- `POST /api/sheets/validate` - Validate a sheet URL
- `POST /api/sheets/add` - Add a new sheet source
- `GET /api/sheets/list` - List saved sheets
- `DELETE /api/sheets/:id` - Remove a sheet
- `POST /api/sheets/refresh-cache` - Clear cached data

### Analytics
- `POST /api/analytics/metadata` - Get sheet headers and filter options
- `POST /api/analytics/aggregate` - Get aggregated analytics with filters
- `POST /api/analytics/filtered-data` - Get paginated filtered raw data
- `POST /api/analytics/export` - Get all filtered data for CSV export

## Alternative: Google Apps Script Deployment

If you prefer a serverless approach, you can deploy the Apps Script backend instead:

1. Go to [script.google.com](https://script.google.com)
2. Create new project
3. Paste the code from `frontend/apps-script/Code.gs`
4. Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone
5. Copy the Web App URL
6. Update frontend to use Apps Script URL instead of Node.js backend

## Project Structure

```
MRU-Feedback-Data-Filter-Tool/
├── backend/
│   ├── src/
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT authentication
│   │   ├── routes/
│   │   │   ├── auth.js         # Auth endpoints
│   │   │   ├── sheets.js       # Sheet management
│   │   │   └── analytics.js    # Analytics endpoints
│   │   ├── services/
│   │   │   ├── googleSheets.js # Google Sheets API
│   │   │   ├── analytics.js    # Data aggregation
│   │   │   └── cache.js        # Caching service
│   │   └── server.js           # Express server
│   ├── .env                    # Environment variables
│   └── package.json
│
├── frontend/
│   ├── components/
│   │   ├── Dashboard.tsx       # Main dashboard
│   │   ├── Login.tsx           # Login form
│   │   ├── StatsCards.tsx      # Statistics cards
│   │   ├── AnalyticsCharts.tsx # Chart visualizations
│   │   └── FilteredDataTable.tsx # Data table view
│   ├── services/
│   │   ├── dataService.ts      # API client
│   │   └── geminiService.ts    # Gemini AI service
│   ├── apps-script/
│   │   └── Code.gs             # Google Apps Script backend
│   ├── App.tsx
│   ├── types.ts
│   ├── constants.ts
│   └── package.json
│
└── README.md
```

## Performance Considerations

**Optimized for 20K-25K responses** with the following features:

### Caching Strategy
| Data Type | Cache TTL | Description |
|-----------|-----------|-------------|
| Raw sheet data | 10 minutes | Caches full dataset from Google Sheets |
| Metadata | 10 minutes | Headers and filter options |
| Analytics | 5 minutes | Computed aggregations |
| Filtered data | 3 minutes | Filter results for pagination |

### Optimizations
- **Background refresh**: Cache refreshes automatically before expiration
- **Raw data caching**: Google Sheets API called only on cache miss
- **Optimized filtering**: O(1) Set lookups instead of O(n) array searches
- **Response compression**: ~70% smaller responses for large datasets
- **Rate limiting**: 100 req/min general, 30 req/min for analytics
- **Deduplication**: Prevents duplicate simultaneous API calls
- **Memory-efficient transformation**: Pre-allocated arrays, Object.create(null)

### Expected Performance
| Scenario | Response Time |
|----------|---------------|
| Cached request | < 100ms |
| First request (25K rows) | 3-8 seconds |
| Filter change (cached) | < 50ms |
| Pagination (cached) | < 20ms |

- **Pagination**: Filtered data is paginated (50 rows per page)
- **Server-side aggregation**: All heavy computations happen on the backend
- **Efficient data transfer**: Only aggregated JSON is sent to frontend

## Security

- JWT-based authentication with 24h expiration
- Protected API routes
- Google Sheets accessed via service account (no credentials in frontend)
- Environment variables for sensitive configuration

## Troubleshooting

### "Cannot access sheet" error
- Ensure the sheet is shared with the service account email
- Check that the sheet URL is correct

### "Failed to connect to server" error
- Make sure backend is running on port 5000
- Check CORS settings if using different domains

### Filters not showing
- Ensure your sheet has columns with filter-related keywords
- Check that column values are consistent (no typos)

## License

MIT License - Feel free to use for your college project!
