import { useState, useEffect } from 'react';

export function useEmails(sessionToken, logout) {
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMail, setSelectedMail] = useState(null);

  const fetchEmails = async () => {
    if (!sessionToken) return;
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/emails?limit=50&offset=0', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          logout();
        }
        throw new Error('Failed to fetch emails');
      }
      const data = await response.json();
      setEmails(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sessionToken) {
      fetchEmails();
    } else {
      setEmails([]);
    }
  }, [sessionToken]);

  const handleMarkLabel = async (emailId, newLabel) => {
    if (!sessionToken) return;
    try {
      const response = await fetch(`http://localhost:8000/emails/${emailId}/label?label=${newLabel}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      if (response.ok) {
        fetchEmails();
      }
    } catch (e) {
      console.error("Failed to update label:", e);
    }
  };

  return { emails, isLoading, selectedMail, setSelectedMail, handleMarkLabel };
}
