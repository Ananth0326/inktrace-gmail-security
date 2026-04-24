import React from 'react';
import styles from './App.module.css';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
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

  if (!sessionToken) {
    return (
      <div className={styles.loginOverlay}>
        <h1 className={styles.loginTitle}>InkTrace</h1>
        <button 
          onClick={login}
          className={styles.loginButton}
        >
          Connect Agent
        </button>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <TopBar 
        user={null}
        searchQuery={searchTerm}
        onSearchChange={setSearchTerm}
        onLogout={logout}
      />

      <div className={styles.workspace}>
        <LeftPanel 
          filters={filters}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          emailStatistics={null}
          lastScanTime={null}
          isCurrentlySyncing={false}
        />

        <CenterPanel 
          emails={displayedEmails}
          isLoading={isLoading}
          selectedEmailId={selectedMail}
          onSelectEmail={setSelectedMail}
          onRelabel={handleMarkLabel}
          onBlockDomain={() => {}}
          onBlockSender={() => {}}
          onLoadMore={() => {}}
          hasMore={false}
          syncStatus={{progress: ''}}
          isSyncing={false}
        />

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
