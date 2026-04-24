import React from 'react';
import ActionButtons from './ActionButtons';
import { parseReason } from '../utils/helpers';
import styles from './RightPanel.module.css';

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

  return (
    <aside className={styles.panelRight}>
      {!selectedEmail ? (
        <div className={styles.emptyAnalysis}>
          Select an email to view analysis
        </div>
      ) : (
        <>
          <div className={styles.analysisSubject}>{selectedEmail.subject}</div>
          <div className={styles.analysisVerdict}>
            {selectedEmail.label} — {selectedEmail.confidence}% Confidence
          </div>

          <div className={styles.analysisHeading}>Risk Signals</div>
          <ul className={styles.riskSignalsList}>
            {riskSignals.length > 0 ? (
              riskSignals.map((signal, idx) => (
                <li key={idx}>{signal}</li>
              ))
            ) : (
              <li>No explicit signals detected.</li>
            )}
          </ul>

          <div className={styles.analysisHeading}>AI Reasoning</div>
          <div>
            {aiReasoning.length > 0 ? (
              aiReasoning.map((finding, idx) => (
                <div key={idx} className={styles.aiReasoningText}>{finding}</div>
              ))
            ) : (
              <div className={styles.aiReasoningText}>Behavioral baseline verified.</div>
            )}
          </div>

          <ActionButtons 
            emailId={selectedEmail.id}
            currentLabel={selectedEmail.label}
            onMark={onRelabel}
            onBlockDomain={onBlockDomain}
            onBlockSender={onBlockSender}
          />
        </>
      )}
    </aside>
  );
}
