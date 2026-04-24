import React from 'react';
import styles from './RightPanel.module.css';

export default function ActionButtons({
  emailId,
  currentLabel,
  onMark,
  onBlockDomain,
  onBlockSender
}) {
  return (
    <div className={styles.actionRow}>
      <button 
        className={styles.actionButtonSquare}
        onClick={() => onMark(emailId, 'safe')}
      >
        Mark Safe
      </button>
      <button 
        className={styles.actionButtonSquare}
        onClick={() => onMark(emailId, 'suspicious')}
      >
        Mark Suspicious
      </button>
      <button 
        className={styles.actionButtonSquare}
        onClick={() => onMark(emailId, 'phishing')}
      >
        Report Phishing
      </button>
    </div>
  );
}
