import React from 'react';
import ActionButtons from './ActionButtons';
import { parseReason } from '../utils/helpers';

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
    <aside className="panel-right">
      {!selectedEmail ? (
        <div className="empty-analysis">
          Select an email to view analysis
        </div>
      ) : (
        <>
          <div className="analysis-subject">{selectedEmail.subject}</div>
          <div className="analysis-verdict" style={{ textTransform: 'capitalize' }}>
            {selectedEmail.label} — {selectedEmail.confidence}% Confidence
          </div>

          <div className="analysis-heading">Risk Signals</div>
          <ul className="risk-signals-list">
            {riskSignals.length > 0 ? (
              riskSignals.map((signal, idx) => (
                <li key={idx}>{signal}</li>
              ))
            ) : (
              <li>No explicit signals detected.</li>
            )}
          </ul>

          <div className="analysis-heading">AI Reasoning</div>
          <div>
            {aiReasoning.length > 0 ? (
              aiReasoning.map((finding, idx) => (
                <div key={idx} className="ai-reasoning-text">{finding}</div>
              ))
            ) : (
              <div className="ai-reasoning-text">Behavioral baseline verified.</div>
            )}
          </div>

          <ActionButtons 
            email={selectedEmail}
            onRelabel={onRelabel}
            onBlockDomain={onBlockDomain}
            onBlockSender={onBlockSender}
          />
        </>
      )}
    </aside>
  );
}
