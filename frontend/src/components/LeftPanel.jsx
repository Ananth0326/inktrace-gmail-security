import React from 'react';
import styles from './LeftPanel.module.css';

export default function LeftPanel({
  filters,
  activeFilter,
  onFilterChange,
  isOpen,
  onToggle
}) {
  const total = filters.reduce((sum, f) => f.name === 'All Mail' ? sum : sum + f.count, 0);
  const safe = filters.find(f => f.name === 'Safe')?.count || 0;
  const suspicious = filters.find(f => f.name === 'Suspicious')?.count || 0;
  const phishing = filters.find(f => f.name === 'Phishing')?.count || 0;

  return (
    <aside className={`${styles.panel} ${!isOpen ? styles.collapsed : ''}`}>
      {isOpen && (
        <>
          <div className={styles.header}>
            <span className={styles.logo}>InkTrace</span>
            <button className={styles.toggleBtn} onClick={onToggle} title="Collapse sidebar">
              ←
            </button>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statNumber}>{total}</span>
              <span className={styles.statLabel}>Scanned</span>
            </div>
            <div className={`${styles.statCard} ${styles.safeCard}`}>
              <span className={styles.statNumber} style={{ color: 'var(--safe)' }}>{safe}</span>
              <span className={styles.statLabel}>Safe</span>
            </div>
            <div className={`${styles.statCard} ${styles.suspiciousCard}`}>
              <span className={styles.statNumber} style={{ color: 'var(--suspicious)' }}>{suspicious}</span>
              <span className={styles.statLabel}>Suspicious</span>
            </div>
            <div className={`${styles.statCard} ${styles.phishingCard}`}>
              <span className={styles.statNumber} style={{ color: 'var(--phishing)' }}>{phishing}</span>
              <span className={styles.statLabel}>Phishing</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.filterList}>
            <span className={styles.filterHeading}>Filter</span>
            {filters.map(filter => (
              <button
                key={filter.name}
                className={`${styles.filterItem} ${activeFilter === filter.name ? styles.active : ''}`}
                onClick={() => onFilterChange(filter.name)}
              >
                <span className={styles.filterDot} style={{
                  backgroundColor:
                    filter.name === 'Safe' ? 'var(--safe)' :
                    filter.name === 'Suspicious' ? 'var(--suspicious)' :
                    filter.name === 'Phishing' ? 'var(--phishing)' :
                    'var(--text-tertiary)'
                }} />
                <span className={styles.filterName}>{filter.name}</span>
                <span className={styles.filterCount}>{filter.count}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {!isOpen && (
        <button className={styles.expandBtn} onClick={onToggle} title="Expand sidebar">
          →
        </button>
      )}
    </aside>
  );
}