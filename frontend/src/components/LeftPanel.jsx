import React from 'react';

export default function LeftPanel({
  filters,
  activeFilter,
  onFilterChange,
  emailStatistics,
  lastScanTime,
  isCurrentlySyncing
}) {
  return (
    <aside className="panel-left">
      <div className="left-panel-heading">Inbox</div>
      
      <div className="filter-list">
        {filters.map(filter => (
          <div 
            key={filter.name}
            className={`sidebar-filter-item ${activeFilter === filter.name ? 'active' : ''}`}
            onClick={() => onFilterChange(filter.name)}
          >
            {filter.name} ({filter.count})
          </div>
        ))}
      </div>
    </aside>
  );
}
