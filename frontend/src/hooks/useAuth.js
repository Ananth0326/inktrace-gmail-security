import { useState, useEffect } from 'react';

export function useAuth() {
  const [sessionToken, setSessionToken] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Read session from URL after OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("session");
    const errorFromUrl = urlParams.get("auth_error");

    if (tokenFromUrl) {
      localStorage.setItem("sessionToken", tokenFromUrl);
      setSessionToken(tokenFromUrl);
      window.history.replaceState({}, "", "/");
    }

    if (errorFromUrl) {
      setAuthError(errorFromUrl);
      window.history.replaceState({}, "", "/");
    }

    // Check localStorage for existing session
    const savedToken = localStorage.getItem("sessionToken");
    if (savedToken && !tokenFromUrl && !sessionToken) {
      setSessionToken(savedToken);
    }
  }, []);

  const login = () => {
    // Call backend to get Google OAuth URL
    fetch("http://localhost:8000/auth/google/login")
      .then(res => res.json())
      .then(data => {
        if (data.auth_url) {
          window.location.href = data.auth_url;
        }
      })
      .catch(err => console.error("Login failed:", err));
  };

  const logout = () => {
    localStorage.removeItem("sessionToken");
    setSessionToken(null);
    // Optional: call backend logout endpoint
  };

  return { sessionToken, authError, login, logout };
}