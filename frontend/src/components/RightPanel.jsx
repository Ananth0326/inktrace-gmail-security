import React from 'react';
import ActionButtons from './ActionButtons';
import { parseReason } from '../utils/helpers';
import styles from './RightPanel.module.css';

const riskColor = (label) => {
  if (!label) return 'var(--text-secondary)';
  const l = label.toLowerCase();
  if (l === 'phishing') return 'var(--phishing)';
  if (l === 'suspicious') return 'var(--suspicious)';
  return 'var(--safe)';
};

const confidenceColor = (label) => {
  if (!label) return 'var(--accent)';
  const l = label.toLowerCase();
  if (l === 'phishing') return 'var(--phishing)';
  if (l === 'suspicious') return 'var(--suspicious)';
  return 'var(--safe)';
};

export default function RightPanel({
  selectedEmail,
  isOpen,
  onClose,
  onRelabel,
  onBlockDomain,
  onBlockSender
}) {
  const reasonLines = selectedEmail ? parseReason(selectedEmail.reason) : [];
  const riskSignals = reasonLines.slice(0, 4);
  const aiReasoning = reasonLines.slice(0, 8);
  const confidence = selectedEmail?.confidence || 0;

  return (
    <aside className={`${styles.panel} ${isOpen ? styles.open : ''}`}>
      {!selectedEmail ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <p>Select an email to view threat analysis</p>
        </div>
      ) : (
        <div className={styles.content}>
          <div className={styles.header}>
            <span className={styles.headerLabel}>Threat Report</span>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div className={styles.subjectRow}>
            <h2 className={styles.subject}>{selectedEmail.subject}</h2>
            <span
              className={styles.riskBadge}
              style={{ backgroundColor: `${riskColor(selectedEmail.label)}20`, color: riskColor(selectedEmail.label) }}
            >
              {selectedEmail.label?.toUpperCase()}
            </span>
          </div>

          <div className={styles.confidenceRow}>
            <span className={styles.confidenceLabel}>Confidence</span>
            <span className={styles.confidenceValue} style={{ color: confidenceColor(selectedEmail.label) }}>
              {confidence}%
            </span>
          </div>
          <div className={styles.confidenceBar}>
            <div
              className={styles.confidenceFill}
              style={{
                width: `${confidence}%`,
                backgroundColor: confidenceColor(selectedEmail.label)
              }}
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Risk Signals</div>
            <div className={styles.signalList}>
              {riskSignals.length > 0 ? (
                riskSignals.map((signal, idx) => (
                  <div key={idx} className={styles.signalItem}>
                    <span className={styles.signalDot} style={{ backgroundColor: riskColor(selectedEmail.label) }} />
                    <span>{signal}</span>
                  </div>
                ))
              ) : (
                <div className={styles.signalItem}>
                  <span className={styles.signalDot} style={{ backgroundColor: 'var(--safe)' }} />
                  <span>No explicit signals detected.</span>
                </div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>AI Reasoning</div>
            <div className={styles.reasoningBox}>
              {aiReasoning.length > 0 ? (
                aiReasoning.map((finding, idx) => (
                  <p key={idx} className={styles.reasoningText}>{finding}</p>
                ))
              ) : (
                <p className={styles.reasoningText}>Behavioral baseline verified. No anomalies detected.</p>
              )}
            </div>
          </div>

          <div className={styles.actions}>
            <ActionButtons
              emailId={selectedEmail.id}
              currentLabel={selectedEmail.label}
              onMark={onRelabel}
              onBlockDomain={onBlockDomain}
              onBlockSender={onBlockSender}
            />
          </div>
        </div>
      )}
    </aside>
  );
}