import React from 'react';
import styles from './LeftPanel.module.css';

export default function LeftPanel({
  filters,
  activeFilter,
  onFilterChange,
  emailStatistics,
  lastScanTime,
  isCurrentlySyncing
}) {
  return (
    <aside className={styles.panelLeft}>
      <div className={styles.leftPanelHeading}>Inbox</div>
      
      <div className={styles.filterList}>
        {filters.map(filter => (
          <div 
            key={filter.name}
            className={`${styles.sidebarFilterItem} ${activeFilter === filter.name ? styles.active : ''}`}
            onClick={() => onFilterChange(filter.name)}
          >
            {filter.name} ({filter.count})
          </div>
        ))}
      </div>
    </aside>
  );
}
