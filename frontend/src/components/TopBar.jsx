import React, { useState } from 'react';
import styles from './TopBar.module.css';
import Avatar from './Avatar';

export default function TopBar({ 
  user, 
  searchQuery, 
  onSearchChange, 
  onLogout 
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>InkTrace</div>
      <div className={styles.searchWrap}>
        <input 
          type="text" 
          className={styles.searchInput} 
          placeholder="Search by sender, subject, or snippet..." 
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <Avatar 
        userName={user?.name || ''}
        userEmail={user?.email || ''}
        onLogout={onLogout}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
      />
    </header>
  );
}
