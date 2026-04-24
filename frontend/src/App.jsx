import React, { useState } from 'react';

export default function App() {
  const [activeFilter, setActiveFilter] = useState('All Mail');
  const [selectedMail, setSelectedMail] = useState(null);

  const filters = [
    { name: 'All Mail', count: 120 },
    { name: 'Safe', count: 95 },
    { name: 'Suspicious', count: 20 },
    { name: 'Phishing', count: 5 }
  ];

  const dummyEmails = [
    {
      id: 1,
      sender: 'admin@portal-auth-secure.com',
      subject: 'Immediate Action: Password Expiration Notification',
      snippet: 'Your corporate credential is set to expire in 2 hours. Click the portal link below to retain your access. Do not ignore.',
      label: 'Phishing',
      confidence: 98,
      reason: [
        "Sender domain is 0 days old with zero reputation score.",
        "DMARC baseline and SPF verification failed.",
        "Contains high-urgency psychological triggers ('expire in 2 hours').",
        "Includes external credential-harvesting payload link.",
        "Language mimics administrative identity."
      ]
    },
    {
      id: 2,
      sender: 'aws-billing@amazon.net',
      subject: 'Invoice #INV-29381 Is Overdue',
      snippet: 'We were unable to process your payment for the latest compute usage. Please review the attached PDF manifest.',
      label: 'Suspicious',
      confidence: 76,
      reason: [
        "Attachment present (PDF) usually containing external macro payloads.",
        "Masquerades as common invoice procedure.",
        "Amazon.net is a lookalike structure to standard AWS domains.",
        "Bypasses standard billing automation route identifiers."
      ]
    },
    {
      id: 3,
      sender: 'hr-team@company.internal',
      subject: 'Q3 Performance Reviews',
      snippet: 'All staff are required to submit their self-assessments by EOD Friday. The forms have been uploaded to the intranet directory.',
      label: 'Safe',
      confidence: 99,
      reason: [
        "Domain matches trusted internal ledger infrastructure.",
        "Passed local SPF identity checks.",
        "No external links; routing occurs internally.",
        "Matches expected seasonal behavioral patterns for organization."
      ]
    }
  ];

  const selectedEmailData = dummyEmails.find(m => m.id === selectedMail);

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
          <div className="left-panel-heading">Inbox</div>
          
          <div className="filter-list">
            {filters.map(filter => (
              <div 
                key={filter.name}
                className={`sidebar-filter-item ${activeFilter === filter.name ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter.name)}
              >
                {filter.name} ({filter.count})
              </div>
            ))}
          </div>

          <div className="last-scan-text">
            Last scan: 10:15 AM
          </div>
        </aside>

        {/* CENTER PANEL */}
        <main className="panel-center">
          <div className="feed-list">
            {dummyEmails.map(mail => (
              <div 
                key={mail.id}
                className={`mail-item ${mail.label.toLowerCase()} ${selectedMail === mail.id ? 'selected' : ''}`}
                onClick={() => setSelectedMail(mail.id)}
              >
                <div className="mail-top-row">
                  <div className="mail-sender">{mail.sender}</div>
                  <div className="mail-confidence">{mail.confidence}%</div>
                </div>
                <div className="mail-subject">{mail.subject}</div>
                <div className="mail-snippet">{mail.snippet}</div>
              </div>
            ))}
          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside className="panel-right">
          {!selectedEmailData ? (
            <div className="empty-analysis">
              Select an email to view analysis
            </div>
          ) : (
            <>
              <div className="analysis-subject">{selectedEmailData.subject}</div>
              <div className="analysis-verdict">
                {selectedEmailData.label} — {selectedEmailData.confidence}% Confidence
              </div>

              <div className="analysis-heading">Risk Signals</div>
              <ul className="risk-signals-list">
                {selectedEmailData.reason.slice(0, 4).map((signal, idx) => (
                  <li key={idx}>{signal}</li>
                ))}
              </ul>

              <div className="analysis-heading">AI Reasoning</div>
              <div>
                {selectedEmailData.reason.slice(0, 8).map((finding, idx) => (
                  <div key={idx} className="ai-reasoning-text">{finding}</div>
                ))}
              </div>

              <div className="action-row">
                <button className="action-button-square">Mark Safe</button>
                <button className="action-button-square">Mark Suspicious</button>
                <button className="action-button-square">Report Phishing</button>
              </div>
            </>
          )}
        </aside>

      </div>
    </div>
  );
}
