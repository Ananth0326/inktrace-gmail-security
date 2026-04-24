import React, { useState, useRef, useCallback } from 'react';
import EmailRow from './EmailRow';
import styles from '../CenterPanel.module.css';

export default function CenterPanel({
  emails,
  isLoading,
  selectedEmailId,
  onSelectEmail,
  onRelabel,
  onBlockDomain,
  onBlockSender,
  onLoadMore,
  hasMore,
  syncStatus,
  isSyncing
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const observer = useRef();

  const lastElementRef = useCallback(node => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        if (onLoadMore) onLoadMore();
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoading, hasMore, onLoadMore]);

  return (
    <main className={styles.panelCenterOuter}>
      <div className={styles.centerHeader}>
        <div className={styles.centerTitle}>Feed ({emails.length})</div>
        <div className={styles.columnHeaders}>
          <div className={styles.colSource}>Source</div>
          <div className={styles.colContext}>Context</div>
          <div className={styles.colStatus}>Status</div>
        </div>
      </div>

      {isSyncing && (
        <div className={styles.syncBanner}>
          Syncing... {syncStatus?.progress || ''}
        </div>
      )}

      <div className={styles.feedWrapper}>
        {isLoading && emails.length === 0 ? (
          <div className={styles.emptyText}>Loading emails...</div>
        ) : emails.length === 0 ? (
          <div className={styles.emptyText}>No emails found</div>
        ) : (
          <div className={styles.feedList}>
            {emails.map((mail, index) => {
              if (emails.length === index + 1) {
                return (
                  <div ref={lastElementRef} key={`wrapper-${mail.id}`}>
                    <EmailRow 
                      key={mail.id}
                      email={mail}
                      isSelected={selectedEmailId === mail.id}
                      onClick={() => onSelectEmail(mail.id)}
                      onMenuToggle={() => setOpenMenuId(openMenuId === mail.id ? null : mail.id)}
                      isMenuOpen={openMenuId === mail.id}
                      onQuickRelabel={onRelabel}
                      onBlockDomain={onBlockDomain}
                    />
                  </div>
                )
              } else {
                return (
                  <EmailRow 
                    key={mail.id}
                    email={mail}
                    isSelected={selectedEmailId === mail.id}
                    onClick={() => onSelectEmail(mail.id)}
                    onMenuToggle={() => setOpenMenuId(openMenuId === mail.id ? null : mail.id)}
                    isMenuOpen={openMenuId === mail.id}
                    onQuickRelabel={onRelabel}
                    onBlockDomain={onBlockDomain}
                  />
                )
              }
            })}
          </div>
        )}
      </div>
    </main>
  );
}
