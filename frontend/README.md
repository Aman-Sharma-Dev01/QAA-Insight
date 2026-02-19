
# EduPulse Analytics - College Feedback Portal

## Project Overview
EduPulse is a professional-grade analytics dashboard designed to process and visualize large-scale student feedback data (20,000 - 25,000+ responses) collected via Google Forms. 

### Key Features
- **Scalable Architecture**: Uses Google Apps Script (GAS) as a serverless backend to process 25k+ rows without overwhelming the browser.
- **Dynamic Filtering**: Multi-select filters are auto-detected from Google Sheet headers.
- **AI-Powered Insights**: Integrated with Gemini 3 Flash to provide executive summaries and strategic recommendations.
- **Secure Access**: Admin-only portal protecting private institutional data.
- **Professional Reporting**: One-click CSV exports and AI-generated text reports.

## Architecture Diagram
1. **Google Form**: Students submit feedback.
2. **Google Sheet**: Raw data is stored (Private).
3. **Google Apps Script**: API Layer. Receives filter requests, aggregates 25k rows, returns JSON summary.
4. **React Frontend**: Fetches JSON, renders Recharts, manages state.
5. **Gemini API**: Analyzes the summary JSON to provide textual insights.

## Setup Instructions

### 1. Backend (Google Apps Script)
1. Create a new Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Paste the code from `apps-script/Code.gs`.
4. Click `Deploy > New Deployment`.
5. Select `Web App`. Set "Execute as" to `Me` and "Who has access" to `Anyone`.
6. Copy the Web App URL and update `constants.ts`.

### 2. Frontend
1. Ensure `process.env.API_KEY` is set for Gemini AI.
2. Run `npm install`.
3. Run `npm start`.

## Viva/Presentation Talking Points
- **Performance**: "We offload aggregation to the cloud (GAS) so the frontend only handles summarized JSON, ensuring fluid 60fps interaction even with 50,000 rows."
- **Scalability**: "The system is agnostic to columns; it detects headers dynamically, making it usable for any department or feedback type."
- **Data Integrity**: "Direct integration with Google Sheets ensures real-time updates without manual file imports."
- **AI Integration**: "Gemini doesn't see raw student data (privacy); it analyzes the *aggregated* statistics to find patterns a human might miss."

---
*Created for College Final Year Project Excellence.*
