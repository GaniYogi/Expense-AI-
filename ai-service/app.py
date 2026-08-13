import os
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

app = FastAPI(title="Expense AI Service (Complete Phase 1-5 Pipeline)", version="5.0.0")

base_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(base_dir, "model", "expense_classifier.pkl")
vectorizer_path = os.path.join(base_dir, "model", "vectorizer.pkl")

model = None
vectorizer = None

def load_artifacts():
    global model, vectorizer
    if os.path.exists(model_path) and os.path.exists(vectorizer_path):
        model = joblib.load(model_path)
        vectorizer = joblib.load(vectorizer_path)
        print("[SUCCESS] ML model and vectorizer loaded successfully.")
    else:
        print("[WARNING] ML model or vectorizer not found. Please run train_model.py first.")

load_artifacts()

# Pydantic Schemas
class PredictRequest(BaseModel):
    text: Optional[str] = None
    description: Optional[str] = None

class PredictResponse(BaseModel):
    merchant: str
    amount: float
    category: str
    confidence: float

class ParseSMSRequest(BaseModel):
    sms: Optional[str] = None
    message: Optional[str] = None

class ParseSMSResponse(BaseModel):
    merchant: str
    amount: float
    date: str
    transactionType: str
    category: str
    confidence: float
    rawText: str

class ExpenseItem(BaseModel):
    id: Optional[str] = None
    amount: float
    category: str
    merchant: Optional[str] = "Unknown"
    date: Optional[str] = None
    description: Optional[str] = ""

class DetectAnomaliesRequest(BaseModel):
    expenses: List[ExpenseItem]

class AnomalyDetail(BaseModel):
    id: Optional[str] = None
    amount: float
    category: str
    merchant: str
    date: str
    anomalyScore: float
    severity: str
    reason: str

class DetectAnomaliesResponse(BaseModel):
    status: str
    message: Optional[str] = None
    totalAnalyzed: int = 0
    anomalyCount: int = 0
    anomalies: List[AnomalyDetail] = []

class MonthlySpendingItem(BaseModel):
    month: str
    amount: float

class PredictSpendingRequest(BaseModel):
    monthly_spending: List[MonthlySpendingItem]
    category_monthly: Optional[Dict[str, List[MonthlySpendingItem]]] = {}

class CategoryForecastItem(BaseModel):
    category: str
    predictedAmount: float

class SpendingForecastDetails(BaseModel):
    month: str
    predictedAmount: float
    rangeMin: float
    rangeMax: float

class PredictSpendingResponse(BaseModel):
    status: str
    message: Optional[str] = None
    forecast: Optional[SpendingForecastDetails] = None
    historicalAverage: float = 0.0
    trend: str = "stable"
    explanation: Optional[str] = None
    categoryForecasts: List[CategoryForecastItem] = []

class CategorySummaryItem(BaseModel):
    category: str
    current: float
    average: float

class MonthlySummary(BaseModel):
    current: float
    average: float

class GenerateInsightsRequest(BaseModel):
    monthlySummary: Optional[MonthlySummary] = None
    categorySummary: Optional[List[CategorySummaryItem]] = []
    anomalies: Optional[List[Dict[str, Any]]] = []
    forecast: Optional[Dict[str, Any]] = None

class InsightItem(BaseModel):
    type: str
    severity: str  # "HIGH", "MEDIUM", "LOW", "POSITIVE"
    title: str
    message: str
    recommendation: str

class GenerateInsightsResponse(BaseModel):
    status: str
    message: Optional[str] = None
    insightCount: int = 0
    insights: List[InsightItem] = []

KNOWN_MERCHANTS = [
    "swiggy", "zomato", "uber", "ola", "amazon", "flipkart", "myntra", "ajio", 
    "netflix", "spotify", "apollo", "dunzo", "blinkit", "dmart", "pvr", "inox", 
    "airtel", "jio", "bsnl", "udemy", "coursera", "starbucks", "mcdonalds", 
    "dominos", "kfc", "bookmyshow", "bigbasket", "zepto", "meesho", "nykaa"
]

