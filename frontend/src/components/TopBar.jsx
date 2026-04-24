import React, { useState } from 'react';
import Avatar from './Avatar';

export default function TopBar({ 
  user, 
  searchQuery, 
  onSearchChange, 
  onLogout 
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="brand">InkTrace</div>
      <div className="search-wrap">
        <input 
          type="text" 
          className="search-input" 
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
