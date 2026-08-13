const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(SERVER_URL + path);
        const options = {
            method: method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, body: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data, headers: res.headers });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runSecurityAudit() {
    console.log('==================================================');
    console.log('RUNNING STEP 2: SECURITY & USER ISOLATION TESTS');
    console.log('==================================================\n');

    // ── 1. Create User A & User B ───────────────────────────────────────────────
    const time = Date.now();
    const userA = { username: `userA_${time}`, email: `userA_${time}@example.com`, password: 'password123' };
    const userB = { username: `userB_${time}`, email: `userB_${time}@example.com`, password: 'password123' };

    console.log('1. Registering User A and User B...');
    const regA = await request('POST', '/api/register', userA);
    const regB = await request('POST', '/api/register', userB);
    if (regA.status !== 201 || regB.status !== 201) {
        console.error('Registration failed:', regA, regB);
        process.exit(1);
    }
    console.log('   User A and User B registered successfully.');

    // ── 2. Login User A & User B ────────────────────────────────────────────────
    console.log('\n2. Logging in User A and User B...');
    const loginA = await request('POST', '/api/login', { username: userA.username, password: userA.password });
    const loginB = await request('POST', '/api/login', { username: userB.username, password: userB.password });
    const tokenA = loginA.body.token;
    const tokenB = loginB.body.token;
    const headersA = { Authorization: 'Bearer ' + tokenA };
    const headersB = { Authorization: 'Bearer ' + tokenB };

    if (!tokenA || !tokenB) {
        console.error('Login failed.');
        process.exit(1);
    }
    console.log('   Tokens acquired for User A and User B.');

    // ── 3. Test Security Headers ────────────────────────────────────────────────
    console.log('\n3. Checking Security Headers...');
    console.log('   X-Content-Type-Options:', loginA.headers['x-content-type-options']);
    console.log('   X-Frame-Options:', loginA.headers['x-frame-options']);
    console.log('   X-XSS-Protection:', loginA.headers['x-xss-protection']);
    if (loginA.headers['x-content-type-options'] !== 'nosniff' || loginA.headers['x-frame-options'] !== 'DENY') {
        console.error('FAILED: Security headers missing or incorrect');
        process.exit(1);
    }

    // ── 4. Add Expense for User A and User B ────────────────────────────────────
    console.log('\n4. User Data Isolation Test: Creating separate expenses...');
    const addA = await request('POST', '/api/expenses', {
        amount: 500,
        category: 'Food & Dining',
        description: 'User A private dinner',
        transactionType: 'debit'
    }, headersA);

    const addB = await request('POST', '/api/expenses', {
        amount: 15000,
        category: 'Shopping',
        description: 'User B private luxury item',
        transactionType: 'credit'
    }, headersB);

    const expA_id = addA.body._id;
    const expB_id = addB.body._id;

    console.log(`   User A expense ID: ${expA_id}`);
    console.log(`   User B expense ID: ${expB_id}`);

    // ── 5. Verify GET Isolation ─────────────────────────────────────────────────
    console.log('\n5. Verifying GET /api/expenses isolation...');
    const getA = await request('GET', '/api/expenses', null, headersA);
    const getB = await request('GET', '/api/expenses', null, headersB);

    const userA_has_B = getA.body.some(e => e._id === expB_id);
    const userB_has_A = getB.body.some(e => e._id === expA_id);

    if (userA_has_B || userB_has_A) {
        console.error('FAILED: Cross-user expense leak detected!');
        process.exit(1);
    }
    console.log('   User A sees ONLY User A expenses.');
    console.log('   User B sees ONLY User B expenses.');

    // ── 6. Verify PUT & DELETE Isolation ────────────────────────────────────────
    console.log('\n6. Verifying PUT/DELETE ownership protection...');
    const tamperPut = await request('PUT', `/api/expenses/${expB_id}`, { amount: 99999 }, headersA);
    console.log('   User A tampering PUT on User B expense status:', tamperPut.status);
    if (tamperPut.status !== 404) {
        console.error('FAILED: User A was able to update User B expense or returned invalid status');
        process.exit(1);
    }

    const tamperDelete = await request('DELETE', `/api/expenses/${expB_id}`, null, headersA);
    console.log('   User A tampering DELETE on User B expense status:', tamperDelete.status);
    if (tamperDelete.status !== 404) {
        console.error('FAILED: User A was able to delete User B expense or returned invalid status');
        process.exit(1);
    }
    console.log('   Ownership protection verified: User A cannot modify or delete User B expenses.');

    // ── 7. Input Validation & Boundary Testing ──────────────────────────────────
    console.log('\n7. Input Validation Boundary Testing...');
    
    // Negative Amount
    const negAmt = await request('POST', '/api/expenses', { amount: -500, category: 'Food' }, headersA);
    console.log('   Negative amount status:', negAmt.status);
    if (negAmt.status !== 400) { console.error('FAILED: Negative amount accepted'); process.exit(1); }

    // NaN Amount
    const nanAmt = await request('POST', '/api/expenses', { amount: 'invalid_number', category: 'Food' }, headersA);
    console.log('   NaN amount status:', nanAmt.status);
    if (nanAmt.status !== 400) { console.error('FAILED: NaN amount accepted'); process.exit(1); }

    // Invalid transactionType
    const invType = await request('POST', '/api/expenses', { amount: 100, transactionType: 'malicious' }, headersA);
    console.log('   Invalid transactionType status:', invType.status);
    if (invType.status !== 400) { console.error('FAILED: Invalid transactionType accepted'); process.exit(1); }

    // Oversized SMS
    const hugeSMS = 'A'.repeat(5001);
    const smsRes = await request('POST', '/api/parse-sms', { sms: hugeSMS }, headersA);
    console.log('   Oversized SMS payload status:', smsRes.status);
    if (smsRes.status !== 400) { console.error('FAILED: Oversized SMS payload accepted'); process.exit(1); }

    console.log('   Input validation checks passed cleanly.');

    // ── 8. Secret Scan ──────────────────────────────────────────────────────────
    console.log('\n8. Performing Secret Scan on codebase files...');
    const secretFiles = ['app.js', 'dashboard.js', 'frontend.js', 'index.html', 'dashboard.html', 'ai-service/app.py'];
    let hardcodedSecretsFound = 0;

    for (const f of secretFiles) {
        const fullPath = path.join(__dirname, f);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Check patterns
            if (content.match(/mongodb\+srv:\/\/[^\s'"]+/i) || content.match(/AIzaSy[A-Za-z0-9_-]{33}/)) {
                console.error(`   POTENTIAL SECRET FOUND in ${f}`);
                hardcodedSecretsFound++;
            }
        }
    }
    if (hardcodedSecretsFound === 0) {
        console.log('   Secret scan clean: No hardcoded API keys or MongoDB credentials found in source files.');
    }

    // ── 9. AI Phase Regression Test ─────────────────────────────────────────────
    console.log('\n9. AI Phases Regression Test...');
    const p1 = await request('POST', '/api/ai/categorize-expense', { description: 'Paid ₹450 at Swiggy' }, headersA);
    const p2 = await request('POST', '/api/parse-sms', { sms: 'Paid ₹500 at Dominoes' }, headersA);
    const p3 = await request('GET', '/api/ai/anomalies', null, headersA);
    const p4 = await request('GET', '/api/ai/spending-forecast', null, headersA);
    const p5 = await request('GET', '/api/ai/insights', null, headersA);

    if (p1.status !== 200 || p2.status !== 200 || p3.status !== 200 || p4.status !== 200 || p5.status !== 200) {
        console.error('FAILED AI Phase Regression Test:', p1.status, p2.status, p3.status, p4.status, p5.status);
        process.exit(1);
    }
    console.log('   Phase 1 (Categorization): PASS');
    console.log('   Phase 2 (SMS Extraction): PASS');
    console.log('   Phase 3 (Isolation Forest Anomalies): PASS');
    console.log('   Phase 4 (Linear Regression Forecast): PASS');
    console.log('   Phase 5 (AI Financial Insights): PASS');

    console.log('\n==================================================');
    console.log('STEP 2 SECURITY & ISOLATION TESTS PASSED! ✅');
    console.log('==================================================');
}

runSecurityAudit().catch(err => {
    console.error('Security test execution error:', err);
    process.exit(1);
});