def extract_amount(text: str) -> float:
    patterns = [
        r'(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)',
        r'(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)',
        r'(?:paid|debited|credited|spent|amount|withdrawn|charged)\s+(?:by\s+)?(?:with\s+)?(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)',
        r'(\d+(?:\.\d{1,2})?)'
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            val_str = m.group(1).replace(',', '')
            try:
                val = float(val_str)
                if val > 0:
                    return val
            except ValueError:
                continue
    return 0.0

def extract_merchant(text: str) -> str:
    text_lower = text.lower()
    for brand in KNOWN_MERCHANTS:
        if brand in text_lower:
            return brand.capitalize()

    patterns = [
        r'(?:merchant[:\s]+|at\s+|to\s+|for\s+)([A-Z0-9&.\'\-]+(?:\s+[A-Z0-9&.\'\-]+)?)',
        r'paid\s+(?:to\s+)?([A-Z0-9&.\'\-]+(?:\s+[A-Z0-9&.\'\-]+)?)'
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            noise = {'a', 'an', 'the', 'rs', 'inr', 'rupees', 'paid', 'debited', 'credited',
                     'amount', 'for', 'on', 'ride', 'subscription', 'purchase', 'with',
                     'account', 'card', 'charged', 'been', 'has', 'your'}
            filtered = [
                w for w in candidate.split()
                if w.lower() not in noise
                and not re.match(r'^[0-9.,/₹$:\-]+$', w)
                and not re.match(r'^\d{1,2}-[a-zA-Z]{3}-\d{2,4}$', w)  # dates like 13-Aug-2026
                and len(w) > 1
            ]
            if filtered:
                return " ".join(filtered).capitalize()

    # Fallback: scan individual words
    ignore_words = {
        'dear', 'customer', 'your', 'account', 'has', 'been', 'debited', 'credited',
        'by', 'with', 'rs', 'inr', 'rupees', 'at', 'to', 'for', 'on', 'withdrawn',
        'amount', 'ride', 'subscription', 'purchase', 'card', 'charged', 'a', 'an',
        'the', 'is', 'are', 'was', 'were', 'bank', 'avail', 'upi', 'ref', 'no',
        'info', 'transaction', 'txn'
    }
    words = [
        w.strip('.,!') for w in re.split(r'\s+', text)
        if w.lower().strip('.,!') not in ignore_words
        and not re.match(r'^[0-9.,/₹$:\-]+$', w.strip('.,!'))
        and not re.match(r'^\d{1,2}-[a-zA-Z]{3}-\d{2,4}$', w.strip('.,!'))  # reject dates
        and not re.match(r'^[Rr][Ss]\.?$', w.strip('.,!'))                   # reject Rs/rs/Rs.
        and len(w.strip('.,!')) > 2
    ]
    if words:
        return words[0].capitalize()

    return "Unknown"

def extract_transaction_type(text: str) -> str:
    text_lower = text.lower()
    credit_keywords = ['credited', 'credit', 'received', 'deposited', 'added']
    debit_keywords = ['debited', 'debit', 'spent', 'paid', 'withdrawn', 'charged', 'purchase']
    
    for kw in credit_keywords:
        if kw in text_lower:
            return "credit"
    for kw in debit_keywords:
        if kw in text_lower:
            return "debit"
    return "debit"

def extract_date(text: str) -> str:
    m = re.search(r'(\d{1,2})[-/\s]+([A-Za-z]{3,9})[-/\s]+(\d{4})', text)
    if m:
        day, month_str, year = m.groups()
        for fmt in ('%d-%b-%Y', '%d-%B-%Y'):
            try:
                d = datetime.strptime(f"{day}-{month_str}-{year}", fmt)
                return d.strftime('%Y-%m-%d')
            except ValueError:
                pass

    m = re.search(r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})', text)
    if m:
        day, month, year = m.groups()
        try:
            d = datetime(int(year), int(month), int(day))
            return d.strftime('%Y-%m-%d')
        except ValueError:
            pass

    m = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', text)
    if m:
        year, month, day = m.groups()
        try:
            d = datetime(int(year), int(month), int(day))
            return d.strftime('%Y-%m-%d')
        except ValueError:
            pass

    return datetime.now().strftime('%Y-%m-%d')

def get_next_month_str(current_month_str: str) -> str:
    try:
        dt = datetime.strptime(current_month_str + "-01", "%Y-%m-%d")
        if dt.month == 12:
            return f"{dt.year + 1}-01"
        else:
            return f"{dt.year}-{dt.month + 1:02d}"
    except Exception:
        now = datetime.now()
        return f"{now.year}-{now.month + 1:02d}"

@app.get("/")
def health_check():
    return {
        "status": "ok",
        "service": "Expense AI Service (Phase 1 to Phase 5 Pipeline)",
        "model_loaded": model is not None and vectorizer is not None
    }

@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest):
    input_text = payload.text or payload.description
    if not input_text or not input_text.strip():
        raise HTTPException(status_code=400, detail="Input text or description is required")

    input_text = input_text.strip()
    
    if model is None or vectorizer is None:
        load_artifacts()

    if model is None or vectorizer is None:
        raise HTTPException(status_code=500, detail="AI Model is not initialized. Please train the model.")

    amount = extract_amount(input_text)
    merchant = extract_merchant(input_text)

    clean_text = input_text.lower()
    X = vectorizer.transform([clean_text])
    predicted_category = model.predict(X)[0]
    
    probs = model.predict_proba(X)[0]
    raw_max = float(probs.max())
    n_classes = len(probs)
    
    baseline = 1.0 / n_classes
    if raw_max > baseline:
        rel_score = (raw_max - baseline) / (1.0 - baseline)
        confidence = round(min(0.98, max(0.65, 0.70 + rel_score * 0.28)), 2)
    else:
        confidence = 0.50

    return PredictResponse(
        merchant=merchant,
        amount=amount,
        category=predicted_category,
        confidence=confidence
    )

