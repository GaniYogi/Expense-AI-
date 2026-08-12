# 💸 ExpenseAI

> Smart, AI-powered expense tracking for effortless financial management.

---

## 📖 About

ExpenseAI is an intelligent expense management system designed to simplify the way you track, analyze, and optimize your spending. Leveraging the power of AI and automation, it categorizes expenses, provides insightful analytics, and helps you make smarter financial decisions — all with minimal manual effort.

Built with **Node.js + Express + MongoDB** on the backend and pure **Vanilla JS + HTML/CSS** on the frontend. No build step required.

---

## ✅ Key Features

- 🤖 **AI-Powered Categorization** — Powered by Google Gemini 1.5 Flash, with a smart keyword fallback (no API key required)
- 📱 **SMS Parser** — Paste any Indian bank debit SMS and auto-extract the amount and category
- 📊 **Visual Analytics** — Interactive doughnut and bar/line charts for category breakdown and monthly trends
- 🎯 **Budget Tracking** — Set a monthly budget, track progress, and get smart spending tips
- ⬇️ **CSV Export** — Download all expenses as a spreadsheet-ready CSV file
- ✏️ **Full CRUD** — Add, edit, and delete expenses with instant UI updates
- 🔐 **JWT Auth** — Secure login/signup with bcrypt password hashing
- 🌙 **Premium Dark UI** — Glassmorphism design with smooth animations

---

## 🛠️ Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Backend    | Node.js, Express.js                 |
| Database   | MongoDB, Mongoose                   |
| Auth       | JWT (jsonwebtoken), bcryptjs        |
| AI         | Google Gemini 1.5 Flash             |
| Frontend   | Vanilla JS, HTML5, CSS3             |
| Charts     | Chart.js (CDN)                      |
| Fonts      | Inter (Google Fonts)                |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

```bash
node -v        # v16 or higher
npm -v         # v8 or higher
mongod --version   # MongoDB v5 or higher
```

### 1. Clone / Extract the Project

```bash
cd C:\Users\ganiy\OneDrive\Desktop\project\Expense-AI--main
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create or edit the `.env` file in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/expenseTracker
JWT_SECRET=expenseai_jwt_secret_key_2024_secure
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

> **Note:** `GEMINI_API_KEY` is optional. The app uses a smart keyword fallback if no key is provided.  
> Get a free key at: https://aistudio.google.com/app/apikey

### 4. Start MongoDB

**Windows (as a service):**
```powershell
Start-Service MongoDB
```

**Or manually:**
```bash
mongod --dbpath "C:\data\db"
```

### 5. Run the Server

**Development (with auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

### 6. Open in Browser

| URL | Page |
|-----|------|
| http://localhost:3000 | Landing Page / Login |
| http://localhost:3000/dashboard | Dashboard (requires login) |

---

## 📁 Project Structure

```
Expense-AI--main/
├── app.js              # Express server — all API routes & DB logic
├── index.html          # Landing page with auth modal
├── dashboard.html      # Main dashboard (5 sections)
├── dashboard.css       # Premium dark-mode CSS design system
├── dashboard.js        # All dashboard logic — charts, CRUD, AI, SMS
├── .env                # Environment variables (not committed)
├── package.json        # Project metadata & dependencies
└── README.md           # This file
```

---

## 🔌 API Endpoints

All protected endpoints require the header:
```
Authorization: Bearer <token>
```

| Method   | Route                    | Auth | Description                        |
|----------|--------------------------|------|------------------------------------|
| POST     | /api/register            | No   | Register a new user                |
| POST     | /api/login               | No   | Login → returns JWT token          |
| POST     | /api/expenses            | Yes  | Add a new expense                  |
| GET      | /api/expenses            | Yes  | Get all expenses (newest first)    |
| PUT      | /api/expenses/:id        | Yes  | Edit an existing expense           |
| DELETE   | /api/expenses/:id        | Yes  | Delete an expense                  |
| GET      | /api/stats               | Yes  | Dashboard stats + chart data       |
| GET      | /api/expenses/export     | Yes  | Download expenses as CSV           |
| GET      | /api/budget              | Yes  | Get current monthly budget         |
| POST     | /api/budget              | Yes  | Set/update monthly budget          |
| POST     | /api/ai-categorize       | Yes  | AI-detect category from description|
| POST     | /api/parse-sms           | Yes  | Extract amount + category from SMS |

### Example: Add Expense

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 350, "category": "Food & Dining", "description": "Swiggy dinner", "date": "2026-08-12"}'
```

### Example: AI Categorize

```bash
curl -X POST http://localhost:3000/api/ai-categorize \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"description": "Monthly Netflix subscription"}'
```

---

## 🧪 Quick Test (PowerShell)

```powershell
# Login and get token
$resp = Invoke-WebRequest -Uri "http://localhost:3000/api/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"username":"your_username","password":"your_password"}' `
  -UseBasicParsing
$token = ($resp.Content | ConvertFrom-Json).token

# Add an expense
Invoke-WebRequest -Uri "http://localhost:3000/api/expenses" `
  -Method POST -ContentType "application/json" `
  -Headers @{"Authorization"="Bearer $token"} `
  -Body '{"amount":299,"category":"Transport","description":"Uber ride"}' `
  -UseBasicParsing

# Check stats
Invoke-WebRequest -Uri "http://localhost:3000/api/stats" `
  -Headers @{"Authorization"="Bearer $token"} `
  -UseBasicParsing
```

---

## 📦 Scripts

```bash
npm run dev    # Start with nodemon (auto-restart on file changes)
npm start      # Start normally with node
```

---

## 🤖 AI Categorization

The app supports two modes:

1. **Google Gemini 1.5 Flash** — Set `GEMINI_API_KEY` in `.env` for true AI categorization
2. **Smart Keyword Fallback** — Works automatically without any API key, using keyword matching for 9 categories including all major Indian apps (Swiggy, Zomato, Uber, Ola, Amazon, Flipkart, Netflix, Jio, etc.)

---

## 🏦 Supported SMS Formats (SMS Parser)

Works with debit notifications from:

- **Banks:** HDFC, SBI, ICICI, Axis, Kotak, Yes Bank, PNB, BOB
- **UPI Apps:** PhonePe, Google Pay, Paytm
- **Wallets:** Amazon Pay, Mobikwik

**Example SMS:**
```
Your HDFC Bank account XXXX7890 has been debited Rs.850 for Swiggy order.
Available balance: Rs.25,000.
```

---

## 🔐 Security

- Passwords hashed with **bcryptjs** (10 salt rounds)
- Auth via **JWT** tokens (24-hour expiry)
- Each user's expenses are fully isolated in MongoDB
- Environment variables kept out of source code via `.env`

---

## 🌍 Why ExpenseAI?

Managing expenses shouldn't be a hassle. With ExpenseAI, you get a smarter, faster, and more intuitive way to handle your finances — powered by AI-driven intelligence.

Let ExpenseAI take control of your finances while you focus on what matters most! 🚀
