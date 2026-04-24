import React, { useState, useEffect } from 'react';

export default function App() {
  const [sessionToken, setSessionToken] = useState(localStorage.getItem('inktrace_session') || null);
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All Mail');
  const [selectedMail, setSelectedMail] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Check URL for session token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('session');
    const authError = urlParams.get('auth_error');

    if (token) {
      setSessionToken(token);
      localStorage.setItem('inktrace_session', token);
      window.history.replaceState({}, document.title, "/");
    }

    if (authError) {
      alert("Authentication Error: " + authError);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const fetchEmails = async () => {
    if (!sessionToken) return;
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/emails?limit=50&offset=0', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          setSessionToken(null);
          localStorage.removeItem('inktrace_session');
        }
        throw new Error('Failed to fetch emails');
      }
      const data = await response.json();
      setEmails(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sessionToken) {
      fetchEmails();
    }
  }, [sessionToken]);

  const handleMarkLabel = async (emailId, newLabel) => {
    if (!sessionToken) return;
    try {
      const response = await fetch(`http://localhost:8000/emails/${emailId}/label?label=${newLabel}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      if (response.ok) {
        // Automatically refresh email list without page reload
        fetchEmails();
      }
    } catch (e) {
      console.error("Failed to update label:", e);
    }
  };

  // Processing filters dynamically
  const filterCounts = {
    'All Mail': emails.length,
    'Safe': emails.filter(e => e.label === 'safe').length,
    'Suspicious': emails.filter(e => e.label === 'suspicious').length,
    'Phishing': emails.filter(e => e.label === 'phishing').length
  };

  const filters = [
    { name: 'All Mail', count: filterCounts['All Mail'] },
    { name: 'Safe', count: filterCounts['Safe'] },
    { name: 'Suspicious', count: filterCounts['Suspicious'] },
    { name: 'Phishing', count: filterCounts['Phishing'] }
  ];

  const displayedEmails = emails.filter(e => {
    if (activeFilter !== 'All Mail' && e.label.toLowerCase() !== activeFilter.toLowerCase()) {
      return false;
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchSender = e.sender && e.sender.toLowerCase().includes(term);
      const matchSubject = e.subject && e.subject.toLowerCase().includes(term);
      const matchSnippet = e.snippet && e.snippet.toLowerCase().includes(term);
      
      if (!matchSender && !matchSubject && !matchSnippet) {
        return false;
      }
    }

    return true;
  });

  const selectedEmailData = emails.find(m => m.id === selectedMail);

  // Parse reason strings resiliently per the constraints
  const parseReason = (reasonText) => {
    if (!reasonText) return [];
    return reasonText.split(/[|\n]+/).map(s => s.trim()).filter(s => s.length > 0);
  };

  const reasonLines = selectedEmailData ? parseReason(selectedEmailData.reason) : [];
  const riskSignals = reasonLines.slice(0, 4);
  const aiReasoning = reasonLines.slice(0, 8); 

  // If not authenticated, render strict minimalist login flow overlay
  if (!sessionToken) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbfbf9' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', marginBottom: '24px', fontFamily: '"Sora", "Inter", sans-serif' }}>InkTrace</h1>
        <button 
          onClick={() => window.location.href = 'http://localhost:8000/auth/google/login'}
          style={{ border: '1.5px solid #1a1a1a', backgroundColor: 'transparent', padding: '12px 24px', cursor: 'pointer', fontFamily: '"Inter", sans-serif', fontSize: '14px', fontWeight: 600, color: '#1a1a1a', borderRadius: '0' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a1a1a'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#1a1a1a'; }}
        >
          Connect Agent
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      
      {/* TOP BAR */}
      <header className="topbar">
        <div className="brand">InkTrace</div>
        <div className="search-wrap">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search by sender, subject, or snippet..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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

        </aside>

        {/* CENTER PANEL */}
        <main className="panel-center">
          <div className="feed-list">
            {isLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '14px', color: '#6e6e73' }}>
                Loading emails...
              </div>
            ) : (
              displayedEmails.map(mail => (
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
              ))
            )}
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
              <div className="analysis-verdict" style={{ textTransform: 'capitalize' }}>
                {selectedEmailData.label} — {selectedEmailData.confidence}% Confidence
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

              <div className="action-row">
                <button 
                  className="action-button-square"
                  onClick={() => handleMarkLabel(selectedEmailData.id, 'safe')}
                >
                  Mark Safe
                </button>
                <button 
                  className="action-button-square"
                  onClick={() => handleMarkLabel(selectedEmailData.id, 'suspicious')}
                >
                  Mark Suspicious
                </button>
                <button 
                  className="action-button-square"
                  onClick={() => handleMarkLabel(selectedEmailData.id, 'phishing')}
                >
                  Report Phishing
                </button>
              </div>
            </>
          )}
        </aside>

      </div>
    </div>
  );
}
