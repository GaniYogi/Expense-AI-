require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const path     = require('path');

// ── Schemas ───────────────────────────────────────────────────────────────────
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

const User = mongoose.model('User', UserSchema);

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(bodyParser.json());

// ── Security Headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(express.static(path.join(__dirname)));

// ── Auth middleware ───────────────────────────────────────────────────────────
const auth = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.sendStatus(401);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('CRITICAL: JWT_SECRET environment variable is missing.');
        return res.status(500).json({ error: 'Server authentication configuration error.' });
    }
    jwt.verify(token, secret, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// ── Register ──────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ error: 'All fields are required' });
        if (typeof password !== 'string' || password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username: username.trim(), email: email.trim(), password: hashed });
        await user.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(409).json({ error: `That ${field} is already taken. Please login or use a different ${field}.` });
        }
        res.status(500).json({ error: 'An error occurred during registration.' });
    }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
        const trimmed = username.trim();
        const user = await User.findOne({
            username: { $regex: new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
        });
        if (!user) return res.status(400).json({ error: 'User not found. Please check your username or sign up.' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('CRITICAL: JWT_SECRET environment variable is missing.');
            return res.status(500).json({ error: 'Server authentication configuration error.' });
        }
        const token = jwt.sign({ id: user._id, username: user.username }, secret, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: 'An error occurred during login.' });
    }
});

// ── Add expense ───────────────────────────────────────────────────────────────
app.post('/api/expenses', auth, async (req, res) => {
    try {
        const { category, amount, description, merchant, aiCategorized, aiConfidence, date, transactionType } = req.body;
        const parsedAmount = parseFloat(amount);
        if (amount === undefined || amount === null || isNaN(parsedAmount) || parsedAmount <= 0 || !isFinite(parsedAmount)) {
            return res.status(400).json({ error: 'Valid positive amount is required' });
        }
        
        const type = transactionType || 'debit';
        if (!['debit', 'credit'].includes(type)) {
            return res.status(400).json({ error: 'Invalid transactionType. Must be debit or credit.' });
        }

        const safeDescription = typeof description === 'string' ? description.slice(0, 2000) : '';
        const safeMerchant    = typeof merchant === 'string' ? merchant.slice(0, 200) : '';
        const safeCategory    = typeof category === 'string' ? category.slice(0, 100) : 'Other';

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.expenses.push({
            category:        safeCategory || 'Other',
            amount:          parsedAmount,
            merchant:        safeMerchant,
            description:     safeDescription,
            transactionType: type,
            aiCategorized:   Boolean(aiCategorized),
            aiConfidence:    aiConfidence && !isNaN(parseFloat(aiConfidence)) ? parseFloat(aiConfidence) : 0,
            date:            date && !isNaN(new Date(date).getTime()) ? new Date(date) : new Date()
        });
        await user.save();
        const added = user.expenses[user.expenses.length - 1];
        res.status(201).json(added);
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while adding the expense.' });
    }
});

// ── Get expenses ──────────────────────────────────────────────────────────────
app.get('/api/expenses', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const sorted = [...user.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(sorted);
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while fetching expenses.' });
    }
});

