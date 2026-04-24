import { useState } from 'react';

export function useSearch(emails, activeFilter) {
  const [searchTerm, setSearchTerm] = useState('');

  const displayedEmails = emails.filter(e => {
    if (activeFilter !== 'All Mail' && e.label.toLowerCase() !== activeFilter.toLowerCase()) {
      return false;
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchSender = e.sender && e.sender.toLowerCase().includes(term);
      const matchSubject = e.subject && e.subject.toLowerCase().includes(term);
      const matchSnippet = e.snippet && e.snippet.toLowerCase().includes(term);
      
      if (!matchSender && !matchSubject && !matchSnippet) {
        return false;
      }
    }

    return true;
  });

  return { searchTerm, setSearchTerm, displayedEmails };
}
