import React from 'react';
import { getLabelBadgeCSSClass } from '../utils/helpers';

export default function EmailRow({
  email,
  isSelected,
  onClick,
  onMenuToggle,
  isMenuOpen
}) {
  return (
    <div 
      className={`mail-item ${getLabelBadgeCSSClass(email.label)} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="mail-top-row">
        <div className="mail-sender">{email.sender}</div>
        <div className="mail-confidence">{email.confidence}%</div>
      </div>
      <div className="mail-subject">{email.subject}</div>
      <div className="mail-snippet">{email.snippet}</div>
    </div>
  );
}
