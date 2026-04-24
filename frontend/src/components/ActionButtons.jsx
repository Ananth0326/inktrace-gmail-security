import React from 'react';

export default function ActionButtons({
  email,
  onRelabel,
  onBlockDomain,
  onBlockSender
}) {
  return (
    <div className="action-row">
      <button 
        className="action-button-square"
        onClick={() => onRelabel(email.id, 'safe')}
      >
        Mark Safe
      </button>
      <button 
        className="action-button-square"
        onClick={() => onRelabel(email.id, 'suspicious')}
      >
        Mark Suspicious
      </button>
      <button 
        className="action-button-square"
        onClick={() => onRelabel(email.id, 'phishing')}
      >
        Report Phishing
      </button>
    </div>
  );
}
