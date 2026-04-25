import React from 'react';
import styles from './ActionButtons.module.css';

export default function ActionButtons({
  emailId,
  currentLabel,
  onMark,
  onBlockDomain,
  onBlockSender
}) {
  return (
    <div className={styles.actionRow}>
      {currentLabel !== 'Safe' && (
        <button
          className={`${styles.btn} ${styles.safe}`}
          onClick={() => onMark(emailId, 'Safe')}
        >
          Mark Safe
        </button>
      )}
      {currentLabel !== 'Suspicious' && (
        <button
          className={`${styles.btn} ${styles.suspicious}`}
          onClick={() => onMark(emailId, 'Suspicious')}
        >
          Mark Suspicious
        </button>
      )}
      {currentLabel !== 'Phishing' && (
        <button
          className={`${styles.btn} ${styles.phishing}`}
          onClick={() => onMark(emailId, 'Phishing')}
        >
          Report Phishing
        </button>
      )}
    </div>
  );
}