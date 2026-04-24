import React from 'react';
import { getUserInitial } from '../utils/helpers';

export default function Avatar({
  userName,
  userEmail,
  onLogout,
  isMenuOpen,
  onToggleMenu
}) {
  const userInitial = getUserInitial(userName);

  return (
    <div className="avatar-wrap" style={{ position: 'relative' }}>
      <div 
        className="avatar" 
        onClick={onToggleMenu} 
        style={{ cursor: 'pointer' }}
      >
        {userInitial}
      </div>
      
      {isMenuOpen && (
        <div style={{
          position: 'absolute',
          top: '48px',
          right: '0',
          width: '200px',
          backgroundColor: '#fbfbf9',
          border: '1.5px solid #1a1a1a',
          padding: '16px',
          zIndex: 10
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
            {userName || 'Admin'}
          </div>
          <div style={{ fontSize: '11px', color: '#6e6e73', marginBottom: '16px', wordBreak: 'break-all' }}>
            {userEmail || 'admin@inktrace.com'}
          </div>
          <button 
            className="action-button-square"
            style={{ width: '100%' }}
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
