import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setAxiosAuthHandlers } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('accessToken') || null);
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('authUser');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [wallet, setWallet] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setWallet(null);
    setUnreadCount(0);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('authUser');
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    if (!token) {
      setUnreadCount(0);
      return;
    }

    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count || 0);
    } catch {
      setUnreadCount(0);
    }
  }, [token]);

  const refreshWallet = useCallback(async () => {
    if (!token) {
      setWallet(null);
      return null;
    }

    try {
      const { data } = await api.get('/wallet');
      setWallet(data);
      return data;
    } catch {
      return null;
    }
  }, [token]);

  const login = useCallback(
    (nextToken, nextUser) => {
      localStorage.setItem('accessToken', nextToken);
      localStorage.setItem('authUser', JSON.stringify(nextUser));
      setToken(nextToken);
      setUser(nextUser);
      fetchUnreadCount();
      refreshWallet();
    },
    [fetchUnreadCount, refreshWallet]
  );

  useEffect(() => {
    setAxiosAuthHandlers({
      tokenGetter: () => token,
      unauthorizedHandler: logout,
    });
  }, [logout, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let alive = true;

    (async () => {
      try {
        const { data } = await api.get('/auth/me');

        if (!alive) {
          return;
        }

        const resolvedUser = {
          ...(data.user || {}),
          vipTier: data.vipTier || data.user?.vipTier || user?.vipTier || null,
        };

        setUser(resolvedUser);
        localStorage.setItem('authUser', JSON.stringify(resolvedUser));
        setWallet(data.wallet || null);
      } catch {
        if (alive) {
          logout();
        }
      }
    })();

    fetchUnreadCount();

    return () => {
      alive = false;
    };
  }, [fetchUnreadCount, logout, token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const timer = setInterval(() => {
      fetchUnreadCount();
    }, 60000);

    return () => clearInterval(timer);
  }, [fetchUnreadCount, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      wallet,
      unreadCount,
      login,
      logout,
      refreshWallet,
      setWallet,
      refreshUnreadCount: fetchUnreadCount,
    }),
    [fetchUnreadCount, login, logout, refreshWallet, token, unreadCount, user, wallet]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