// ── Edit expense ──────────────────────────────────────────────────────────────
app.put('/api/expenses/:id', auth, async (req, res) => {
    try {
        const { category, amount, description, merchant, aiCategorized, aiConfidence, date, transactionType } = req.body;
        if (amount !== undefined) {
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0 || !isFinite(parsedAmount)) {
                return res.status(400).json({ error: 'Valid positive amount is required' });
            }
        }
        if (transactionType !== undefined && !['debit', 'credit'].includes(transactionType)) {
            return res.status(400).json({ error: 'Invalid transactionType. Must be debit or credit.' });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const expense = user.expenses.id(req.params.id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        if (category)                       expense.category        = typeof category === 'string' ? category.slice(0, 100) : expense.category;
        if (amount !== undefined)           expense.amount          = parseFloat(amount);
        if (merchant !== undefined)         expense.merchant        = typeof merchant === 'string' ? merchant.slice(0, 200) : '';
        if (description !== undefined)      expense.description     = typeof description === 'string' ? description.slice(0, 2000) : '';
        if (transactionType !== undefined)  expense.transactionType = transactionType;
        if (aiCategorized !== undefined)    expense.aiCategorized   = Boolean(aiCategorized);
        if (aiConfidence !== undefined)     expense.aiConfidence    = parseFloat(aiConfidence) || 0;
        if (date && !isNaN(new Date(date).getTime())) expense.date   = new Date(date);

        await user.save();
        res.json(expense);
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while updating the expense.' });
    }
});

// ── Delete expense ────────────────────────────────────────────────────────────
app.delete('/api/expenses/:id', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const expense = user.expenses.id(req.params.id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });
        user.expenses.pull({ _id: req.params.id });
        await user.save();
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const expenses = user.expenses;
        const now = new Date();
        const cm = now.getMonth(), cy = now.getFullYear();

        const total = expenses.reduce((s, e) => s + e.amount, 0);
        const thisMonthExp = expenses.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === cm && d.getFullYear() === cy;
        });
        const thisMonth = thisMonthExp.reduce((s, e) => s + e.amount, 0);

        const allCategories = expenses.reduce((acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + e.amount;
            return acc;
        }, {});

        const monthCategories = thisMonthExp.reduce((acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + e.amount;
            return acc;
        }, {});

        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
            const d  = new Date(cy, cm - i, 1);
            const m  = d.getMonth(), y = d.getFullYear();
            const lbl = d.toLocaleString('default', { month: 'short' }) + " '" + String(y).slice(-2);
            const mt = expenses
                .filter(e => { const ed = new Date(e.date); return ed.getMonth() === m && ed.getFullYear() === y; })
                .reduce((s, e) => s + e.amount, 0);
            last6Months.push({ label: lbl, total: mt });
        }

        const topCategory = Object.entries(allCategories).sort((a, b) => b[1] - a[1])[0];

        res.json({
            total, thisMonth,
            count: expenses.length,
            thisMonthCount: thisMonthExp.length,
            allCategories, monthCategories, last6Months,
            topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null,
            budget: user.budget || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Monthly report ────────────────────────────────────────────────────────────
app.get('/api/monthly-report', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const cm = new Date().getMonth(), cy = new Date().getFullYear();
        const monthly = user.expenses.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === cm && d.getFullYear() === cy;
        });
        const categories = monthly.reduce((acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + e.amount;
            return acc;
        }, {});
        res.json({ total: monthly.reduce((s, e) => s + e.amount, 0), categories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── CSV Export ────────────────────────────────────────────────────────────────
app.get('/api/expenses/export', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const sorted = [...user.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
        const csv = [
            'Date,Category,Amount (INR),Description',
            ...sorted.map(e =>
                `${new Date(e.date).toLocaleDateString('en-IN')},${e.category},${e.amount},"${(e.description || '').replace(/"/g, '""')}"`)
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="expenses-${new Date().toISOString().slice(0,10)}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Budget GET ────────────────────────────────────────────────────────────────
app.get('/api/budget', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({ budget: user.budget || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Budget POST ───────────────────────────────────────────────────────────────
app.post('/api/budget', auth, async (req, res) => {
    try {
        const { budget } = req.body;
        if (budget === undefined || isNaN(budget))
            return res.status(400).json({ error: 'Valid budget amount required' });
        await User.findByIdAndUpdate(req.user.id, { budget: parseFloat(budget) });
        res.json({ budget: parseFloat(budget), message: 'Budget updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── AI SMS Parse ──────────────────────────────────────────────────────────────
app.post('/api/parse-sms', auth, async (req, res) => {
    const sms = req.body.sms || req.body.message;
    if (!sms || typeof sms !== 'string' || !sms.trim()) {
        return res.status(400).json({ error: 'Please paste an SMS first.' });
    }
    if (sms.length > 5000) {
        return res.status(400).json({ error: 'SMS text is too long (max 5000 characters).' });
    }

    try {
        const aiSmsUrl = process.env.AI_SMS_URL || 'http://127.0.0.1:8000/parse-sms';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(aiSmsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sms: sms.trim() }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.detail || '⚠️ Could not detect a valid transaction. Please check the SMS.'
            });
        }

        const data = await response.json();

        if (!data.amount || data.amount <= 0) {
            return res.status(400).json({
                error: 'Could not detect transaction amount.',
                partialData: data
            });
        }

        // Duplicate protection check
        const user = await User.findById(req.user.id);
        const existingExpenses = user ? user.expenses : [];
        const isDuplicate = existingExpenses.some(e => {
            const sameAmount = Math.abs(e.amount - data.amount) < 0.01;
            const sameMerchant = data.merchant && e.merchant && e.merchant.toLowerCase() === data.merchant.toLowerCase();
            const sameDate = e.date && new Date(e.date).toISOString().slice(0, 10) === data.date;
            const sameRaw = e.description && e.description.includes(data.rawText.substring(0, 30));
            return (sameAmount && sameMerchant && sameDate) || (sameAmount && sameRaw);
        });

        return res.json({
            ...data,
            isDuplicate,
            duplicateWarning: isDuplicate ? '⚠️ This transaction may already exist.' : null
        });
    } catch (err) {
        console.error('AI SMS Parse Error:', err.message);
        return res.status(503).json({
            error: '⚠️ AI service unavailable. Please make sure the Python AI service is running.'
        });
    }
});

// ── Real AI Categorize (FastAPI ML Service) ──────────────────────────────────
app.post('/api/ai/categorize-expense', auth, async (req, res) => {
    const input = req.body.description || req.body.text || req.body.message;
    if (!input || typeof input !== 'string' || !input.trim()) {
        return res.status(400).json({ error: 'Description or expense text is required' });
    }

    try {
        const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000/predict';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(aiServiceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: input.trim() }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.detail || 'AI service prediction failed.'
            });
        }

        const data = await response.json();
        return res.json({
            merchant:   data.merchant || 'Unknown',
            amount:     data.amount || 0,
            category:   data.category || 'Other',
            confidence: data.confidence || 0.80
        });
    } catch (err) {
        console.error('AI Service connection error:', err.message);
        return res.status(503).json({
            error: '⚠️ AI service is unavailable. Please make sure the Python AI service is running on port 8000.'
        });
    }
});

// ── AI Anomaly Detection (Isolation Forest Service) ───────────────────────────
app.get('/api/ai/anomalies', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const expenses = user ? user.expenses : [];

        if (!expenses || expenses.length < 10) {
            return res.json({
                status: 'insufficient_data',
                message: 'Add at least 10 expenses to enable AI unusual spending detection.',
                totalAnalyzed: expenses ? expenses.length : 0,
                anomalyCount: 0,
                anomalies: []
            });
        }

        const formattedExpenses = expenses.map(e => ({
            id:          e._id.toString(),
            amount:      e.amount,
            category:    e.category,
            merchant:    e.merchant || 'Unknown',
            date:        e.date ? new Date(e.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            description: e.description || ''
        }));

        const aiAnomalyUrl = process.env.AI_ANOMALY_URL || 'http://127.0.0.1:8000/detect-anomalies';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(aiAnomalyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expenses: formattedExpenses }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.detail || '⚠️ AI spending analysis is currently unavailable.'
            });
        }

        const data = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('AI Anomaly Detection Error:', err.message);
        return res.status(503).json({
            error: '⚠️ AI spending analysis is currently unavailable. Please make sure the Python AI service is running.'
        });
    }
});

// ── AI Spending Prediction (Linear Regression Service) ────────────────────────
app.get('/api/ai/spending-forecast', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const expenses = user ? user.expenses : [];

        if (!expenses || expenses.length === 0) {
            return res.json({
                status: 'insufficient_data',
                message: 'No spending data available. Add expenses to generate a forecast.',
                categoryForecasts: []
            });
        }

        // Aggregate by calendar month YYYY-MM
        const monthlyMap = {};
        const categoryMonthlyMap = {};

        expenses.forEach(e => {
            const dateObj = e.date ? new Date(e.date) : new Date();
            const monthStr = dateObj.toISOString().slice(0, 7);
            const amount = e.amount || 0;
            const cat = e.category || 'Other';

            monthlyMap[monthStr] = (monthlyMap[monthStr] || 0) + amount;

            if (!categoryMonthlyMap[cat]) categoryMonthlyMap[cat] = {};
            categoryMonthlyMap[cat][monthStr] = (categoryMonthlyMap[cat][monthStr] || 0) + amount;
        });

        const distinctMonths = Object.keys(monthlyMap);
        if (distinctMonths.length < 3) {
            return res.json({
                status: 'insufficient_data',
                message: 'Add at least 3 months of historical expenses to generate a reliable spending forecast.',
                distinctMonthsCount: distinctMonths.length,
                categoryForecasts: []
            });
        }

        const monthlySpending = Object.entries(monthlyMap).map(([month, amount]) => ({ month, amount }));
        const categoryMonthly = {};
        Object.entries(categoryMonthlyMap).forEach(([cat, months]) => {
            categoryMonthly[cat] = Object.entries(months).map(([month, amount]) => ({ month, amount }));
        });

        const aiForecastUrl = process.env.AI_FORECAST_URL || 'http://127.0.0.1:8000/predict-spending';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(aiForecastUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                monthly_spending: monthlySpending,
                category_monthly: categoryMonthly
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.detail || '⚠️ AI spending forecast is currently unavailable.'
            });
        }

        const data = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('AI Spending Forecast Error:', err.message);
        return res.status(503).json({
            error: '⚠️ AI spending forecast is currently unavailable. Please make sure the Python AI service is running.'
        });
    }
});

