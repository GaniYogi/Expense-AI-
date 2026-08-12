/* ═══════════════════════════════════════════════
   ExpenseAI — Dashboard Logic
   All API calls, chart rendering, CRUD, SMS, AI
═══════════════════════════════════════════════ */

'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_URL = '';   // same origin

const CATEGORIES = [
    'Food & Dining','Transport','Shopping','Entertainment',
    'Health','Utilities','Education','Housing','Subscriptions','Other'
];

const CAT_COLORS = {
    'Food & Dining': '#f59e0b',
    'Transport':     '#3b82f6',
    'Shopping':      '#ec4899',
    'Entertainment': '#8b5cf6',
    'Health':        '#10b981',
    'Utilities':     '#06b6d4',
    'Education':     '#6366f1',
    'Housing':       '#f97316',
    'Subscriptions': '#14b8a6',
    'Other':         '#6b7280'
};

const CAT_ICONS = {
    'Food & Dining': '🍔',
    'Transport':     '🚗',
    'Shopping':      '🛍️',
    'Entertainment': '🎮',
    'Health':        '💊',
    'Utilities':     '⚡',
    'Education':     '📚',
    'Housing':       '🏠',
    'Subscriptions': '📱',
    'Other':         '💼'
};

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
    expenses:    [],
    stats:       null,
    editingId:   null,
    pieChart:    null,
    barChart:    null,
    rpieChart:   null,
    rbarChart:   null
};

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
const token    = localStorage.getItem('token');
const username = localStorage.getItem('username') || 'User';
if (!token) { window.location.href = '/'; }

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function apiGet(path) {
    const r = await fetch(API_URL + path, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401 || r.status === 403) { logout(); throw new Error('Session expired'); }
    return r.json();
}
async function apiPost(path, data) {
    const r = await fetch(API_URL + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return r.json();
}
async function apiPut(path, data) {
    const r = await fetch(API_URL + path, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return r.json();
}
async function apiDelete(path) {
    const r = await fetch(API_URL + path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    return r.json();
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
        el.classList.add('removing');
        setTimeout(() => el.remove(), 220);
    }, duration);
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navigate(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + section).classList.add('active');
    const navBtn = document.querySelector(`[data-section="${section}"]`);
    if (navBtn) navBtn.classList.add('active');

    const titles = {
        overview:     'Dashboard Overview',
        transactions: 'All Transactions',
        reports:      'Reports & Analytics',
        sms:          'SMS Expense Parser',
        budget:       'Budget Management'
    };
    document.getElementById('page-title').textContent = titles[section] || section;

    // Lazy render reports when visited
    if (section === 'reports' && state.stats) renderReports(state.stats);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
    // User display
    document.getElementById('sidebar-username').textContent = username;
    document.getElementById('user-avatar-text').textContent = username.charAt(0).toUpperCase();

    // Date
    document.getElementById('header-date').textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Default date in form
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];

    // Load data
    await Promise.all([loadStats(), loadExpenses()]);
}

async function loadStats() {
    try {
        const stats = await apiGet('/api/stats');
        state.stats = stats;
        renderStats(stats);
        renderPieChart(stats.allCategories);
        renderBarChart(stats.last6Months);
        renderBudgetSection(stats);
    } catch (err) { console.error('Stats error:', err); }
}

async function loadExpenses() {
    try {
        const expenses = await apiGet('/api/expenses');
        state.expenses = expenses;
        renderRecentTransactions(expenses.slice(0, 8));
        renderFullTransactions(expenses);
    } catch (err) { console.error('Expenses error:', err); }
}

// ─── RENDER STATS ─────────────────────────────────────────────────────────────
function renderStats(s) {
    document.getElementById('stat-total').textContent   = '₹' + fmt(s.total || 0);
    document.getElementById('stat-month').textContent   = '₹' + fmt(s.thisMonth || 0);
    document.getElementById('stat-count').textContent   = s.count || 0;
    document.getElementById('stat-count-sub').textContent = `${s.thisMonthCount || 0} this month`;

    if (s.topCategory) {
        document.getElementById('stat-top').textContent    = (CAT_ICONS[s.topCategory.name] || '') + ' ' + s.topCategory.name;
        document.getElementById('stat-top-sub').textContent = '₹' + fmt(s.topCategory.amount) + ' spent';
    }

    if (s.budget > 0) {
        const pct = Math.round((s.thisMonth / s.budget) * 100);
        document.getElementById('stat-budget-sub').textContent = `${pct}% of ₹${fmt(s.budget)} budget`;
    } else {
        document.getElementById('stat-budget-sub').textContent = 'No budget set';
    }
}