@app.post("/parse-sms", response_model=ParseSMSResponse)
def parse_sms(payload: ParseSMSRequest):
    sms_text = payload.sms or payload.message
    if not sms_text or not sms_text.strip():
        raise HTTPException(status_code=400, detail="SMS text is required")

    sms_text = sms_text.strip()

    if model is None or vectorizer is None:
        load_artifacts()

    if model is None or vectorizer is None:
        raise HTTPException(status_code=500, detail="AI Model is not initialized.")

    amount = extract_amount(sms_text)
    merchant = extract_merchant(sms_text)
    tx_type = extract_transaction_type(sms_text)
    tx_date = extract_date(sms_text)

    clean_text = f"{merchant} {sms_text}".lower()
    X = vectorizer.transform([clean_text])
    predicted_category = model.predict(X)[0]

    probs = model.predict_proba(X)[0]
    raw_max = float(probs.max())
    n_classes = len(probs)

    baseline = 1.0 / n_classes
    if raw_max > baseline:
        rel_score = (raw_max - baseline) / (1.0 - baseline)
        confidence = round(min(0.98, max(0.65, 0.70 + rel_score * 0.28)), 2)
    else:
        confidence = 0.50

    if tx_type == "credit":
        predicted_category = "Other"

    return ParseSMSResponse(
        merchant=merchant,
        amount=amount,
        date=tx_date,
        transactionType=tx_type,
        category=predicted_category,
        confidence=confidence,
        rawText=sms_text
    )

