# 💸 ExpenseAI — AI-Powered Personal Expense Tracker

> An intelligent, full-stack personal finance application leveraging Machine Learning & AI to automate expense categorization, extract transaction details from bank SMS messages, detect unusual spending anomalies, predict future monthly expenses, and generate personalized financial insights.

---

## 📖 Table of Contents
1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Objectives](#3-objectives)
4. [Key Features](#4-key-features)
5. [Phase 1 — AI Expense Categorization](#5-phase-1--ai-expense-categorization)
6. [Phase 2 — AI SMS Expense Extraction](#6-phase-2--ai-sms-expense-extraction)
7. [Phase 3 — AI Unusual Spending Detection](#7-phase-3--ai-unusual-spending-detection)
8. [Phase 4 — AI Spending Prediction](#8-phase-4--ai-spending-prediction)
9. [Phase 5 — AI Financial Insights & Recommendations](#9-phase-5--ai-financial-insights--recommendations)
10. [Complete System Architecture](#10-complete-system-architecture)
11. [Project Structure](#11-project-structure)
12. [Technology Stack](#12-technology-stack)
13. [API Documentation](#13-api-documentation)
14. [Database Design](#14-database-design)
15. [Authentication & Security](#15-authentication--security)
16. [Environment Variables](#16-environment-variables)
17. [Installation](#17-installation)
18. [Running the Project](#18-running-the-project)
19. [Testing & Verification](#19-testing--verification)
20. [Sample AI Test Scenarios](#20-sample-ai-test-scenarios)
21. [Limitations](#21-limitations)
22. [Privacy & Data Ownership](#22-privacy--data-ownership)
23. [Future Scope](#23-future-scope)
24. [Project Demo Flow](#24-project-demo-flow)

---

## 1. Project Overview

**ExpenseAI** is a modern, full-stack personal finance tracking application designed to replace tedious manual expense logging with AI-assisted automation. 

The system integrates an **Express.js API Gateway & Web Interface** backed by **MongoDB**, communicating asynchronously with a **Python FastAPI Machine Learning Microservice**. Together, they provide end-to-end expense management, automated categorization, bank SMS parsing, Isolation Forest anomaly detection, Linear Regression spending forecasting, and automated financial recommendation synthesis.

> ℹ️ **Note on SMS Processing:** ExpenseAI analyzes bank transaction SMS text **manually provided/pasted by the user** into the web interface. It does not automatically inspect or read private phone SMS messages without explicit user action.

---

## 2. Problem Statement

Traditional expense tracking applications require users to manually input transaction amounts, merchants, dates, and categories for every single purchase. Over time, this leads to user fatigue, inconsistent category tagging, and incomplete records.

Furthermore, traditional trackers fail to answer critical financial questions:
- *Am I spending abnormally more than usual this week?*
- *How much should I expect to spend next month based on past behavior?*
- *Which spending category is driving my budget depletion?*

ExpenseAI addresses these challenges by applying classical NLP and Machine Learning techniques to raw expense data, transforming unstructured transaction text into structured, actionable financial analytics.

---

## 3. Objectives

1. **Automate Categorization:** Instantly classify natural language transaction descriptions using natural language processing (NLP).
2. **Extract SMS Transactions:** Parse unstructured bank transaction SMS messages into structured records, accurately capturing amount, merchant, date, category, and transaction type (`debit` / `credit`).
3. **Detect Anomalies:** Identify unusual or excessive spending occurrences using unsupervised Machine Learning (Isolation Forest).
4. **Forecast Future Spending:** Predict next month's expected expenditure using time-series linear regression modeling.
5. **Synthesize Financial Insights:** Combine historical spending ratios, anomaly alerts, and forecasts to output prioritized recommendations.
6. **Ensure Strict Data Isolation:** Isolate all financial records per authenticated user via JWT authentication and database-level ownership checks.
7. **Deliver an Intuitive Interface:** Provide a dark-mode web dashboard featuring real-time charts, budget meters, and transaction management.

---

## 4. Key Features

### 📋 Expense Management (CRUD)
- **Add / Edit / Delete Expenses:** Create manual or AI-assisted transactions with real-time UI updates.
- **Categorization:** 10 standard categories (`Food & Dining`, `Transport`, `Shopping`, `Entertainment`, `Health`, `Utilities`, `Education`, `Housing`, `Subscriptions`, `Other`).
- **CSV Export:** Download complete transaction histories as spreadsheet-ready CSV files.

### 🔐 Authentication & Isolation
- **User Registration & Login:** Secure authentication powered by `bcryptjs` password hashing and `jsonwebtoken` (JWT).
- **User Data Isolation:** Every database operation and AI endpoint strictly validates ownership against `req.user.id`.

### 🤖 5-Phase AI Intelligence Engine
- **Phase 1:** Natural Language Expense Categorization (TF-IDF + Logistic Regression).
- **Phase 2:** SMS Expense & Income Extraction with permanent `debit` / `credit` transaction type persistence.
- **Phase 3:** Unusual Spending Detection (Isolation Forest).
- **Phase 4:** Monthly Spending Prediction (Linear Regression).
- **Phase 5:** Financial Insights Engine (Multi-Phase Data Synthesis).

---

## 5. Phase 1 — AI Expense Categorization

### Overview
Phase 1 converts natural language transaction strings (e.g., `"Paid ₹450 at Swiggy"`) into standard category predictions.

```
Transaction Text
      │
      ▼
Text Preprocessing & Lowercasing
      │
      ▼
TF-IDF Vectorizer (scikit-learn)
      │
      ▼
Logistic Regression Classifier
      │
      ▼
Predicted Category & Confidence Score
```

### Technical Implementation
- **Feature Extraction:** `TfidfVectorizer` converts transaction text into numerical n-gram token weights.
- **Classification Algorithm:** `Logistic Regression` models class probabilities across pre-trained expense categories.
- **Confidence Metric:** The system calculates a relative prediction confidence score ($0.0 - 1.0$) based on the distance between the top predicted class probability and baseline uniform probability.

> 💡 **Note on Metrics:** Prediction confidence indicates model certainty for a given sample based on feature activation; it is distinct from overall global model accuracy metrics.

---

## 6. Phase 2 — AI SMS Expense Extraction

### Overview
Phase 2 extracts structured transaction fields from raw bank notification SMS messages.

```
Pasted Bank SMS Text
      │
      ▼
Regex & Pattern Extraction Rules (Amount, Merchant, Date, Type)
      │
      ▼
Phase 1 ML Categorization (Category & Confidence)
      │
      ▼
User Review & Confirmation Card
      │
      ▼
POST /api/expenses → Persisted in MongoDB (including transactionType)
```

### Extracted Fields
- **Amount:** Extracted via regex matching INR / Rs / ₹ currency formats.
- **Merchant:** Extracted via merchant pattern matching (e.g., Swiggy, Uber, Amazon, Zomato, SBI, HDFC).
- **Date:** Extracted or defaulted to current ISO date string.
- **Transaction Type:** Permanently identifies **`debit`** (Expense) or **`credit`** (Income/Deposit).
- **Category:** Categorized via Phase 1 NLP classifier.

### Transaction Type Persistence
Every saved transaction retains its `transactionType` in MongoDB:
```json
{
  "amount": 10000,
  "merchant": "Salary",
  "category": "Other",
  "date": "2026-08-13",
  "description": "Your account has been credited with Rs. 10000 on 13-Aug-2026.",
  "transactionType": "credit",
  "aiCategorized": true,
  "aiConfidence": 0.85
}
```

---

## 7. Phase 3 — AI Unusual Spending Detection

### Overview
Phase 3 detects statistical spending anomalies using **Isolation Forest**, an unsupervised Machine Learning algorithm tailored for outlier identification.

```
Historical User Expenses (Min. 10 transactions)
      │
      ▼
Feature Engineering Matrix:
  • Expense Amount
  • Category Ratio (Amount / Category Mean)
  • User Ratio (Amount / Overall User Mean)
  • Merchant Frequency
      │
      ▼
Isolation Forest Model (contamination=0.1)
      │
      ▼
Anomaly Decision & Severity Rating (HIGH / MEDIUM / LOW)
      │
      ▼
Dashboard Alert Banner & Rule Explanation
```

### Key Considerations
- **Minimum Requirement:** Requires at least 10 recorded expenses to establish a statistical baseline.
- **Unsupervised Learning:** Isolation Forest isolates observations by randomly selecting a feature and split value. Outliers require fewer splits to isolate.
- **Scope Notice:** This feature detects unusual spending spikes relative to individual historical behavior; it is not a banking fraud detection system.

---

## 8. Phase 4 — AI Spending Prediction

### Overview
Phase 4 estimates next month's total expenditure using **Linear Regression** time-series forecasting.

```
Historical Monthly Expenses (Min. 3 distinct months)
      │
      ▼
Monthly Aggregation & Time-Index Mapping (t = 0, 1, 2...)
      │
      ▼
Ordinary Least Squares (OLS) Linear Regression
      │
      ▼
Predicted Next Month Total & Category Breakdown
      │
      ▼
Trend Analysis (Increasing / Decreasing / Stable) & Expected Range
```

### Key Considerations
- **Baseline Model:** Linear Regression provides a simple, interpretable linear trend projection.
- **Range & Non-Negative Bound:** Computes standard error bounds (`rangeMin` – `rangeMax`) and caps negative slope outputs to zero.
- **Scope Notice:** Linear Regression does not model complex seasonal spikes or holiday variations; it serves as a baseline directional spending forecast.

---

## 9. Phase 5 — AI Financial Insights & Recommendations

### Overview
Phase 5 is a data-driven synthesis engine that combines outputs from Phase 3 (Anomalies), Phase 4 (Forecasts), and historical category distributions to output prioritized recommendations.

```
Phase 3 Anomalies + Phase 4 Forecast + Category Trends
                          │
                          ▼
            Insight Synthesis Engine
                          │
                          ▼
Prioritized Recommendation Cards (HIGH, MEDIUM, LOW, POSITIVE)
```

### Insight Severities
- 🔴 **HIGH PRIORITY:** Critical budget overspending or severe spending anomalies detected.
- ⚠️ **ATTENTION (MEDIUM):** Category spending acceleration or upward budget trends.
- 💡 **SUGGESTION (LOW):** General optimization tips and savings opportunities.
- ✅ **GOOD NEWS (POSITIVE):** Healthy budget adherence and stable spending behavior.

> ⚠️ **Disclaimer:** AI Financial Insights are rule-based analytical suggestions generated for budgeting awareness and do not constitute professional financial or investment advice.

---

## 10. Complete System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER / BROWSER                                │
│                (Dashboard HTML5 / Vanilla JS / CSS)                    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTP / REST APIs (JWT Auth Header)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     EXPRESS.JS API GATEWAY (Port 3000)                 │
│  • Auth Middleware (JWT & bcrypt)   • Input Validation & Security      │
│  • Expense CRUD & Stats             • Static File Hosting              │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
      Mongoose ORM │                                  │ Async HTTP Fetch
                   ▼                                  ▼
┌─────────────────────────────────────┐  ┌──────────────────────────────┐
│          MONGODB DATABASE           │  │   FASTAPI AI MICROSERVICE    │
│            (Port 27017)             │  │         (Port 8000)          │
│  • Users Collection                 │  │  • /predict                  │
│  • Subdocument Expenses (with       │  │  • /parse-sms                │
│    transactionType: debit/credit)   │  │  • /detect-anomalies         │
└─────────────────────────────────────┘  │  • /predict-spending        │
                                         │  • /generate-insights        │
                                         └──────────────┬───────────────┘
                                                        │ Joblib Load
                                                        ▼
                                         ┌──────────────────────────────┐
                                         │   TRAINED ML MODEL ASSETS    │
                                         │  • vectorizer.pkl            │
                                         │  • expense_classifier.pkl    │
                                         └──────────────────────────────┘
```

---

## 11. Project Structure

```
Expense-AI--main/
│
├── ai-service/                  # Python FastAPI AI Microservice
│   ├── app.py                   # FastAPI routes & ML inference handlers
│   ├── train_model.py           # Model training script for Phase 1
│   ├── requirements.txt         # Python package dependencies
│   ├── data/
│   │   └── expenses.csv         # Training dataset for ML classifier
│   └── model/
│       ├── vectorizer.pkl       # Serialized TF-IDF vectorizer
│       └── expense_classifier.pkl # Serialized Logistic Regression model
│
├── app.js                       # Express.js API Gateway & MongoDB handlers
├── dashboard.html               # Main dashboard UI
├── dashboard.js                 # Frontend application logic & Chart.js rendering
├── dashboard.css                # Custom glassmorphism stylesheet
├── index.html                   # Landing & Auth page
├── frontend.js                  # Authentication modal & login logic
├── styles.css                   # Landing page stylesheet
├── package.json                 # Node.js project configuration
├── package-lock.json            # Node.js exact dependency lockfile
├── .gitignore                   # Git exclusion rules
├── .env.example                 # Environment variable template
├── test_transaction_type.js     # Integration test for transactionType persistence
├── test_security_isolation.js   # Integration test for user data isolation & security
└── README.md                    # Project documentation
```

---

## 12. Technology Stack

### Frontend
- **HTML5 & CSS3:** Responsive UI with custom CSS variables and glassmorphism styling.
- **Vanilla JavaScript (ES6+):** Async/await API calls and DOM manipulation.
- **Chart.js:** Doughnut and bar/line chart rendering.

### Backend Gateway
- **Node.js & Express.js:** RESTful API server and static asset hosting.
- **Mongoose & MongoDB:** Document object modeling and persistent storage.
- **JWT & bcryptjs:** JsonWebToken authentication and password hashing.

### AI Microservice
- **Python 3.9+ & FastAPI:** High-performance async microservice framework.
- **scikit-learn:** TF-IDF vectorization, Logistic Regression, Isolation Forest, Linear Regression.
- **NumPy & Pandas:** Data manipulation and feature matrix transformations.
- **Joblib:** Model serialization and loading.

---

## 13. API Documentation

### 1. Express API Gateway Routes (`http://localhost:3000`)

| Method | Path | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | No | Register a new user (`username`, `email`, `password`) |
| `POST` | `/api/login` | No | Authenticate user & return JWT token |
| `GET` | `/api/expenses` | **Yes** | Retrieve authenticated user's expenses |
| `POST` | `/api/expenses` | **Yes** | Add new expense (`amount`, `category`, `merchant`, `description`, `transactionType`, `date`) |
| `PUT` | `/api/expenses/:id` | **Yes** | Update an existing expense by ID |
| `DELETE` | `/api/expenses/:id` | **Yes** | Delete an expense by ID |
| `GET` | `/api/stats` | **Yes** | Get aggregate totals, monthly spending, and category distribution |
| `POST` | `/api/parse-sms` | **Yes** | Forward bank SMS string to AI service for extraction |
| `POST` | `/api/ai/categorize-expense` | **Yes** | Forward description text to AI service for Phase 1 ML classification |
| `GET` | `/api/ai/anomalies` | **Yes** | Fetch Phase 3 Isolation Forest anomaly alerts |
| `GET` | `/api/ai/spending-forecast` | **Yes** | Fetch Phase 4 Linear Regression spending forecast |
| `GET` | `/api/ai/insights` | **Yes** | Fetch Phase 5 synthesized financial insights |

### 2. FastAPI Microservice Routes (`http://localhost:8000`)

| Method | Path | Purpose | Request Body Sample | Response Body Sample |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/predict` | Phase 1 Categorization | `{"text": "Swiggy food"}` | `{"merchant": "Swiggy", "amount": 0, "category": "Food", "confidence": 0.82}` |
| `POST` | `/parse-sms` | Phase 2 SMS Extraction | `{"sms": "Debited Rs 450..."}` | `{"merchant": "Swiggy", "amount": 450, "transactionType": "debit", "category": "Food"}` |
| `POST` | `/detect-anomalies` | Phase 3 Anomaly Detection | `{"expenses": [...]}` | `{"status": "success", "anomalies": [...]}` |
| `POST` | `/predict-spending`| Phase 4 Prediction | `{"monthly_spending": [...]}`| `{"forecast": {"predictedAmount": 12500}, "trend": "stable"}` |
| `POST` | `/generate-insights`| Phase 5 Insights | `{"categorySummary": [...]}`| `{"status": "success", "insights": [...]}` |

---

## 14. Database Design

ExpenseAI stores user accounts and embedded expense records inside MongoDB.

### Mongoose Schemas (`app.js`)

```javascript
const ExpenseSchema = new mongoose.Schema({
    category:        { type: String, default: 'Other' },
    amount:          { type: Number, required: true },
    merchant:        { type: String, default: '' },
    description:     { type: String, default: '' },
    transactionType: { type: String, enum: ['debit', 'credit'], default: 'debit' },
    aiCategorized:   { type: Boolean, default: false },
    aiConfidence:    { type: Number, default: 0 },
    date:            { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email:    { type: String, required: true, unique: true },
    password: { type: String, required: true },
    budget:   { type: Number, default: 0 },
    expenses: [ExpenseSchema]
});
```

---

## 15. Authentication & Security

1. **Password Security:** Passwords are hashed using `bcryptjs` with 10 salt rounds before storage.
2. **JWT Authorization:** Requests to protected endpoints require a valid HTTP header:
   ```
   Authorization: Bearer <your_jwt_token>
   ```
3. **User Data Isolation:** All expense CRUD operations use `User.findById(req.user.id)` to prevent cross-user data leaks. Attempting to update or delete another user's expense returns `HTTP 404 Expense not found`.
4. **Security Headers:** Express middleware sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `X-XSS-Protection: 1; mode=block`.
5. **Input Validation:** Amounts are validated as positive finite numbers. Transaction types are strictly restricted to `enum ['debit', 'credit']`. Text fields are length-capped to prevent payload degradation.

---

## 16. Environment Variables

Environment settings are configured via a `.env` file in the project root.

### `.env.example` Template
```env
MONGODB_URI=mongodb://localhost:27017/expenseTracker
JWT_SECRET=your_jwt_secret_key_here
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 17. Installation

### Prerequisites
- **Node.js** (v16+) and **npm**
- **Python** (v3.9+) and **pip**
- **MongoDB** (running locally or MongoDB Atlas URI)

### Step 1: Clone / Extract Repository
```bash
cd Expense-AI--main
```

### Step 2: Install Node.js Dependencies
```bash
npm install
```

### Step 3: Set Up Python Environment for AI Service
```bash
cd ai-service
python -m venv venv
```

**Activate Environment:**
- **Windows:** `venv\Scripts\activate`
- **macOS/Linux:** `source venv/bin/activate`

### Step 4: Install Python Dependencies
```bash
pip install -r requirements.txt
cd ..
```

### Step 5: Configure Environment File
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

---

## 18. Running the Project

### Terminal 1: Start MongoDB
Ensure your MongoDB server is active:
```powershell
# Windows Service:
Start-Service MongoDB
```

### Terminal 2: Start Python AI Microservice
```bash
cd ai-service
venv\Scripts\activate
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
*(Confirms AI Microservice is running at `http://127.0.0.1:8000`)*

### Terminal 3: Start Node.js API Gateway & App
```bash
node app.js
```
*(Confirms Node Server is running at `http://localhost:3000`)*

### Open Application
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 19. Testing & Verification

The repository contains automated integration test scripts to verify system functionality, security isolation, and AI phases.

### 1. Run Transaction Type & AI Regression Test
```bash
node test_transaction_type.js
```
*Verifies: SMS debit parsing, SMS credit parsing, manual expense defaults, transactionType MongoDB persistence, and Phase 1–5 AI endpoint responses.*

### 2. Run Security & Isolation Audit Test
```bash
node test_security_isolation.js
```
*Verifies: Multi-user data isolation, ownership protection, boundary input validation (NaN/negative amounts, invalid types), security headers, and secret scanning.*

---

## 20. Sample AI Test Scenarios

### Test Scenario 1: Expense Categorization (Phase 1)
- **Input Text:** `"Paid ₹450 at Swiggy"`
- **Expected Result:** Category: `Food & Dining` | Confidence: `~0.82`

### Test Scenario 2: Debit SMS Parsing (Phase 2)
- **Input SMS:** `"Dear Customer, your account has been debited by Rs. 450 at Swiggy on 13-Aug-2026."`
- **Expected Output:** Amount: `₹450` | Merchant: `Swiggy` | Type: `debit` | Category: `Food & Dining`

### Test Scenario 3: Credit SMS Parsing (Phase 2 & Step 1 Persistence)
- **Input SMS:** `"Your account has been credited with Rs. 10000 on 13-Aug-2026."`
- **Expected Output:** Amount: `₹10,000` | Type: `credit` | Saved MongoDB Record: `{ amount: 10000, transactionType: "credit" }`

---

## 21. Limitations

- **Categorization Boundaries:** Classification accuracy relies on the vocabulary of the training dataset (`expenses.csv`). Niche merchants may default to `Other`.
- **SMS Format Sensitivity:** SMS parsing uses rule-based regex patterns optimized for standard Indian bank SMS formats. Irregularly structured text may require manual correction.
- **Anomaly Detection Requirements:** Isolation Forest anomaly detection requires at least 10 historical transactions to generate baseline statistical indicators.
- **Linear Regression Forecasting:** Linear Regression computes a directional trend line; it does not capture seasonal spikes, holidays, or unexpected major life purchases.
- **Financial Advice Disclaimer:** AI Financial Insights output data-driven budget alerts and do not represent professional financial planning or tax advice.

---

## 22. Privacy & Data Ownership

- **Data Isolation:** All transaction records remain strictly tied to individual authenticated user accounts.
- **Local Processing:** User data is processed locally across the Node.js gateway and Python microservice.
- **Secret Management:** API secrets and database connection strings are read strictly from `.env` environment variables.

---

## 23. Future Scope

- **Automated Mobile SMS Sync:** Native Android/iOS permission integration for automatic background SMS sync.
- **Receipt OCR:** Optical Character Recognition for uploading paper receipt images.
- **Advanced Forecasting:** Time-series models (Prophet / ARIMA / LSTM) for multi-month seasonal prediction.
- **Multi-Currency Support:** Automatic currency conversion and multi-currency expense tracking.

---

## 24. Project Demo Flow

1. **Register / Login:** Create an account at `http://localhost:3000` and access the dashboard.
2. **Add Manual Expense:** Click **+ Add Expense**, enter an expense description (e.g. `"Starbucks Coffee"`), and click **✨ Categorize with AI**.
3. **Parse Debit SMS:** Navigate to **SMS Parser**, paste a debit SMS (`"Debited Rs. 450 at Swiggy"`), click **Analyze SMS**, and click **Confirm & Save**.
4. **Parse Credit SMS:** Paste a credit SMS (`"Credited Rs. 10000"`), parse it, and click **Confirm & Save**.
5. **Verify Dashboard:** Observe the transaction table displaying the **`💰 Income`** badge for the credit transaction and **`💸 Expense`** badge for the debit transaction.
6. **Check AI Insights:** View the **AI Financial Insights**, **AI Unusual Spending Alerts**, and **AI Spending Forecast** cards on the dashboard.