function fmt(n) { return (n || 0).toLocaleString('en-IN'); }

// ─── PIE CHART ────────────────────────────────────────────────────────────────
function renderPieChart(categories) {
    const ctx    = document.getElementById('pie-chart').getContext('2d');
    const labels = Object.keys(categories || {});
    const data   = Object.values(categories || {});
    const colors = labels.map(l => CAT_COLORS[l] || '#6b7280');

    if (state.pieChart) { state.pieChart.destroy(); state.pieChart = null; }

    if (!labels.length) {
        document.getElementById('pie-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('pie-empty').classList.add('hidden');

    const total = data.reduce((a, b) => a + b, 0);

    state.pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.map(c => c + 'bb'),
                borderColor:     colors,
                borderWidth: 2,
                hoverOffset: 8,
                hoverBorderWidth: 2
            }]
        },
        options: {
            cutout: '64%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₹${fmt(ctx.parsed)} (${Math.round(ctx.parsed / total * 100)}%)`
                    }
                }
            },
            animation: { animateRotate: true, duration: 600 }
        }
    });

    // Legend
    const leg = document.getElementById('pie-legend');
    leg.innerHTML = labels.map((l, i) => `
        <div class="legend-item">
            <div class="legend-dot" style="background:${colors[i]}"></div>
            <span class="legend-name">${CAT_ICONS[l] || ''} ${l}</span>
            <span class="legend-amount">₹${fmt(data[i])}</span>
        </div>`).join('');
}