@app.post("/detect-anomalies", response_model=DetectAnomaliesResponse)
def detect_anomalies(payload: DetectAnomaliesRequest):
    expenses = payload.expenses
    if not expenses or len(expenses) < 10:
        return DetectAnomaliesResponse(
            status="insufficient_data",
            message="Add more expenses to detect unusual spending patterns.",
            totalAnalyzed=len(expenses) if expenses else 0,
            anomalyCount=0,
            anomalies=[]
        )

    amounts = [e.amount for e in expenses]
    user_mean = float(np.mean(amounts)) if amounts else 1.0

    cat_amounts: Dict[str, List[float]] = {}
    merchant_counts: Dict[str, int] = {}
    monthly_cat_sums: Dict[str, Dict[str, float]] = {}

    for e in expenses:
        cat = e.category or "Other"
        merch = (e.merchant or "Unknown").lower()
        dt_str = e.date or datetime.now().strftime("%Y-%m-%d")
        month_key = dt_str[:7]

        cat_amounts.setdefault(cat, []).append(e.amount)
        merchant_counts[merch] = merchant_counts.get(merch, 0) + 1

        monthly_cat_sums.setdefault(cat, {}).setdefault(month_key, 0.0)
        monthly_cat_sums[cat][month_key] += e.amount

    cat_means = {cat: float(np.mean(vals)) for cat, vals in cat_amounts.items()}
    cat_monthly_avgs = {
        cat: float(np.mean(list(months.values()))) for cat, months in monthly_cat_sums.items()
    }

    features = []
    for e in expenses:
        cat = e.category or "Other"
        merch = (e.merchant or "Unknown").lower()
        dt_str = e.date or datetime.now().strftime("%Y-%m-%d")
        month_key = dt_str[:7]

        c_mean = cat_means.get(cat, user_mean)
        c_month_avg = cat_monthly_avgs.get(cat, c_mean)
        current_month_total = monthly_cat_sums.get(cat, {}).get(month_key, e.amount)

        f_amount = e.amount
        f_cat_ratio = e.amount / (c_mean + 1e-5)
        f_user_ratio = e.amount / (user_mean + 1e-5)
        f_monthly_cat_ratio = current_month_total / (c_month_avg + 1e-5)
        f_merchant_freq = float(merchant_counts.get(merch, 1))

        features.append([f_amount, f_cat_ratio, f_user_ratio, f_monthly_cat_ratio, f_merchant_freq])

    X = np.array(features)

    clf = IsolationForest(n_estimators=100, contamination=0.15, random_state=42)
    clf.fit(X)
    scores = clf.decision_function(X)
    preds = clf.predict(X)

    anomalies: List[AnomalyDetail] = []
    for i, e in enumerate(expenses):
        score = float(scores[i])
        is_ml_anomaly = preds[i] == -1

        cat = e.category or "Other"
        c_mean = cat_means.get(cat, user_mean)
        cat_ratio = e.amount / (c_mean + 1e-5)

        dt_str = e.date or datetime.now().strftime("%Y-%m-%d")
        month_key = dt_str[:7]
        c_month_avg = cat_monthly_avgs.get(cat, c_mean)
        current_month_total = monthly_cat_sums.get(cat, {}).get(month_key, e.amount)
        monthly_ratio = current_month_total / (c_month_avg + 1e-5)

        if is_ml_anomaly or cat_ratio >= 2.0 or monthly_ratio >= 2.0:
            if score < -0.15 or cat_ratio >= 4.0 or monthly_ratio >= 3.0:
                severity = "high"
            elif score < -0.05 or cat_ratio >= 2.5 or monthly_ratio >= 2.0:
                severity = "medium"
            else:
                severity = "low"

            if cat_ratio >= 2.0:
                reason = f"Amount (₹{e.amount:,.0f}) is {cat_ratio:.1f}x higher than your normal {cat} average (₹{c_mean:,.0f})."
            elif monthly_ratio >= 1.8 and len(monthly_cat_sums.get(cat, {})) > 1:
                pct_inc = (monthly_ratio - 1.0) * 100
                reason = f"{cat} spending this month (₹{current_month_total:,.0f}) is {pct_inc:.0f}% higher than your recent monthly average (₹{c_month_avg:,.0f})."
            elif e.amount >= user_mean * 3.0:
                reason = f"Transaction of ₹{e.amount:,.0f} is significantly larger than your typical overall spending (avg ₹{user_mean:,.0f})."
            else:
                reason = "Transaction amount and pattern deviate significantly from your normal spending habits."

            anomalies.append(AnomalyDetail(
                id=e.id,
                amount=e.amount,
                category=cat,
                merchant=e.merchant or "Unknown",
                date=e.date or datetime.now().strftime("%Y-%m-%d"),
                anomalyScore=round(score, 3),
                severity=severity,
                reason=reason
            ))

    severity_order = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda a: (severity_order.get(a.severity, 3), -a.amount))

    return DetectAnomaliesResponse(
        status="success",
        message="Anomaly detection complete.",
        totalAnalyzed=len(expenses),
        anomalyCount=len(anomalies),
        anomalies=anomalies
    )

