import React from 'react';
import styles from './TopBar.module.css';
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
    <div className={styles.avatarWrap}>
      <div 
        className={styles.avatar} 
        onClick={onToggleMenu} 
      >
        {userInitial}
      </div>
      
      {isMenuOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownName}>
            {userName || 'Admin'}
          </div>
          <div className={styles.dropdownEmail}>
            {userEmail || 'admin@inktrace.com'}
          </div>
          <button 
            className={styles.logoutButton}
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
