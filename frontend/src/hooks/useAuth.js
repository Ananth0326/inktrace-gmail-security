import { useState, useEffect } from 'react';

export function useAuth() {
  const [sessionToken, setSessionToken] = useState(localStorage.getItem('inktrace_session') || null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('session');
    const authError = urlParams.get('auth_error');

    if (token) {
      setSessionToken(token);
      localStorage.setItem('inktrace_session', token);
      window.history.replaceState({}, document.title, "/");
    }

    if (authError) {
      alert("Authentication Error: " + authError);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const login = () => {
    window.location.href = 'http://localhost:8000/auth/google/login';
  };

  const logout = () => {
    setSessionToken(null);
    localStorage.removeItem('inktrace_session');
  };

  return { sessionToken, login, logout };
}