// ── AI Financial Insights Engine (Phase 5) ────────────────────────────────────
app.get('/api/ai/insights', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const expenses = user ? user.expenses : [];

        if (!expenses || expenses.length < 2) {
            return res.json({
                status: 'insufficient_data',
                message: 'Keep tracking your expenses. AI financial insights will become more useful as you add more spending history.',
                insights: []
            });
        }

        const now = new Date();
        const currentMonthKey = now.toISOString().slice(0, 7);

        const monthlyTotals = {};
        const categoryCurrent = {};
        const categoryMonthlyMap = {};

        expenses.forEach(e => {
            const dateObj = e.date ? new Date(e.date) : new Date();
            const monthStr = dateObj.toISOString().slice(0, 7);
            const amt = e.amount || 0;
            const cat = e.category || 'Other';

            monthlyTotals[monthStr] = (monthlyTotals[monthStr] || 0) + amt;

            if (monthStr === currentMonthKey) {
                categoryCurrent[cat] = (categoryCurrent[cat] || 0) + amt;
            }

            if (!categoryMonthlyMap[cat]) categoryMonthlyMap[cat] = {};
            categoryMonthlyMap[cat][monthStr] = (categoryMonthlyMap[cat][monthStr] || 0) + amt;
        });

        const currentMonthlyTotal = monthlyTotals[currentMonthKey] || 0;
        const allMonthlyValues = Object.values(monthlyTotals);
        const avgMonthlyTotal = allMonthlyValues.length > 0 
            ? (allMonthlyValues.reduce((a, b) => a + b, 0) / allMonthlyValues.length) 
            : currentMonthlyTotal;

        const categorySummary = Object.keys({ ...categoryCurrent, ...categoryMonthlyMap }).map(cat => {
            const curr = categoryCurrent[cat] || 0;
            const months = categoryMonthlyMap[cat] ? Object.values(categoryMonthlyMap[cat]) : [];
            const avg = months.length > 0 ? (months.reduce((a, b) => a + b, 0) / months.length) : curr;
            return { category: cat, current: curr, average: Math.round(avg) };
        });

        // 1. Fetch Phase 3 Anomalies
        let anomalies = [];
        try {
            if (expenses.length >= 10) {
                const formattedExps = expenses.map(e => ({
                    id: e._id.toString(),
                    amount: e.amount,
                    category: e.category,
                    merchant: e.merchant || 'Unknown',
                    date: e.date ? new Date(e.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    description: e.description || ''
                }));
                const aiAnomalyUrl = process.env.AI_ANOMALY_URL || 'http://127.0.0.1:8000/detect-anomalies';
                const anomalyResp = await fetch(aiAnomalyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expenses: formattedExps })
                });
                if (anomalyResp.ok) {
                    const anomalyData = await anomalyResp.json();
                    anomalies = anomalyData.anomalies || [];
                }
            }
        } catch (e) {
            console.warn('Phase 3 anomaly fetch warning:', e.message);
        }

        // 2. Fetch Phase 4 Forecast
        let forecast = null;
        try {
            const distinctMonths = Object.keys(monthlyTotals);
            if (distinctMonths.length >= 3) {
                const monthlySpending = Object.entries(monthlyTotals).map(([month, amount]) => ({ month, amount }));
                const categoryMonthly = {};
                Object.entries(categoryMonthlyMap).forEach(([cat, months]) => {
                    categoryMonthly[cat] = Object.entries(months).map(([month, amount]) => ({ month, amount }));
                });

                const aiForecastUrl = process.env.AI_FORECAST_URL || 'http://127.0.0.1:8000/predict-spending';
                const forecastResp = await fetch(aiForecastUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ monthly_spending: monthlySpending, category_monthly: categoryMonthly })
                });
                if (forecastResp.ok) {
                    forecast = await forecastResp.json();
                }
            }
        } catch (e) {
            console.warn('Phase 4 forecast fetch warning:', e.message);
        }

        // 3. Call Phase 5 Insight Engine
        const aiInsightUrl = process.env.AI_INSIGHT_URL || 'http://127.0.0.1:8000/generate-insights';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(aiInsightUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                monthlySummary: { current: currentMonthlyTotal, average: Math.round(avgMonthlyTotal) },
                categorySummary,
                anomalies,
                forecast
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.detail || '⚠️ AI financial insights are currently unavailable.'
            });
        }

        const data = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('AI Insights Error:', err.message);
        return res.status(503).json({
            error: '⚠️ AI financial insights are currently unavailable. Please make sure the Python AI service is running.'
        });
    }
});

