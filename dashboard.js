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
    if (r.status === 401 || r.status === 403) { logout(); throw new Error('Session expired'); }
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
    await Promise.all([loadStats(), loadExpenses(), loadAnomalies(), loadForecast(), loadInsights()]);
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

// ─── ANOMALY DETECTION (ISOLATION FOREST) ─────────────────────────────────────
async function loadAnomalies() {
    const container = document.getElementById('ai-anomalies-container');
    if (!container) return;

    try {
        const res = await apiGet('/api/ai/anomalies');
        
        if (res.status === 'insufficient_data') {
            container.innerHTML = `
                <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;color:#c7d2fe">
                    <span style="font-size:1.5rem">ℹ️</span>
                    <div>
                        <strong style="color:#e0e7ff;font-size:0.92rem">Not enough spending history yet</strong>
                        <div style="font-size:0.83rem;margin-top:2px;color:var(--text2)">${res.message || 'Add more expenses (at least 10) to enable AI unusual spending detection.'}</div>
                    </div>
                </div>
            `;
            return;
        }

        if (res.error) {
            container.innerHTML = `
                <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.86rem">
                    ${res.error}
                </div>
            `;
            return;
        }

        if (!res.anomalies || res.anomalies.length === 0) {
            container.innerHTML = `
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;color:#6ee7b7">
                    <span style="font-size:1.5rem">✅</span>
                    <div>
                        <strong style="color:#a7f3d0;font-size:0.92rem">No unusual spending detected</strong>
                        <div style="font-size:0.83rem;margin-top:2px;color:var(--text2)">Your recent spending looks consistent with your normal pattern.</div>
                    </div>
                </div>
            `;
            return;
        }

        const sevBadgeMap = {
            high:   '<span style="background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid rgba(239,68,68,0.4);font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:10px">🔴 HIGH ANOMALY</span>',
            medium: '<span style="background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:10px">🟠 MEDIUM ANOMALY</span>',
            low:    '<span style="background:rgba(234,179,8,0.2);color:#eab308;border:1px solid rgba(234,179,8,0.4);font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:10px">🟡 UNUSUAL</span>'
        };

        container.innerHTML = res.anomalies.map(item => `
            <div style="background:rgba(30,41,59,0.7);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="display:flex;align-items:center;gap:8px">
                        <strong style="color:var(--text);font-size:0.95rem">${item.merchant || item.category}</strong>
                        <span style="font-size:0.82rem;color:var(--text3)">(${item.category})</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <strong style="color:#ef4444;font-size:1.05rem">₹${fmt(item.amount)}</strong>
                        ${sevBadgeMap[item.severity] || sevBadgeMap.medium}
                    </div>
                </div>
                <div style="font-size:0.85rem;color:var(--text2);line-height:1.4;background:rgba(15,23,42,0.6);padding:8px 12px;border-radius:6px;border-left:3px solid #ef4444">
                    💡 <strong>AI Analysis:</strong> ${item.reason}
                </div>
            </div>
        `).join('');

    } catch (err) {
        container.innerHTML = `
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.86rem">
                ⚠️ AI spending analysis is currently unavailable.
            </div>
        `;
    }
}