@app.post("/predict-spending", response_model=PredictSpendingResponse)
def predict_spending(payload: PredictSpendingRequest):
    monthly_data = payload.monthly_spending
    if not monthly_data or len(monthly_data) < 3:
        return PredictSpendingResponse(
            status="insufficient_data",
            message="Add at least 3 months of historical expenses to generate a reliable spending forecast.",
            categoryForecasts=[]
        )

    sorted_monthly = sorted(monthly_data, key=lambda x: x.month)
    y_values = [item.amount for item in sorted_monthly]
    hist_avg = float(np.mean(y_values))

    N = len(y_values)
    X = np.array([[i + 1] for i in range(N)])
    y = np.array(y_values)

    model_lr = LinearRegression()
    model_lr.fit(X, y)

    next_idx = N + 1
    raw_pred = float(model_lr.predict([[next_idx]])[0])
    pred_amount = max(0.0, round(raw_pred, 2))

    slope = float(model_lr.coef_[0])
    if slope > 0.03 * (hist_avg + 1e-5):
        trend = "increasing"
    elif slope < -0.03 * (hist_avg + 1e-5):
        trend = "decreasing"
    else:
        trend = "stable"

    y_pred_hist = model_lr.predict(X)
    residuals = y - y_pred_hist
    std_err = float(np.std(residuals)) if N > 2 else 0.1 * hist_avg
    range_margin = max(std_err, 0.1 * pred_amount)
    
    range_min = max(0.0, round(pred_amount - range_margin, 2))
    range_max = round(pred_amount + range_margin, 2)

    last_month_str = sorted_monthly[-1].month
    next_month_str = get_next_month_str(last_month_str)

    if trend == "increasing":
        explanation = f"Your monthly spending has been increasing steadily. Based on this trend, your estimated spending next month ({next_month_str}) is ₹{pred_amount:,.0f}."
    elif trend == "decreasing":
        explanation = f"Your monthly spending has been trending downwards. Based on this trend, your estimated spending next month ({next_month_str}) is ₹{pred_amount:,.0f}."
    else:
        explanation = f"Your spending has remained relatively stable over recent months. The forecast of ₹{pred_amount:,.0f} is close to your historical average (₹{hist_avg:,.0f})."

    category_forecasts: List[CategoryForecastItem] = []
    if payload.category_monthly:
        for cat_name, cat_items in payload.category_monthly.items():
            if len(cat_items) >= 3:
                cat_sorted = sorted(cat_items, key=lambda x: x.month)
                cat_y = np.array([c.amount for c in cat_sorted])
                cat_X = np.array([[i + 1] for i in range(len(cat_sorted))])
                cat_lr = LinearRegression()
                cat_lr.fit(cat_X, cat_y)
                cat_pred_raw = float(cat_lr.predict([[len(cat_sorted) + 1]])[0])
                cat_pred_amount = max(0.0, round(cat_pred_raw, 2))
                category_forecasts.append(CategoryForecastItem(
                    category=cat_name,
                    predictedAmount=cat_pred_amount
                ))

    category_forecasts.sort(key=lambda x: -x.predictedAmount)

    return PredictSpendingResponse(
        status="success",
        message="Forecast generated successfully.",
        forecast=SpendingForecastDetails(
            month=next_month_str,
            predictedAmount=pred_amount,
            rangeMin=range_min,
            rangeMax=range_max
        ),
        historicalAverage=round(hist_avg, 2),
        trend=trend,
        explanation=explanation,
        categoryForecasts=category_forecasts
    )

