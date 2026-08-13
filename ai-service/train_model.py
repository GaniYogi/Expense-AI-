import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score
import joblib

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(base_dir, "data", "expenses.csv")
    model_dir = os.path.join(base_dir, "model")
    os.makedirs(model_dir, exist_ok=True)

    print(f"[+] Loading dataset from {data_path}...")
    df = pd.read_csv(data_path)
    df.dropna(subset=['description', 'category'], inplace=True)
    df['description'] = df['description'].astype(str).str.strip().str.lower()

    X = df['description']
    y = df['category']

    print(f"[+] Total dataset samples: {len(df)}")
    print(f"[+] Categories count:\n{y.value_counts()}")

    # Train / test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Feature extraction with TF-IDF
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    X_train_tfidf = vectorizer.fit_transform(X_train)
    X_test_tfidf = vectorizer.transform(X_test)

    # Model training with Logistic Regression
    clf = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
    clf.fit(X_train_tfidf, y_train)

    # Model evaluation
    y_pred = clf.predict(X_test_tfidf)
    acc = accuracy_score(y_test, y_pred)
    print("\n--- Model Evaluation ---")
    print(f"Accuracy: {acc * 100:.2f}%\n")
    print(classification_report(y_test, y_pred, zero_division=0))

    # Also fit on full dataset for maximum accuracy on saved artifacts
    X_full_tfidf = vectorizer.fit_transform(X)
    clf.fit(X_full_tfidf, y)

    model_file = os.path.join(model_dir, "expense_classifier.pkl")
    vectorizer_file = os.path.join(model_dir, "vectorizer.pkl")

    joblib.dump(clf, model_file)
    joblib.dump(vectorizer, vectorizer_file)

    print(f"[SUCCESS] Saved trained model to {model_file}")
    print(f"[SUCCESS] Saved vectorizer to {vectorizer_file}")

if __name__ == "__main__":
    main()
