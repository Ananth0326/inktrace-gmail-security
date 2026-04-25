import React from 'react';
import { getLabelBadgeCSSClass } from '../utils/helpers';
import styles from '../CenterPanel.module.css';

const pillStyle = (label) => {
  const l = (label || '').toLowerCase();
  if (l === 'phishing') return { background: 'rgba(255,69,58,0.15)', color: '#ff453a' };
  if (l === 'suspicious') return { background: 'rgba(255,214,10,0.15)', color: '#ffd60a' };
  return { background: 'rgba(48,209,88,0.15)', color: '#30d158' };
};

export default function EmailRow({
  email,
  isSelected,
  onClick,
  onMenuToggle,
  isMenuOpen,
  onQuickRelabel,
  onBlockDomain
}) {
  const isHighRisk = email.label === 'phishing' || (email.label === 'suspicious' && email.confidence >= 75);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    onMenuToggle();
  };

  const handleActionClick = (e, actionType) => {
    e.stopPropagation();
    onMenuToggle();
    if (actionType === 'safe') onQuickRelabel(email.id, 'safe');
    if (actionType === 'suspicious') onQuickRelabel(email.id, 'suspicious');
    if (actionType === 'phishing') onQuickRelabel(email.id, 'phishing');
    if (actionType === 'block') onBlockDomain(email.sender);
  };

  return (
    <div
      className={`${styles.mailItem} ${styles[getLabelBadgeCSSClass(email.label)] || ''} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
    >
      <div className={styles.mailTopRow}>
        <div className={styles.mailSender}>{email.sender}</div>
        <div className={styles.menuWrapper}>
          <span
            className={styles.mailConfidencePill}
            style={pillStyle(email.label)}
          >
            {email.confidence}%
          </span>
          <button className={styles.menuTrigger} onClick={handleMenuClick}>···</button>

          {isMenuOpen && (
            <div className={styles.actionMenu}>
              <button className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'safe')}>Mark Safe</button>
              <button className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'suspicious')}>Mark Suspicious</button>
              <button className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'phishing')}>Mark Phishing</button>
              {isHighRisk && (
                <button className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'block')}>Block Domain</button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.mailSubject}>{email.subject}</div>
      <div className={styles.mailSnippet}>{email.snippet}</div>
    </div>
  );
}