@app.post("/generate-insights", response_model=GenerateInsightsResponse)
def generate_insights(payload: GenerateInsightsRequest):
    insights: List[InsightItem] = []

    # 1. Process Anomalies from Phase 3
    if payload.anomalies:
        for anom in payload.anomalies[:2]:
            sev = str(anom.get("severity", "medium")).lower()
            merch = anom.get("merchant", "Unknown")
            cat = anom.get("category", "Expense")
            amt = float(anom.get("amount", 0))

            if sev == "high":
                insights.append(InsightItem(
                    type="anomaly",
                    severity="HIGH",
                    title=f"🚨 Major Unusual Spending in {cat}",
                    message=f"Your ₹{amt:,.0f} transaction at {merch} is significantly above your normal spending pattern.",
                    recommendation=f"Review this transaction at {merch} to ensure it is expected and valid."
                ))
            elif sev == "medium":
                insights.append(InsightItem(
                    type="anomaly",
                    severity="MEDIUM",
                    title=f"⚠️ Unusual Transaction in {cat}",
                    message=f"Your ₹{amt:,.0f} expense at {merch} deviates from your regular {cat} average.",
                    recommendation="Keep an eye on this category to avoid unexpected overspending."
                ))

    # 2. Process Forecast Warnings & Trends from Phase 4
    if payload.forecast and isinstance(payload.forecast, dict):
        fc = payload.forecast.get("forecast") or payload.forecast
        pred_val = float(fc.get("predictedAmount", 0)) if isinstance(fc, dict) else 0
        trend = str(payload.forecast.get("trend", "stable")).lower()
        hist_avg = float(payload.forecast.get("historicalAverage", 0))
        if hist_avg == 0 and payload.monthlySummary:
            hist_avg = payload.monthlySummary.average

        if trend == "increasing" and pred_val > hist_avg:
            diff = pred_val - hist_avg
            insights.append(InsightItem(
                type="forecast",
                severity="MEDIUM",
                title="📈 Monthly Spending Trend is Increasing",
                message=f"Your predicted spending for next month is ₹{pred_val:,.0f}, which is ₹{diff:,.0f} higher than your recent average (₹{hist_avg:,.0f}).",
                recommendation="Consider reviewing discretionary spending categories (Shopping, Food) before next month."
            ))
        elif trend == "decreasing":
            insights.append(InsightItem(
                type="trend",
                severity="POSITIVE",
                title="📉 Spending Trend is Decreasing",
                message=f"Your monthly spending is trending downwards toward ₹{pred_val:,.0f}.",
                recommendation="Great job! Keep maintaining your current spending discipline."
            ))
        elif trend == "stable" and pred_val > 0:
            insights.append(InsightItem(
                type="trend",
                severity="LOW",
                title="➡️ Stable Monthly Spending Pattern",
                message=f"Your estimated spending next month (₹{pred_val:,.0f}) is aligned with your recent average.",
                recommendation="Continue monitoring your monthly category budgets to keep spending consistent."
            ))

    # 3. Category Breakdown & Savings Opportunities
    DISCRETIONARY = {"Food & Dining", "Food", "Shopping", "Entertainment", "Travel", "Subscriptions", "Other"}
    if payload.categorySummary:
        for cat in payload.categorySummary:
            curr = cat.current
            avg = cat.average

            # Category Spike / Savings Opportunity
            if avg > 0 and curr > avg * 1.25 and (curr - avg) >= 500:
                diff = curr - avg
                pct_inc = round(((curr / avg) - 1.0) * 100)
                if cat.category in DISCRETIONARY:
                    opt_savings = min(diff * 0.75, diff)
                    insights.append(InsightItem(
                        type="savings",
                        severity="MEDIUM" if diff > 2000 else "LOW",
                        title=f"💰 Savings Opportunity in {cat.category}",
                        message=f"{cat.category} spending is ₹{curr:,.0f} this month (+{pct_inc}% above your average of ₹{avg:,.0f}).",
                        recommendation=f"Potential reduction opportunity: up to ~₹{opt_savings:,.0f} if spending returns toward your normal range."
                    ))
                else:
                    insights.append(InsightItem(
                        type="category",
                        severity="MEDIUM",
                        title=f"⚠️ Higher Spending in {cat.category}",
                        message=f"{cat.category} expenses reached ₹{curr:,.0f} this month compared to your average of ₹{avg:,.0f}.",
                        recommendation=f"Keep an eye on upcoming {cat.category} bills to stay within budget."
                    ))

            # Positive Category Decrease
            elif avg > 0 and curr < avg * 0.85 and (avg - curr) >= 300:
                pct_dec = round((1.0 - (curr / avg)) * 100)
                insights.append(InsightItem(
                    type="positive",
                    severity="POSITIVE",
                    title=f"✅ Reduced Spending in {cat.category}",
                    message=f"{cat.category} spending decreased by {pct_dec}% compared to your recent average.",
                    recommendation=f"Excellent work controlling your {cat.category} expenses!"
                ))

    # 4. Fallback Top Category Insight if insights < 2
    if len(insights) < 2 and payload.categorySummary:
        sorted_cats = sorted(payload.categorySummary, key=lambda c: -c.current)
        if sorted_cats and sorted_cats[0].current > 0:
            top_c = sorted_cats[0]
            insights.append(InsightItem(
                type="category",
                severity="LOW",
                title=f"🍔 Top Spending Category: {top_c.category}",
                message=f"{top_c.category} is your highest spending category this month at ₹{top_c.current:,.0f}.",
                recommendation=f"Consider tracking {top_c.category} expenses closely to optimize savings."
            ))

    # Sort insights by severity priority: HIGH (0) -> MEDIUM (1) -> POSITIVE (2) -> LOW (3)
    sev_rank = {"HIGH": 0, "MEDIUM": 1, "POSITIVE": 2, "LOW": 3}
    insights.sort(key=lambda item: sev_rank.get(item.severity, 4))

    # Deduplicate similar titles/messages and cap at top 4
    unique_insights: List[InsightItem] = []
    seen_titles = set()
    for ins in insights:
        if ins.title not in seen_titles:
            seen_titles.add(ins.title)
            unique_insights.append(ins)

    final_insights = unique_insights[:4]

    return GenerateInsightsResponse(
        status="success",
        message="Financial insights generated successfully.",
        insightCount=len(final_insights),
        insights=final_insights
    )
