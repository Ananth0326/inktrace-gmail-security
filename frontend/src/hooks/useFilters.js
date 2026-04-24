import { useState } from 'react';

export function useFilters(emails) {
  const [activeFilter, setActiveFilter] = useState('All Mail');

  const filterCounts = {
    'All Mail': emails.length,
    'Safe': emails.filter(e => e.label === 'safe').length,
    'Suspicious': emails.filter(e => e.label === 'suspicious').length,
    'Phishing': emails.filter(e => e.label === 'phishing').length
  };

  const filters = [
    { name: 'All Mail', count: filterCounts['All Mail'] },
    { name: 'Safe', count: filterCounts['Safe'] },
    { name: 'Suspicious', count: filterCounts['Suspicious'] },
    { name: 'Phishing', count: filterCounts['Phishing'] }
  ];

  return { activeFilter, setActiveFilter, filters };
}
