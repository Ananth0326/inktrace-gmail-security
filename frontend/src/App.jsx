import React from 'react';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import EmailRow from './components/EmailRow';
import RightPanel from './components/RightPanel';
import { useAuth } from './hooks/useAuth';
import { useEmails } from './hooks/useEmails';
import { useFilters } from './hooks/useFilters';
import { useSearch } from './hooks/useSearch';

export default function App() {
  const { sessionToken, login, logout } = useAuth();
  const { emails, isLoading, selectedMail, setSelectedMail, handleMarkLabel } = useEmails(sessionToken, logout);
  const { activeFilter, setActiveFilter, filters } = useFilters(emails);
  const { searchTerm, setSearchTerm, displayedEmails } = useSearch(emails, activeFilter);

  const selectedEmailData = emails.find(m => m.id === selectedMail) || null;

  // If not authenticated, render strict minimalist login flow overlay
  if (!sessionToken) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbfbf9' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', marginBottom: '24px', fontFamily: '"Sora", "Inter", sans-serif' }}>InkTrace</h1>
        <button 
          onClick={login}
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
      <TopBar 
        user={null}
        searchQuery={searchTerm}
        onSearchChange={setSearchTerm}
        onLogout={() => {}}
        onAvatarClick={() => {}}
      />

      {/* WORKSPACE */}
      <div className="workspace">
        
        {/* LEFT PANEL */}
        <LeftPanel 
          filters={filters}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          emailStatistics={null}
          lastScanTime={null}
          isCurrentlySyncing={false}
        />

        {/* CENTER PANEL */}
        <main className="panel-center">
          <div className="feed-list">
            {isLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '14px', color: '#6e6e73' }}>
                Loading emails...
              </div>
            ) : (
              displayedEmails.map(mail => (
                <EmailRow 
                  key={mail.id}
                  email={mail}
                  isSelected={selectedMail === mail.id}
                  onClick={() => setSelectedMail(mail.id)}
                  onMenuToggle={() => {}}
                  isMenuOpen={false}
                />
              ))
            )}
          </div>
        </main>

        {/* RIGHT PANEL */}
        <RightPanel 
          selectedEmail={selectedEmailData}
          isOpen={selectedEmailData !== null}
          onClose={() => setSelectedMail(null)}
          onRelabel={handleMarkLabel}
          onBlockDomain={() => {}}
          onBlockSender={() => {}}
        />

      </div>
    </div>
  );
}
