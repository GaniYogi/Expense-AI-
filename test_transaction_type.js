const http = require('http');
const https = require('https');

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
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
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

async function runTests() {
    console.log('==================================================');
    console.log('RUNNING TRANSACTION TYPE & REGRESSION TESTS');
    console.log('==================================================\n');

    const testUser = {
        username: 'testuser_' + Date.now(),
        email: 'testuser_' + Date.now() + '@example.com',
        password: 'password123'
    };

    // 1. Register
    console.log('1. Registering test user...');
    const regRes = await request('POST', '/api/register', testUser);
    if (regRes.status !== 201) {
        console.error('Registration failed:', regRes);
        process.exit(1);
    }
    console.log('   User registered successfully.');

    // 2. Login
    console.log('2. Logging in...');
    const loginRes = await request('POST', '/api/login', { username: testUser.username, password: testUser.password });
    if (loginRes.status !== 200 || !loginRes.body.token) {
        console.error('Login failed:', loginRes);
        process.exit(1);
    }
    const token = loginRes.body.token;
    const authHeaders = { Authorization: 'Bearer ' + token };
    console.log('   Logged in successfully.');

    // 3. Test 1: SMS Debit Transaction
    console.log('\n3. Test 1: SMS Debit Transaction');
    const smsDebit = "Dear Customer, your account has been debited by Rs. 450 at Swiggy on 13-Aug-2026.";
    const parseDebitRes = await request('POST', '/api/parse-sms', { sms: smsDebit }, authHeaders);
    console.log('   Parse SMS Debit response:', parseDebitRes.body);
    if (parseDebitRes.status !== 200 || parseDebitRes.body.transactionType !== 'debit') {
        console.error('FAILED: Expected transactionType debit from parse-sms');
        process.exit(1);
    }

    const saveDebitRes = await request('POST', '/api/expenses', {
        amount: parseDebitRes.body.amount,
        category: parseDebitRes.body.category,
        merchant: parseDebitRes.body.merchant,
        description: parseDebitRes.body.rawText,
        transactionType: parseDebitRes.body.transactionType,
        aiCategorized: true,
        aiConfidence: parseDebitRes.body.confidence
    }, authHeaders);
    console.log('   Save Debit Expense response:', saveDebitRes.body);
    if (saveDebitRes.status !== 201 || saveDebitRes.body.transactionType !== 'debit') {
        console.error('FAILED: Expected saved transactionType to be debit');
        process.exit(1);
    }

    // 4. Test 2: SMS Credit Transaction
    console.log('\n4. Test 2: SMS Credit Transaction');
    const smsCredit = "Your account has been credited with Rs. 10000 on 13-Aug-2026.";
    const parseCreditRes = await request('POST', '/api/parse-sms', { sms: smsCredit }, authHeaders);
    console.log('   Parse SMS Credit response:', parseCreditRes.body);
    if (parseCreditRes.status !== 200 || parseCreditRes.body.transactionType !== 'credit') {
        console.error('FAILED: Expected transactionType credit from parse-sms');
        process.exit(1);
    }

    const saveCreditRes = await request('POST', '/api/expenses', {
        amount: parseCreditRes.body.amount,
        category: parseCreditRes.body.category,
        merchant: parseCreditRes.body.merchant,
        description: parseCreditRes.body.rawText,
        transactionType: parseCreditRes.body.transactionType,
        aiCategorized: true,
        aiConfidence: parseCreditRes.body.confidence
    }, authHeaders);
    console.log('   Save Credit Expense response:', saveCreditRes.body);
    if (saveCreditRes.status !== 201 || saveCreditRes.body.transactionType !== 'credit') {
        console.error('FAILED: Expected saved transactionType to be credit');
        process.exit(1);
    }

    // 5. Test 3: Normal Manual Expense (Default debit)
    console.log('\n5. Test 3: Normal Manual Expense Defaulting to Debit');
    const manualExpRes = await request('POST', '/api/expenses', {
        amount: 250,
        category: 'Food & Dining',
        description: 'Coffee at Starbucks'
    }, authHeaders);
    console.log('   Manual Expense response:', manualExpRes.body);
    if (manualExpRes.status !== 201 || manualExpRes.body.transactionType !== 'debit') {
        console.error('FAILED: Expected default manual expense transactionType to be debit');
        process.exit(1);
    }

    // 6. Test 4: Edit SMS Transaction before saving
    console.log('\n6. Test 4: Editing Expense and Preserving transactionType');
    const editRes = await request('PUT', `/api/expenses/${saveCreditRes.body._id}`, {
        amount: 12000,
        transactionType: 'credit'
    }, authHeaders);
    console.log('   Edit Expense response:', editRes.body);
    if (editRes.status !== 200 || editRes.body.transactionType !== 'credit' || editRes.body.amount !== 12000) {
        console.error('FAILED: Expected updated expense amount 12000 and transactionType credit');
        process.exit(1);
    }

    // 7. Test 5: Invalid transactionType Validation
    console.log('\n7. Test 5: Validation of Invalid transactionType');
    const invalidRes = await request('POST', '/api/expenses', {
        amount: 500,
        category: 'Other',
        transactionType: 'invalid_type'
    }, authHeaders);
    console.log('   Invalid transactionType status:', invalidRes.status, invalidRes.body);
    if (invalidRes.status !== 400) {
        console.error('FAILED: Expected 400 error status for invalid transactionType');
        process.exit(1);
    }

    // 8. Verify saved expenses list from MongoDB
    console.log('\n8. Verifying saved expenses from GET /api/expenses');
    const getExpensesRes = await request('GET', '/api/expenses', null, authHeaders);
    console.log('   Total expenses retrieved:', getExpensesRes.body.length);
    const debitItem = getExpensesRes.body.find(e => e._id === saveDebitRes.body._id);
    const creditItem = getExpensesRes.body.find(e => e._id === saveCreditRes.body._id);
    const manualItem = getExpensesRes.body.find(e => e._id === manualExpRes.body._id);

    console.log('   Debit Item in MongoDB:', debitItem ? debitItem.transactionType : 'NOT FOUND');
    console.log('   Credit Item in MongoDB:', creditItem ? creditItem.transactionType : 'NOT FOUND');
    console.log('   Manual Item in MongoDB:', manualItem ? manualItem.transactionType : 'NOT FOUND');

    if (!debitItem || debitItem.transactionType !== 'debit' ||
        !creditItem || creditItem.transactionType !== 'credit' ||
        !manualItem || manualItem.transactionType !== 'debit') {
        console.error('FAILED: MongoDB records do not reflect correct transactionType');
        process.exit(1);
    }

    // 9. AI Phase Regression Testing
    console.log('\n==================================================');
    console.log('AI PHASES REGRESSION TESTS');
    console.log('==================================================');

    // Phase 1: Categorization
    console.log('Phase 1 (Expense Categorization): /api/ai/categorize-expense');
    const phase1Res = await request('POST', '/api/ai/categorize-expense', { description: 'Paid ₹450 at Swiggy' }, authHeaders);
    console.log('   Phase 1 Result:', phase1Res.body);
    if (phase1Res.status !== 200 || !phase1Res.body.category) {
        console.error('FAILED Phase 1 regression test');
        process.exit(1);
    }

    // Phase 2: SMS Extraction
    console.log('Phase 2 (SMS Extraction): /api/parse-sms');
    const phase2Res = await request('POST', '/api/parse-sms', { sms: 'Paid ₹500 at Dominoes' }, authHeaders);
    console.log('   Phase 2 Result:', phase2Res.body);
    if (phase2Res.status !== 200 || !phase2Res.body.amount) {
        console.error('FAILED Phase 2 regression test');
        process.exit(1);
    }

    // Phase 3: Unusual Spending (Isolation Forest)
    console.log('Phase 3 (Unusual Spending Detection): /api/ai/anomalies');
    const phase3Res = await request('GET', '/api/ai/anomalies', null, authHeaders);
    console.log('   Phase 3 Result:', phase3Res.body);
    if (phase3Res.status !== 200) {
        console.error('FAILED Phase 3 regression test');
        process.exit(1);
    }

    // Phase 4: Spending Forecast (Linear Regression)
    console.log('Phase 4 (Spending Forecast): /api/ai/spending-forecast');
    const phase4Res = await request('GET', '/api/ai/spending-forecast', null, authHeaders);
    console.log('   Phase 4 Result:', phase4Res.body);
    if (phase4Res.status !== 200) {
        console.error('FAILED Phase 4 regression test');
        process.exit(1);
    }

    // Phase 5: Financial Insights
    console.log('Phase 5 (Financial Insights): /api/ai/insights');
    const phase5Res = await request('GET', '/api/ai/insights', null, authHeaders);
    console.log('   Phase 5 Result:', phase5Res.body);
    if (phase5Res.status !== 200) {
        console.error('FAILED Phase 5 regression test');
        process.exit(1);
    }

    console.log('\n==================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! ✅');
    console.log('==================================================');
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
