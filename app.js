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
    category:    { type: String, default: 'Other' },
    amount:      { type: Number, required: true },
    description: { type: String, default: '' },
    date:        { type: Date, default: Date.now }
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
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// ── Auth middleware ───────────────────────────────────────────────────────────
const auth = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
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
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username: username.trim(), email: email.trim(), password: hashed });
        await user.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(409).json({ error: `That ${field} is already taken. Please login or use a different ${field}.` });
        }
        res.status(500).json({ error: err.message });
    }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const trimmed = username.trim();
        const user = await User.findOne({
            username: { $regex: new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
        });
        if (!user) return res.status(400).json({ error: 'User not found. Please check your username or sign up.' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Add expense ───────────────────────────────────────────────────────────────
app.post('/api/expenses', auth, async (req, res) => {
    try {
        const { category, amount, description, date } = req.body;
        if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount is required' });
        const user = await User.findById(req.user.id);
        user.expenses.push({
            category:    category || 'Other',
            amount:      parseFloat(amount),
            description: description || '',
            date:        date ? new Date(date) : new Date()
        });
        await user.save();
        const added = user.expenses[user.expenses.length - 1];
        res.status(201).json(added);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Get expenses ──────────────────────────────────────────────────────────────
app.get('/api/expenses', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const sorted = [...user.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(sorted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Edit expense ──────────────────────────────────────────────────────────────
app.put('/api/expenses/:id', auth, async (req, res) => {
    try {
        const { category, amount, description, date } = req.body;
        const user = await User.findById(req.user.id);
        const expense = user.expenses.id(req.params.id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });
        if (category)               expense.category    = category;
        if (amount)                 expense.amount      = parseFloat(amount);
        if (description !== undefined) expense.description = description;
        if (date)                   expense.date        = new Date(date);
        await user.save();
        res.json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Delete expense ────────────────────────────────────────────────────────────
app.delete('/api/expenses/:id', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
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

// ── SMS Parse ─────────────────────────────────────────────────────────────────
app.post('/api/parse-sms', auth, async (req, res) => {
    const { message } = req.body;
    try {
        const amountPatterns = [
            /(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
            /(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i,
            /debited\s+(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
            /withdrawn\s+(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
            /amount\s+(?:of\s+)?(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
        ];
        let amount = null;
        for (const p of amountPatterns) {
            const m = message.match(p);
            if (m) { amount = parseFloat(m[1].replace(/,/g, '')); break; }
        }
        const text = message.toLowerCase();
        const cats = {
            'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'dunzo', 'grofers', 'blinkit'],
            'Transport':     ['uber', 'ola', 'rapido', 'metro', 'irctc', 'petrol', 'fuel', 'toll', 'parking'],
            'Shopping':      ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'mall', 'nykaa'],
            'Utilities':     ['electricity', 'water', 'gas', 'bill', 'recharge', 'airtel', 'jio', 'bsnl', 'vodafone'],
            'Health':        ['apollo', 'medplus', 'hospital', 'clinic', 'pharma', 'medicine', 'healthkart'],
            'Entertainment': ['netflix', 'prime', 'hotstar', 'sony', 'zee5', 'pvr', 'inox', 'bookmyshow'],
            'Education':     ['udemy', 'coursera', 'byju', 'unacademy', 'book store', 'course'],
        };
        let category = 'Other';
        for (const [cat, kws] of Object.entries(cats)) {
            if (kws.some(kw => text.includes(kw))) { category = cat; break; }
        }
        res.json({ amount: amount || 0, category });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── AI Categorize (Gemini + smart fallback) ───────────────────────────────────
app.post('/api/ai-categorize', auth, async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'Description is required' });

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