// ─── FINANCIAL INSIGHTS & RECOMMENDATIONS (PHASE 5) ───────────────────────────
async function loadInsights() {
    const container = document.getElementById('ai-insights-container');
    if (!container) return;

    try {
        const res = await apiGet('/api/ai/insights');

        if (res.status === 'insufficient_data') {
            container.innerHTML = `
                <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;color:#c7d2fe">
                    <span style="font-size:1.5rem">ℹ️</span>
                    <div>
                        <strong style="color:#e0e7ff;font-size:0.92rem">Keep tracking your expenses</strong>
                        <div style="font-size:0.83rem;margin-top:2px;color:var(--text2)">${res.message || 'AI financial insights will become more useful as you add more spending history.'}</div>
                    </div>
                </div>
            `;
            return;
        }

        if (res.error) {
            container.innerHTML = `
                <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.86rem">
                    ${res.error}
                </div>
            `;
            return;
        }

        if (!res.insights || res.insights.length === 0) {
            container.innerHTML = `
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;color:#6ee7b7">
                    <span style="font-size:1.5rem">✅</span>
                    <div>
                        <strong style="color:#a7f3d0;font-size:0.92rem">Your finances look healthy!</strong>
                        <div style="font-size:0.83rem;margin-top:2px;color:var(--text2)">No critical financial alerts or major spending spikes detected.</div>
                    </div>
                </div>
            `;
            return;
        }

        const sevStyles = {
            HIGH:     { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',  badgeBg: 'rgba(239,68,68,0.2)',  badgeClr: '#ef4444', badgeText: '🔴 HIGH PRIORITY' },
            MEDIUM:   { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', badgeBg: 'rgba(245,158,11,0.2)', badgeClr: '#f59e0b', badgeText: '⚠️ ATTENTION' },
            LOW:      { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', badgeBg: 'rgba(99,102,241,0.2)', badgeClr: '#818cf8', badgeText: '💡 SUGGESTION' },
            POSITIVE: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', badgeBg: 'rgba(16,185,129,0.2)', badgeClr: '#34d399', badgeText: '✅ GOOD NEWS' }
        };

        container.innerHTML = res.insights.map(item => {
            const st = sevStyles[item.severity] || sevStyles.LOW;
            return `
                <div style="background:${st.bg};border:1px solid ${st.border};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong style="color:var(--text);font-size:0.96rem">${item.title}</strong>
                        <span style="background:${st.badgeBg};color:${st.badgeClr};font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:10px">${st.badgeText}</span>
                    </div>
                    <div style="font-size:0.86rem;color:var(--text2);line-height:1.4">
                        ${item.message}
                    </div>
                    <div style="font-size:0.84rem;color:var(--text);background:rgba(15,23,42,0.6);padding:8px 12px;border-radius:6px;border-left:3px solid ${st.badgeClr}">
                        💡 <strong>Recommendation:</strong> ${item.recommendation}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        container.innerHTML = `
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.86rem">
                ⚠️ AI financial insights are currently unavailable.
            </div>
        `;
    }
}

// ─── SPENDING PREDICTION & FORECAST (LINEAR REGRESSION) ───────────────────────
async function loadForecast() {
    const container = document.getElementById('ai-forecast-container');
    if (!container) return;

    try {
        const res = await apiGet('/api/ai/spending-forecast');

        if (res.status === 'insufficient_data') {
            container.innerHTML = `
                <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;color:#c7d2fe">
                    <span style="font-size:1.5rem">ℹ️</span>
                    <div>
                        <strong style="color:#e0e7ff;font-size:0.92rem">Not enough historical data to generate forecast</strong>
                        <div style="font-size:0.83rem;margin-top:2px;color:var(--text2)">${res.message || 'Add at least 3 months of historical expenses to generate a reliable spending forecast.'}</div>
                    </div>
                </div>
            `;
            return;
        }

        if (res.error) {
            container.innerHTML = `
                <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.86rem">
                    ${res.error}
                </div>
            `;
            return;
        }

        const trendMap = {
            increasing: '<span style="color:#ef4444;font-weight:700">↗ Spending Trend: Increasing</span>',
            decreasing: '<span style="color:#10b981;font-weight:700">↘ Spending Trend: Decreasing</span>',
            stable:     '<span style="color:#3b82f6;font-weight:700">➡️ Spending Trend: Stable</span>'
        };

        const fc = res.forecast || {};
        const catForecastsHtml = (res.categoryForecasts && res.categoryForecasts.length > 0) ? `
            <div style="margin-top:14px;background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
                <div style="font-size:0.85rem;font-weight:700;color:#a5b4fc;margin-bottom:8px">📊 Expected Category Breakdown (${fc.month || 'Next Month'})</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:8px;font-size:0.82rem">
                    ${res.categoryForecasts.map(c => `
                        <div style="background:rgba(30,41,59,0.8);padding:8px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center">
                            <span style="color:var(--text2)">${CAT_ICONS[c.category]||''} ${c.category}:</span>
                            <strong style="color:var(--text)">₹${fmt(c.predictedAmount)}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch">
                <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(99,102,241,0.25);border-radius:12px;padding:16px">
                    <div style="font-size:0.82rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Next Month Estimated Spending (${fc.month || 'Next Month'})</div>
                    <div style="font-size:2rem;font-weight:800;color:#818cf8;margin:6px 0">₹${fmt(fc.predictedAmount || 0)}</div>
                    <div style="font-size:0.85rem;margin-bottom:6px">${trendMap[res.trend] || trendMap.stable}</div>
                    <div style="font-size:0.82rem;color:var(--text2);line-height:1.5">
                        Historical Average: <strong>₹${fmt(res.historicalAverage || 0)}</strong><br>
                        Estimated Range: <strong>₹${fmt(fc.rangeMin || 0)} – ₹${fmt(fc.rangeMax || 0)}</strong>
                    </div>
                </div>

                <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:center">
                    <div style="font-size:0.88rem;font-weight:700;color:#e0e7ff;margin-bottom:6px">💡 AI Forecast Analysis</div>
                    <div style="font-size:0.84rem;color:var(--text2);line-height:1.5">
                        ${res.explanation || 'Forecast calculated using Linear Regression on monthly spending history.'}
                    </div>
                </div>
            </div>
            ${catForecastsHtml}
        `;

    } catch (err) {
        container.innerHTML = `
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.86rem">
                ⚠️ AI spending forecast is currently unavailable.
            </div>
        `;
    }
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
    const typeBadge = e.transactionType === 'credit'
        ? `<span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);margin-left:4px">💰 Income</span>`
        : `<span class="badge" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.25);margin-left:4px">💸 Expense</span>`;
    const acts = compact ? '' : `
        <td>
            <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="openEditModal('${e._id}')">✏️</button>
                <button class="btn btn-danger btn-sm"    onclick="deleteExpense('${e._id}')">🗑️</button>
            </div>
        </td>`;
    return `<tr>
        <td class="date-cell">${date}</td>
        <td>
            <span class="badge" style="background:${c}1a;color:${c};border:1px solid ${c}33">${icon} ${e.category}</span>
            ${typeBadge}
        </td>
        <td class="amount-cell">${e.transactionType === 'credit' ? '+' : ''}₹${fmt(e.amount)}</td>
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

const CAT_MAP = {
    'Food': 'Food & Dining',
    'Food & Dining': 'Food & Dining',
    'Transport': 'Transport',
    'Travel': 'Transport',
    'Shopping': 'Shopping',
    'Entertainment': 'Entertainment',
    'Bills': 'Utilities',
    'Utilities': 'Utilities',
    'Healthcare': 'Health',
    'Health': 'Health',
    'Education': 'Education',
    'Housing': 'Housing',
    'Subscriptions': 'Subscriptions',
    'Other': 'Other'
};

let currentAiData = null;

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openAddModal() {
    state.editingId = null;
    currentAiData = null;
    document.getElementById('modal-title').textContent = '➕ Add Expense';
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    const badge = document.getElementById('ai-category-badge');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
    const aiCard = document.getElementById('ai-analysis-card');
    if (aiCard) aiCard.classList.add('hidden');
    document.getElementById('submit-expense-btn').textContent = 'Confirm & Save';
    document.getElementById('expense-modal').classList.remove('hidden');
}

function openEditModal(id) {
    const e = state.expenses.find(x => x._id === id);
    if (!e) return;
    state.editingId = id;
    currentAiData = {
        merchant: e.merchant,
        confidence: e.aiConfidence,
        transactionType: e.transactionType || 'debit'
    };
    document.getElementById('modal-title').textContent          = '✏️ Edit Expense';
    document.getElementById('expense-amount').value             = e.amount;
    document.getElementById('expense-category').value           = e.category;
    document.getElementById('expense-description').value        = e.description || '';
    document.getElementById('expense-date').value               = new Date(e.date).toISOString().split('T')[0];
    const badge = document.getElementById('ai-category-badge');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
    const aiCard = document.getElementById('ai-analysis-card');
    if (aiCard) aiCard.classList.add('hidden');
    document.getElementById('submit-expense-btn').textContent = 'Confirm & Save';
    document.getElementById('expense-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('expense-modal').classList.add('hidden');
}

// Update category display in AI result card if user changes selection
document.getElementById('expense-category').addEventListener('change', function() {
    const cat = this.value;
    const resCat = document.getElementById('ai-res-category');
    if (resCat) {
        resCat.textContent = (CAT_ICONS[cat] || '') + ' ' + cat;
    }
});

// Form submit
document.getElementById('expense-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const data = {
        amount:          parseFloat(document.getElementById('expense-amount').value),
        category:        document.getElementById('expense-category').value,
        description:     document.getElementById('expense-description').value.trim(),
        merchant:        currentAiData ? (currentAiData.merchant || '') : '',
        transactionType: (currentAiData && currentAiData.transactionType) ? currentAiData.transactionType : 'debit',
        aiCategorized:   Boolean(currentAiData),
        aiConfidence:    currentAiData ? (currentAiData.confidence || 0) : 0,
        date:            document.getElementById('expense-date').value
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
        btn.textContent = 'Confirm & Save';
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
    if (!desc) { toast('Enter an expense description first', 'info'); return; }

    const btn       = document.getElementById('ai-btn');
    btn.disabled    = true;
    btn.textContent = '🤖 AI is analyzing your expense...';

    try {
        const result = await apiPost('/api/ai/categorize-expense', { description: desc });
        
        if (result.error) {
            toast(result.error, 'error');
            return;
        }

        const rawCat = result.category || 'Other';
        const mappedCat = CAT_MAP[rawCat] || (CATEGORIES.includes(rawCat) ? rawCat : 'Other');
        
        // Auto-fill amount if detected
        if (result.amount && result.amount > 0) {
            document.getElementById('expense-amount').value = result.amount;
        }
        
        // Auto-fill category
        document.getElementById('expense-category').value = mappedCat;

        // Save current AI data for metadata persistence
        currentAiData = {
            merchant: result.merchant || 'Unknown',
            confidence: result.confidence || 0.80
        };

        // Display AI Analysis Card
        const card = document.getElementById('ai-analysis-card');
        if (card) {
            document.getElementById('ai-res-merchant').textContent = result.merchant || 'Unknown';
            document.getElementById('ai-res-amount').textContent   = result.amount ? '₹' + fmt(result.amount) : '—';
            document.getElementById('ai-res-category').textContent = (CAT_ICONS[mappedCat] || '') + ' ' + mappedCat;
            
            const confPct = Math.round((result.confidence || 0.80) * 100);
            document.getElementById('ai-confidence-badge').textContent = `Confidence: ${confPct}%`;
            card.classList.remove('hidden');
        }

        const badge = document.getElementById('ai-category-badge');
        if (badge) {
            badge.textContent   = '🤖 Real AI ML Model';
            badge.style.display = 'inline-flex';
        }

        toast(`AI Analysis complete! Category: ${mappedCat} (${Math.round((result.confidence || 0.80) * 100)}%)`, 'success');
    } catch (err) {
        toast(err.message || '⚠️ AI service unavailable. Please make sure the Python AI service is running.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = '✨ Categorize with AI';
    }
}

// ─── SMS PARSER ───────────────────────────────────────────────────────────────
async function parseSMS() {
    const msg = document.getElementById('sms-input').value.trim();
    if (!msg) { toast('Please paste an SMS first.', 'info'); return; }

    const btn       = document.getElementById('parse-sms-btn');
    btn.disabled    = true;
    btn.textContent = '🤖 AI is analyzing your SMS...';

    try {
        const result = await apiPost('/api/parse-sms', { sms: msg });
        
        if (result.error) {
            toast(result.error, 'error');
            return;
        }

        const rawCat = result.category || 'Other';
        const mappedCat = CAT_MAP[rawCat] || (CATEGORIES.includes(rawCat) ? rawCat : 'Other');
        result.mappedCategory = mappedCat;
        window._smsResult = result;

        // Render card values
        document.getElementById('sms-merchant-val').textContent = result.merchant || 'Unknown';
        document.getElementById('sms-amount-val').textContent   = '₹' + fmt(result.amount || 0);
        document.getElementById('sms-date-val').textContent     = result.date || '—';
        document.getElementById('sms-type-val').textContent     = result.transactionType === 'credit' ? '💰 Credit (Income)' : '💸 Debit (Expense)';
        document.getElementById('sms-category-val').textContent = (CAT_ICONS[mappedCat] || '') + ' ' + mappedCat;
        
        const confPct = Math.round((result.confidence || 0.80) * 100);
        document.getElementById('sms-confidence-badge').textContent = `Confidence: ${confPct}%`;

        // Duplicate warning banner
        const dupBanner = document.getElementById('sms-dup-warning');
        if (dupBanner) {
            if (result.isDuplicate) dupBanner.classList.remove('hidden');
            else dupBanner.classList.add('hidden');
        }

        // Credit notice banner
        const creditBanner = document.getElementById('sms-credit-notice');
        if (creditBanner) {
            if (result.transactionType === 'credit') creditBanner.classList.remove('hidden');
            else creditBanner.classList.add('hidden');
        }

        document.getElementById('sms-result').classList.remove('hidden');
        document.getElementById('sms-result').classList.add('visible');
        toast('SMS parsed successfully!', 'success');
    } catch (err) {
        toast(err.message || '⚠️ AI service unavailable. Please make sure the Python AI service is running.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = '🤖 Analyze SMS';
    }
}

async function addSMSAsExpense() {
    if (!window._smsResult) return;
    const res = window._smsResult;

    const data = {
        amount:          res.amount,
        category:        res.mappedCategory || 'Other',
        merchant:        res.merchant || '',
        description:     res.rawText || '',
        transactionType: res.transactionType || 'debit',
        aiCategorized:   true,
        aiConfidence:    res.confidence || 0.80,
        date:            res.date ? new Date(res.date).toISOString() : new Date().toISOString()
    };

    try {
        await apiPost('/api/expenses', data);
        toast(res.transactionType === 'credit' ? 'Credit transaction saved! 💰' : 'Expense saved from SMS! ✅', 'success');
        const smsResultEl = document.getElementById('sms-result');
        smsResultEl.classList.remove('visible');
        smsResultEl.classList.add('hidden');
        document.getElementById('sms-input').value = '';
        window._smsResult = null;
        await Promise.all([loadStats(), loadExpenses()]);
    } catch (err) {
        toast('Failed to save SMS expense: ' + err.message, 'error');
    }
}

function editSMSAsExpense() {
    if (!window._smsResult) return;
    const res = window._smsResult;

    navigate('overview');
    state.editingId = null;
    currentAiData = {
        merchant: res.merchant,
        confidence: res.confidence,
        transactionType: res.transactionType || 'debit'
    };
    
    document.getElementById('modal-title').textContent          = '✏️ Confirm & Edit Expense';
    document.getElementById('expense-amount').value             = res.amount || '';
    document.getElementById('expense-category').value           = res.mappedCategory || 'Other';
    document.getElementById('expense-description').value        = res.rawText || '';
    document.getElementById('expense-date').value               = res.date || new Date().toISOString().split('T')[0];
    
    const badge = document.getElementById('ai-category-badge');
    if (badge) { badge.textContent = '🤖 Real AI SMS Scan'; badge.style.display = 'inline-flex'; }
    
    const card = document.getElementById('ai-analysis-card');
    if (card) {
        document.getElementById('ai-res-merchant').textContent = res.merchant || 'Unknown';
        document.getElementById('ai-res-amount').textContent   = res.amount ? '₹' + fmt(res.amount) : '—';
        document.getElementById('ai-res-category').textContent = (CAT_ICONS[res.mappedCategory] || '') + ' ' + res.mappedCategory;
        document.getElementById('ai-confidence-badge').textContent = `Confidence: ${Math.round((res.confidence || 0.80) * 100)}%`;
        card.classList.remove('hidden');
    }

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
const editSmsBtn = document.getElementById('edit-sms-expense-btn');
if (editSmsBtn) editSmsBtn.addEventListener('click', editSMSAsExpense);
document.getElementById('budget-form').addEventListener('submit',    saveBudget);

// Close modal on overlay click
document.getElementById('expense-modal').addEventListener('click', function (ev) {
    if (ev.target === this) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeModal(); });

// ─── START ────────────────────────────────────────────────────────────────────
init();
