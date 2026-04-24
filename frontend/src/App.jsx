import React, { useState } from 'react';

export default function App() {
  const [activeFilter, setActiveFilter] = useState('All Intelligence');
  const [selectedMail, setSelectedMail] = useState(1);

  const filters = [
    'All Intelligence',
    'High Risk',
    'Suspicious',
    'Safe',
    'Quarantine'
  ];

  return (
    <div className="dashboard">
      
      {/* TOP BAR */}
      <header className="topbar">
        <div className="brand">INKTRACE</div>
        <div className="search-wrap">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search telemetry..." 
          />
        </div>
        <div className="avatar-wrap">
          <div className="avatar">A</div>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="workspace">
        
        {/* LEFT PANEL */}
        <aside className="panel-left">
          <div className="section-title">Filters</div>
          {filters.map(filter => (
            <div 
              key={filter}
              className={`filter-item ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </div>
          ))}
        </aside>

        {/* CENTER PANEL */}
        <main className="panel-center">
          <div className="feed-list">
            
            <div 
              className={`mail-item ${selectedMail === 1 ? 'selected' : ''}`}
              onClick={() => setSelectedMail(1)}
            >
              <div className="mail-sender">admin@portal-auth-secure.com</div>
              <div className="mail-subject">Immediate Action: Password Expiration Notification</div>
              <div className="mail-snippet">Your corporate credential is set to expire in 2 hours. Click the portal link below to retain your access. Do not ignore.</div>
            </div>

            <div 
              className={`mail-item ${selectedMail === 2 ? 'selected' : ''}`}
              onClick={() => setSelectedMail(2)}
            >
              <div className="mail-sender">aws-billing@amazon.net</div>
              <div className="mail-subject">Invoice #INV-29381 Is Overdue</div>
              <div className="mail-snippet">We were unable to process your payment for the latest compute usage. Please review the attached PDF manifest.</div>
            </div>

            <div 
              className={`mail-item ${selectedMail === 3 ? 'selected' : ''}`}
              onClick={() => setSelectedMail(3)}
            >
              <div className="mail-sender">hr-team@company.internal</div>
              <div className="mail-subject">Q3 Performance Reviews</div>
              <div className="mail-snippet">All staff are required to submit their self-assessments by EOD Friday. The forms have been uploaded to the intranet directory.</div>
            </div>

          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside className="panel-right">
          <h2 className="analysis-title">Threat Forensics</h2>
          
          {selectedMail === 1 && (
            <>
              <div className="info-block">
                <div className="info-label">Verdict</div>
                <div className="info-value">HIGH RISK PHISHING</div>
              </div>

              <div className="info-block">
                <div className="info-label">Sender Evaluation</div>
                <div className="info-value">admin@portal-auth-secure.com</div>
                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-grey)' }}>
                  Fresh domain (0 days old). Zero historical trust. DMARC fail.
                </div>
              </div>

              <div className="info-block">
                <div className="info-label">AI Reasoning Context</div>
                <div className="info-value" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                  The message creates artificial urgency ("expire in 2 hours") compelling the user to click a suspicious external link payload. The domain is attempting to visually masquerade as an internal authentication portal.
                </div>
              </div>

              <button className="action-btn">
                Quarantine Payload
              </button>
            </>
          )}

          {selectedMail !== 1 && (
            <div className="info-value" style={{ color: 'var(--text-grey)', fontSize: '0.9rem' }}>
              Select a message mapping to view deep-dive analytics and AI forensics.
            </div>
          )}

        </aside>

      </div>
    </div>
  );
}
