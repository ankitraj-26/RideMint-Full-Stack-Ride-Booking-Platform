import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('ridego_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/auth/me');
        setUser(response.data.user);
      } catch (error) {
        localStorage.removeItem('ridego_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [token]);

  const login = async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('ridego_token', newToken);
    setToken(newToken);
    setUser(userData);
    return response.data;
  };

  const register = async (payload) => {
    const response = await api.post('/auth/register', payload);
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('ridego_token', newToken);
    setToken(newToken);
    setUser(userData);
    return response.data;
  };

  const refreshUser = async () => {
    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
      return response.data.user;
    } catch (error) {
      localStorage.removeItem('ridego_token');
      setToken(null);
      setUser(null);
      return null;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout request failed', error);
    }

    localStorage.removeItem('ridego_token');
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      refreshUser,
      logout,
      isAuthenticated: !!user,
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
