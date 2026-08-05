import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { SessionUser, LoginRequest, RegisterRequest } from '../types';
import { authApi } from '../api';
import { applyAccentColor, getUiPreferences, UI_PREFERENCES_UPDATED_EVENT } from '../utils/ui-preferences';

interface AuthContextType {
  user: SessionUser | null;
  token: string | null;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getResponseStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: { status?: number } }).response;
  return typeof response?.status === 'number' ? response.status : undefined;
};

const getStoredAuth = () => {
  try {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      return { token, user: JSON.parse(userStr) as SessionUser };
    }
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  return { token: null, user: null as SessionUser | null };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stored = getStoredAuth();
  const [user, setUser] = useState<SessionUser | null>(stored.user);
  const [token, setToken] = useState<string | null>(stored.token);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(async (data: LoginRequest) => {
    const response = await authApi.login(data);
    if (response.token) {
      setToken(response.token);
      setUser(response.user);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    await authApi.register(data);
  }, []);

  const logout = useCallback(() => {
    const tokenToRevoke = token;
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (tokenToRevoke) {
      authApi.logout(tokenToRevoke).catch(() => {});
    }
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) {
      return;
    }

    const { user: nextUser } = await authApi.getMe();
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  }, [token]);

  useEffect(() => {
    const hydrateUser = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        await refreshUser();
      } catch (error) {
        if (getResponseStatus(error) === 401) {
          logout();
        } else {
          console.warn('Auth hydration failed temporarily; keeping existing session.', error);
        }
      } finally {
        setIsLoading(false);
      }
    };
    hydrateUser();
    // logout is stable due to useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshUser, token]);

  useEffect(() => {
    applyAccentColor(user ? getUiPreferences(user.id).accentColor : undefined);

    if (!user) {
      return;
    }

    const handlePreferencesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string }>).detail;
      if (detail?.userId === user.id) {
        applyAccentColor(getUiPreferences(user.id).accentColor);
      }
    };

    window.addEventListener(UI_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdated);
    return () => window.removeEventListener(UI_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdated);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
