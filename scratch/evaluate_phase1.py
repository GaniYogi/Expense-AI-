import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, "ai-service", "data", "expenses.csv")

    print("==================================================")
    print("PHASE 1 MODEL EVALUATION")
    print("==================================================")
    print(f"Dataset Path: {data_path}")

    if not os.path.exists(data_path):
        print(f"ERROR: Dataset not found at {data_path}")
        return

    df = pd.read_csv(data_path)
    df.dropna(subset=['description', 'category'], inplace=True)
    df['description'] = df['description'].astype(str).str.strip().str.lower()

    X = df['description']
    y = df['category']

    print(f"Total Samples: {len(df)}")
    print(f"Number of Categories: {y.nunique()}")
    print("\nClass Distribution:")
    class_counts = y.value_counts()
    for cat, count in class_counts.items():
        print(f"  - {cat:15s}: {count:3d} samples ({count/len(df)*100:.1f}%)")

    # 80/20 train/test split with stratify and random_state=42
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    X_train_tfidf = vectorizer.fit_transform(X_train)
    X_test_tfidf = vectorizer.transform(X_test)

    clf = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
    clf.fit(X_train_tfidf, y_train)

    y_pred = clf.predict(X_test_tfidf)

    acc = accuracy_score(y_test, y_pred)
    prec_macro = precision_score(y_test, y_pred, average='macro', zero_division=0)
    rec_macro = recall_score(y_test, y_pred, average='macro', zero_division=0)
    f1_macro = f1_score(y_test, y_pred, average='macro', zero_division=0)
    f1_weighted = f1_score(y_test, y_pred, average='weighted', zero_division=0)

    print("\n--------------------------------------------------")
    print("EVALUATION METRICS (80/20 Stratified Split, random_state=42)")
    print("--------------------------------------------------")
    print(f"Accuracy:        {acc * 100:.2f}%")
    print(f"Precision (Macro): {prec_macro * 100:.2f}%")
    print(f"Recall (Macro):    {rec_macro * 100:.2f}%")
    print(f"F1 Score (Macro):  {f1_macro * 100:.2f}%")
    print(f"F1 Score (Weighted): {f1_weighted * 100:.2f}%")

    print("\nDetailed Classification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    classes = sorted(y.unique())
    cm = confusion_matrix(y_test, y_pred, labels=classes)
    cm_df = pd.DataFrame(cm, index=classes, columns=classes)

    print("Confusion Matrix:")
    print(cm_df.to_string())

    print("\n[NOTE] Evaluation complete. Production .pkl files were NOT overwritten.")

if __name__ == "__main__":
    main()
