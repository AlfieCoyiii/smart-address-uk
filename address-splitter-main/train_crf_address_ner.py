"""
Required packages:
    pip install sklearn-crfsuite seqeval
"""
import sklearn_crfsuite
from sklearn_crfsuite import metrics
from seqeval.metrics import classification_report, accuracy_score
from sklearn.model_selection import train_test_split
import re
import sys
import numpy as np

BIO_PATH = 'address_bio_1000.txt'  # Revert to 1000-sample dataset
RESULTS_PATH = 'crf_results_1000.txt'

# --- Data Loading ---
def load_bio_file(path):
    sentences = []
    tags = []
    with open(path, encoding='utf-8') as f:
        tokens = []
        labels = []
        for line in f:
            line = line.strip()
            if not line:
                if tokens:
                    sentences.append(tokens)
                    tags.append(labels)
                    tokens = []
                    labels = []
                continue
            splits = line.split()
            if len(splits) == 2:
                token, tag = splits
                tokens.append(token)
                labels.append(tag)
        if tokens:
            sentences.append(tokens)
            tags.append(labels)
    return sentences, tags

# --- Feature Extraction ---
def word2features(sent, i):
    word = sent[i]
    features = {
        'bias': 1.0,
        'word.lower()': word.lower(),
        'word[-3:]': word[-3:],
        'word[-2:]': word[-2:],
        'word.isupper()': word.isupper(),
        'word.istitle()': word.istitle(),
        'word.isdigit()': word.isdigit(),
    }
    if i > 0:
        word1 = sent[i-1]
        features.update({
            '-1:word.lower()': word1.lower(),
            '-1:word.istitle()': word1.istitle(),
            '-1:word.isupper()': word1.isupper(),
        })
    else:
        features['BOS'] = True
    if i < len(sent)-1:
        word1 = sent[i+1]
        features.update({
            '+1:word.lower()': word1.lower(),
            '+1:word.istitle()': word1.istitle(),
            '+1:word.isupper()': word1.isupper(),
        })
    else:
        features['EOS'] = True
    return features

def sent2features(sent):
    return [word2features(sent, i) for i in range(len(sent))]

def sent2labels(labels):
    return labels

def sent2tokens(sent):
    return sent

# --- Reusable prediction function for external use ---
def predict_address_fields(rest_list, crf_model):
    """
    Given a list of address 'rest' strings and a trained CRF model, returns a list of predicted tag sequences.
    Each input string is tokenized and featurized as in training.
    """
    tokenized = [r.split() for r in rest_list]
    X = [sent2features(sent) for sent in tokenized]
    if not X:
        return []
    return crf_model.predict(X)

# --- Main ---
if __name__ == '__main__':
    print('Loading BIO data...')
    sentences, tags = load_bio_file(BIO_PATH)
    print(f"Loaded {len(sentences)} sentences with {sum(len(t) for t in tags)} total tokens")

    # Train/test split
    X = [sent2features(s) for s in sentences]
    y = [sent2labels(t) for t in tags]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    print(f"Training set: {len(X_train)} sentences, Test set: {len(X_test)} sentences")

    # Train CRF
    print('Training CRF model...')
    crf = sklearn_crfsuite.CRF(
        algorithm='lbfgs',
        c1=0.1,
        c2=0.1,
        max_iterations=100,
        all_possible_transitions=True
    )
    crf.fit(X_train, y_train)
    print('CRF training complete.')

    # Predict
    print('Evaluating...')
    y_pred = crf.predict(X_test)

    # Collect confidence scores and correctness
    conf_scores = []  # (confidence, correct)
    wrong_details = []
    for feats, true_tags, pred_tags in zip(X_test, y_test, y_pred):
        try:
            marginals = crf.predict_marginals_single(feats)
            conf = sum(max(m.values()) for m in marginals) / len(marginals)
        except Exception:
            conf = float('nan')
        correct = (true_tags == pred_tags)
        conf_scores.append((conf, correct))
        if not correct:
            tokens = [d['word.lower()'] for d in feats]
            wrong_details.append((tokens, true_tags, pred_tags, conf))

    # Bin confidence scores
    bins = np.arange(0, 1.01, 0.1)
    bin_labels = [f"{bins[i]:.1f}-{bins[i+1]:.1f}" for i in range(len(bins)-1)]
    bin_stats = {label: {'total': 0, 'correct': 0, 'wrong': 0} for label in bin_labels}
    for conf, correct in conf_scores:
        # Find bin
        for i in range(len(bins)-1):
            if bins[i] <= conf < bins[i+1] or (conf == 1.0 and bins[i+1] == 1.0):
                label = bin_labels[i]
                bin_stats[label]['total'] += 1
                if correct:
                    bin_stats[label]['correct'] += 1
                else:
                    bin_stats[label]['wrong'] += 1
                break

    # Write results to file
    with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
        f.write('--- Confidence Score Statistics ---\n')
        f.write('Range     | #Correct | #Wrong | %Correct | %Wrong | #Total\n')
        for label in bin_labels:
            total = bin_stats[label]['total']
            correct = bin_stats[label]['correct']
            wrong = bin_stats[label]['wrong']
            pct_correct = (correct / total * 100) if total > 0 else 0.0
            pct_wrong = (wrong / total * 100) if total > 0 else 0.0
            f.write(f'{label:<9} | {correct:8} | {wrong:6} | {pct_correct:8.2f} | {pct_wrong:7.2f} | {total}\n')
        f.write('\n')

        acc = accuracy_score(y_test, y_pred)
        report = classification_report(y_test, y_pred, digits=4)
        f.write(f'Token-level accuracy: {acc}\n')
        f.write('\nClassification report:\n')
        f.write(report)
        f.write('\n\n--- Incorrectly Predicted Addresses ---\n')
        for idx, (tokens, true_tags, pred_tags, conf) in enumerate(wrong_details):
            f.write(f'Address #{idx+1}:\n')
            f.write('Tokens:      ' + ' '.join(tokens) + '\n')
            f.write('True tags:   ' + ' '.join(true_tags) + '\n')
            f.write('Pred tags:   ' + ' '.join(pred_tags) + '\n')
            f.write(f'Confidence:  {conf:.4f}\n')
            f.write('\n')
    print(f"Results written to {RESULTS_PATH}")
