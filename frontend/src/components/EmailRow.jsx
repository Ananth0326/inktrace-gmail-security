import React from 'react';
import { getLabelBadgeCSSClass } from '../utils/helpers';
import styles from '../CenterPanel.module.css';

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
          <div className={styles.mailConfidence}>{email.confidence}%</div>
          <button className={styles.menuTrigger} onClick={handleMenuClick}>...</button>
          
          {isMenuOpen && (
            <div className={styles.actionMenu}>
              <div className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'safe')}>Mark Safe</div>
              <div className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'suspicious')}>Mark Suspicious</div>
              <div className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'phishing')}>Mark Phishing</div>
              {isHighRisk && (
                <div className={styles.actionMenuItem} onClick={(e) => handleActionClick(e, 'block')}>Block Domain</div>
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
