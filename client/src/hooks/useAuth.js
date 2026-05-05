import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Simple auth hook.
 * Reads access token from localStorage and provides user state.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    axios
      .get('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      })
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    if (refreshToken) {
      axios.post('/api/auth/logout', { refreshToken }).catch(() => {});
    }
    setUser(null);
  }

  return { user, loading, logout };
}