// ── AI Categorize (Gemini + smart fallback) ───────────────────────────────────
app.post('/api/ai-categorize', auth, async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'Description is required' });

    // Forward to ML service if available
    try {
        const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000/predict';
        const r = await fetch(aiServiceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: description.trim() })
        });
        if (r.ok) {
            const data = await r.json();
            return res.json({
                merchant:   data.merchant,
                amount:     data.amount,
                category:   data.category,
                confidence: data.confidence,
                source:     'fastapi-ml'
            });
        }
    } catch (e) {
        // Fallback to Gemini or smart match if FastAPI isn't running
    }

    const CATEGORIES = ['Food & Dining','Transport','Shopping','Entertainment','Health','Utilities','Education','Housing','Subscriptions','Other'];
    const geminiKey  = process.env.GEMINI_API_KEY;

    if (geminiKey && !geminiKey.includes('your_')) {
        try {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const prompt = `Categorize this expense into exactly ONE of: ${CATEGORIES.join(', ')}.\nExpense: "${description}"\nReply with ONLY the category name.`;
            const result = await model.generateContent(prompt);
            const cat    = result.response.text().trim();
            return res.json({ category: CATEGORIES.includes(cat) ? cat : 'Other', source: 'gemini-ai' });
        } catch (err) {
            console.error('Gemini error:', err.message);
        }
    }

    // Smart keyword fallback
    const text = description.toLowerCase();
    const map = {
        'Food & Dining': ['food','restaurant','cafe','coffee','swiggy','zomato','pizza','burger','dinner','lunch','breakfast','grocery','dmart','bigbasket','blinkit','groceries'],
        'Transport':     ['uber','ola','taxi','auto','bus','metro','train','flight','petrol','fuel','parking','toll','rapido','cab'],
        'Shopping':      ['amazon','flipkart','myntra','ajio','clothes','shoes','shopping','mall','meesho','nykaa'],
        'Entertainment': ['netflix','prime','hotstar','movie','cinema','spotify','game','youtube','ticket','pvr'],
        'Health':        ['doctor','hospital','medicine','pharmacy','gym','fitness','health','clinic','apollo'],
        'Utilities':     ['electricity','water','internet','wifi','recharge','bill','gas','airtel','jio','bsnl'],
        'Education':     ['course','book','college','school','tuition','exam','udemy','coursera','byju','learning'],
        'Housing':       ['rent','maintenance','flat','apartment','furniture','home','society'],
        'Subscriptions': ['subscription','membership','plan','annual','monthly plan','renewal'],
    };
    for (const [cat, kws] of Object.entries(map)) {
        if (kws.some(kw => text.includes(kw)))
            return res.json({ category: cat, source: 'smart-match' });
    }
    res.json({ category: 'Other', source: 'default' });
});

// ── Page routes ───────────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── DB connection ─────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expenseTracker';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB connected:', MONGODB_URI))
    .catch(err => console.error('❌ MongoDB error:', err.message));

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server:    http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
});

module.exports = app;