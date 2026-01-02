import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [vendor, setVendor] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchVendorProfile();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchVendorProfile = async () => {
    try {
      const response = await api.get('/vendor/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setVendor(response.data.vendor);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await api.post('/vendor/login', { email, password });
    if (response.data.success) {
      setToken(response.data.token);
      setVendor(response.data.vendor);
      localStorage.setItem('token', response.data.token);
      return response.data;
    }
    throw new Error('Login failed');
  };

  const register = async (name, email, password, businessName) => {
    const response = await api.post('/vendor/register', {
      name,
      email,
      password,
      businessName
    });
    if (response.data.success) {
      setToken(response.data.token);
      setVendor(response.data.vendor);
      localStorage.setItem('token', response.data.token);
      return response.data;
    }
    throw new Error('Registration failed');
  };

  const logout = () => {
    setToken(null);
    setVendor(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider
      value={{
        vendor,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!vendor
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