// ─── BAR CHART ────────────────────────────────────────────────────────────────
function renderBarChart(months) {
    const ctx = document.getElementById('bar-chart').getContext('2d');
    if (state.barChart) { state.barChart.destroy(); state.barChart = null; }

    const last = months.length - 1;
    state.barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => m.label),
            datasets: [{
                label: 'Spending (₹)',
                data:  months.map(m => m.total),
                backgroundColor: months.map((_, i) => i === last ? '#6366f1' : 'rgba(99,102,241,0.28)'),
                borderColor: months.map((_, i) => i === last ? '#818cf8' : 'rgba(99,102,241,0.5)'),
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => ` ₹${fmt(c.parsed.y)}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
                y: {
                    grid: { color: 'rgba(148,163,184,0.06)' },
                    ticks: {
                        color: '#64748b', font: { size: 11 },
                        callback: v => '₹' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)
                    }
                }
            },
            animation: { duration: 600, easing: 'easeOutQuart' }
        }
    });
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function renderReports(s) {
    // Month pie
    const rPieCtx = document.getElementById('report-pie-chart').getContext('2d');
    if (state.rpieChart) { state.rpieChart.destroy(); state.rpieChart = null; }
    const mLabels = Object.keys(s.monthCategories || {});
    const mData   = Object.values(s.monthCategories || {});
    const mColors = mLabels.map(l => CAT_COLORS[l] || '#6b7280');
    if (mLabels.length) {
        state.rpieChart = new Chart(rPieCtx, {
            type: 'doughnut',
            data: { labels: mLabels, datasets: [{ data: mData, backgroundColor: mColors.map(c => c + 'bb'), borderColor: mColors, borderWidth: 2 }] },
            options: { cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ₹${fmt(c.parsed)}` } } } }
        });
        const rleg = document.getElementById('report-pie-legend');
        rleg.innerHTML = mLabels.map((l, i) => `<div class="legend-item"><div class="legend-dot" style="background:${mColors[i]}"></div><span class="legend-name">${CAT_ICONS[l]||''} ${l}</span><span class="legend-amount">₹${fmt(mData[i])}</span></div>`).join('');
    }

    // Bar
    const rBarCtx = document.getElementById('report-bar-chart').getContext('2d');
    if (state.rbarChart) { state.rbarChart.destroy(); state.rbarChart = null; }
    const months = s.last6Months || [];
    state.rbarChart = new Chart(rBarCtx, {
        type: 'line',
        data: {
            labels: months.map(m => m.label),
            datasets: [{
                label: '₹',
                data: months.map(m => m.total),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.12)',
                borderWidth: 2,
                pointBackgroundColor: '#6366f1',
                pointRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ₹${fmt(c.parsed.y)}` } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
                y: { grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v) } }
            }
        }
    });

    // Summary table
    const allCats = s.allCategories || {};
    const monCats = s.monthCategories || {};
    const total   = s.total || 1;
    const tbody   = document.getElementById('report-tbody');
    const allKeys = [...new Set([...Object.keys(allCats), ...Object.keys(monCats)])];
    if (!allKeys.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="ei">📊</div><h3>No data</h3></div></td></tr>`;
        return;
    }
    tbody.innerHTML = allKeys
        .sort((a, b) => (allCats[b] || 0) - (allCats[a] || 0))
        .map(cat => `
        <tr>
            <td><span class="badge" style="background:${(CAT_COLORS[cat]||'#6b7280')}22;color:${CAT_COLORS[cat]||'#6b7280'};border:1px solid ${(CAT_COLORS[cat]||'#6b7280')}44">${CAT_ICONS[cat]||'💼'} ${cat}</span></td>
            <td class="amount-cell">₹${fmt(monCats[cat] || 0)}</td>
            <td class="amount-cell">₹${fmt(allCats[cat] || 0)}</td>
            <td style="color:var(--text3)">${Math.round((allCats[cat] || 0) / total * 100)}%</td>
        </tr>`).join('');
}

// ─── TRANSACTION ROWS ─────────────────────────────────────────────────────────
function expenseRow(e, compact = false) {
    const c    = CAT_COLORS[e.category] || '#6b7280';
    const icon = CAT_ICONS[e.category]  || '💼';
    const date = new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const acts = compact ? '' : `
        <td>
            <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="openEditModal('${e._id}')">✏️</button>
                <button class="btn btn-danger btn-sm"    onclick="deleteExpense('${e._id}')">🗑️</button>
            </div>
        </td>`;
    return `<tr>
        <td class="date-cell">${date}</td>
        <td><span class="badge" style="background:${c}1a;color:${c};border:1px solid ${c}33">${icon} ${e.category}</span></td>
        <td class="amount-cell">₹${fmt(e.amount)}</td>
        <td class="desc-cell">${e.description || '<span style="color:var(--text3)">—</span>'}</td>
        ${acts}
    </tr>`;
}

function renderRecentTransactions(expenses) {
    const tbody = document.getElementById('recent-tbody');
    if (!expenses.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="ei">💸</div><h3>No expenses yet</h3><p>Click "+ Add Expense" to get started</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = expenses.map(e => expenseRow(e, true)).join('');
}

function renderFullTransactions(expenses) {
    const tbody = document.getElementById('all-tbody');
    if (!expenses.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="ei">💸</div><h3>No expenses found</h3><p>Try a different search or add your first expense</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = expenses.map(e => expenseRow(e, false)).join('');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openAddModal() {
    state.editingId = null;
    document.getElementById('modal-title').textContent = '➕ Add Expense';
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    const badge = document.getElementById('ai-category-badge');
    badge.style.display = 'none';
    badge.textContent   = '';
    document.getElementById('expense-modal').classList.remove('hidden');
}

function openEditModal(id) {
    const e = state.expenses.find(x => x._id === id);
    if (!e) return;
    state.editingId = id;
    document.getElementById('modal-title').textContent          = '✏️ Edit Expense';
    document.getElementById('expense-amount').value             = e.amount;
    document.getElementById('expense-category').value           = e.category;
    document.getElementById('expense-description').value        = e.description || '';
    document.getElementById('expense-date').value               = new Date(e.date).toISOString().split('T')[0];
    const badge = document.getElementById('ai-category-badge');
    badge.style.display = 'none';
    badge.textContent   = '';
    document.getElementById('expense-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('expense-modal').classList.add('hidden');
}

// Form submit
document.getElementById('expense-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const data = {
        amount:      parseFloat(document.getElementById('expense-amount').value),
        category:    document.getElementById('expense-category').value,
        description: document.getElementById('expense-description').value.trim(),
        date:        document.getElementById('expense-date').value
    };
    if (!data.amount || data.amount <= 0) { toast('Enter a valid amount', 'error'); return; }

    const btn = document.getElementById('submit-expense-btn');
    btn.disabled    = true;
    btn.textContent = '⏳ Saving...';

    try {
        if (state.editingId) {
            await apiPut('/api/expenses/' + state.editingId, data);
            toast('Expense updated! ✅', 'success');
        } else {
            await apiPost('/api/expenses', data);
            toast('Expense added! ✅', 'success');
        }
        closeModal();
        await Promise.all([loadStats(), loadExpenses()]);
    } catch (err) {
        toast('Failed to save: ' + err.message, 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = '💾 Save Expense';
    }
});

// Delete
async function deleteExpense(id) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    try {
        await apiDelete('/api/expenses/' + id);
        toast('Expense deleted', 'success');
        await Promise.all([loadStats(), loadExpenses()]);
    } catch (err) { toast('Delete failed', 'error'); }
}

// ─── AI CATEGORIZE ────────────────────────────────────────────────────────────
async function aiCategorize() {
    const desc = document.getElementById('expense-description').value.trim();
    if (!desc) { toast('Enter a description first', 'info'); return; }

    const btn       = document.getElementById('ai-btn');
    btn.disabled    = true;
    btn.textContent = '⏳';

    try {
        const result = await apiPost('/api/ai-categorize', { description: desc });
        document.getElementById('expense-category').value = result.category;

        const badge = document.getElementById('ai-category-badge');
        badge.textContent   = result.source === 'gemini-ai' ? '✨ Gemini AI' : '🧠 Smart Match';
        badge.style.display = 'inline-flex';
        toast(`Category set: ${result.category}`, 'success');
    } catch (err) { toast('Categorization failed', 'error'); }
    finally {
        btn.disabled    = false;
        btn.textContent = '✨ AI';
    }
}

// ─── SMS PARSER ───────────────────────────────────────────────────────────────
async function parseSMS() {
    const msg = document.getElementById('sms-input').value.trim();
    if (!msg) { toast('Paste an SMS message first', 'info'); return; }

    const btn       = document.getElementById('parse-sms-btn');
    btn.disabled    = true;
    btn.textContent = '⏳ Parsing...';

    try {
        const result = await apiPost('/api/parse-sms', { message: msg });
        document.getElementById('sms-amount').textContent   = '₹' + fmt(result.amount || 0);
        document.getElementById('sms-category').textContent = (CAT_ICONS[result.category] || '') + ' ' + result.category;
        document.getElementById('sms-result').classList.add('visible');
        window._smsResult = result;

        if (!result.amount) toast('Amount not detected — check the SMS format', 'info');
        else                 toast('SMS parsed successfully!', 'success');
    } catch (err) { toast('SMS parsing failed', 'error'); }
    finally {
        btn.disabled    = false;
        btn.textContent = '🔍 Parse SMS';
    }
}

function addSMSAsExpense() {
    if (!window._smsResult) return;
    const { amount, category } = window._smsResult;
    const smsText = document.getElementById('sms-input').value.substring(0, 80);

    navigate('overview');
    state.editingId = null;
    document.getElementById('modal-title').textContent          = '➕ Add Expense';
    document.getElementById('expense-form').reset();
    document.getElementById('expense-amount').value             = amount || '';
    document.getElementById('expense-category').value           = category || 'Other';
    document.getElementById('expense-description').value        = 'SMS: ' + smsText;
    document.getElementById('expense-date').value               = new Date().toISOString().split('T')[0];
    document.getElementById('ai-category-badge').style.display  = 'none';
    document.getElementById('expense-modal').classList.remove('hidden');
}

// ─── BUDGET ───────────────────────────────────────────────────────────────────
async function saveBudget(ev) {
    ev.preventDefault();
    const amount = parseFloat(document.getElementById('budget-input').value);
    if (!amount || isNaN(amount) || amount < 0) { toast('Enter a valid budget', 'error'); return; }

    try {
        await apiPost('/api/budget', { budget: amount });
        toast('Budget saved! 🎯', 'success');
        await loadStats();
    } catch (err) { toast('Failed to save budget', 'error'); }
}

function renderBudgetSection(s) {
    const budget  = s.budget  || 0;
    const spent   = s.thisMonth || 0;
    const remaining = Math.max(0, budget - spent);

    document.getElementById('budget-input').value          = budget || '';
    document.getElementById('budget-display-amount').textContent = budget ? '₹' + fmt(budget) : 'Not set';
    document.getElementById('budget-spent').textContent    = '₹' + fmt(spent);
    document.getElementById('budget-remaining-val').textContent = budget ? '₹' + fmt(remaining) : '—';

    if (budget > 0) {
        const pct  = Math.min(100, (spent / budget) * 100);
        const fill = document.getElementById('budget-fill');
        fill.style.width = pct + '%';
        fill.className   = 'progress-fill ' + (pct < 65 ? 'safe' : pct < 85 ? 'warn' : 'danger');

        document.getElementById('budget-pct').textContent       = `${Math.round(pct)}% used`;
        document.getElementById('budget-remaining').textContent  = `₹${fmt(remaining)} left`;

        let tip = '';
        if      (pct === 0)    tip = `🎉 Great start! You have your full budget of ₹${fmt(budget)} available this month.`;
        else if (pct < 50)     tip = `🟢 Excellent! You've spent ${Math.round(pct)}% of your budget. Keep it up!`;
        else if (pct < 65)     tip = `🟡 You've used ${Math.round(pct)}% of your budget. Stay mindful of spending.`;
        else if (pct < 85)     tip = `🟠 Warning! ${Math.round(pct)}% of budget used. Only ₹${fmt(remaining)} remaining.`;
        else if (pct < 100)    tip = `🔴 Critical! You've spent ${Math.round(pct)}% of your budget. Slow down!`;
        else                   tip = `🚨 Over budget! You've exceeded your ₹${fmt(budget)} limit by ₹${fmt(Math.abs(remaining))}.`;
        document.getElementById('budget-tip').textContent = tip;

        // Insights
        const insights = document.getElementById('budget-insights');
        const topCat   = s.topCategory;
        insights.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px">
                ${topCat ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px">
                    <div class="text-muted" style="margin-bottom:4px">Top Spending Category</div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text)">${CAT_ICONS[topCat.name]||''} ${topCat.name}</div>
                    <div class="text-muted">₹${fmt(topCat.amount)} spent</div>
                </div>` : ''}
                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px">
                    <div class="text-muted" style="margin-bottom:4px">Daily Average (this month)</div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text)">₹${fmt(Math.round(spent / new Date().getDate()))}</div>
                    <div class="text-muted">based on ${new Date().getDate()} days</div>
                </div>
                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px">
                    <div class="text-muted" style="margin-bottom:4px">Projected Month End</div>
                    <div style="font-size:1.1rem;font-weight:700;color:${pct > 85 ? 'var(--rose)' : 'var(--text)'}">₹${fmt(Math.round(spent / new Date().getDate() * getDaysInMonth()))}</div>
                    <div class="text-muted">at current daily rate</div>
                </div>
            </div>`;
    } else {
        document.getElementById('budget-pct').textContent      = 'Set a budget to track';
        document.getElementById('budget-remaining').textContent = '';
        document.getElementById('budget-tip').textContent       = '💡 Set a monthly budget to track spending and get personalized tips.';
    }
}

function getDaysInMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// ─── SEARCH & FILTER ──────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    const cat = document.getElementById('filter-category').value;
    filterTransactions(q, cat);
});

document.getElementById('filter-category').addEventListener('change', function () {
    const cat = this.value;
    const q   = document.getElementById('search-input').value.toLowerCase();
    filterTransactions(q, cat);
});

function filterTransactions(q, cat) {
    let filtered = state.expenses;
    if (q)   filtered = filtered.filter(e => e.category.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q) || e.amount.toString().includes(q));
    if (cat) filtered = filtered.filter(e => e.category === cat);
    renderFullTransactions(filtered);
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
async function exportCSV() {
    try {
        const resp = await fetch(API_URL + '/api/expenses/export', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!resp.ok) throw new Error('Export failed');
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = 'expenses-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('CSV exported! ⬇️', 'success');
    } catch (err) { toast('Export failed', 'error'); }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.section));
});

document.getElementById('add-expense-btn').addEventListener('click',  openAddModal);
document.getElementById('add-expense-btn-2').addEventListener('click', openAddModal);
document.getElementById('export-btn').addEventListener('click',  exportCSV);
document.getElementById('export-btn-2').addEventListener('click', exportCSV);
document.getElementById('logout-btn').addEventListener('click',   logout);
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.getElementById('ai-btn').addEventListener('click',          aiCategorize);
document.getElementById('parse-sms-btn').addEventListener('click',   parseSMS);
document.getElementById('add-sms-expense-btn').addEventListener('click', addSMSAsExpense);
document.getElementById('budget-form').addEventListener('submit',    saveBudget);

// Close modal on overlay click
document.getElementById('expense-modal').addEventListener('click', function (ev) {
    if (ev.target === this) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeModal(); });

// ─── START ────────────────────────────────────────────────────────────────────
init();
