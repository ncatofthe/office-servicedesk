import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { productSettingsApi } from '../api';
import type { ProductSettings } from '../types';
import { setRuntimeLocale } from '../utils/runtime-locale';

interface ProductSettingsContextValue {
  settings: ProductSettings | null;
  isLoading: boolean;
  isAvailable: boolean;
  refreshSettings: () => Promise<void>;
  applySettings: (settings: ProductSettings) => void;
}

const ProductSettingsContext = createContext<ProductSettingsContextValue | undefined>(undefined);

export const ProductSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);

  const applySettings = useCallback((nextSettings: ProductSettings) => {
    setSettings(nextSettings);
    setIsAvailable(true);
    setRuntimeLocale(nextSettings.locale, nextSettings.timezone);
    document.documentElement.lang = nextSettings.locale;
    const portalName = nextSettings.portalName.trim() || 'Office ServiceDesk';
    const companyName = nextSettings.companyName.trim();
    document.title = companyName && companyName !== portalName
      ? `${portalName} · ${companyName}`
      : portalName;
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      applySettings(await productSettingsApi.getPublic());
    } catch {
      // Optional branding must never block login or the working portal.
      setIsAvailable(false);
    } finally {
      setIsLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const value = useMemo(() => ({
    settings,
    isLoading,
    isAvailable,
    refreshSettings,
    applySettings,
  }), [applySettings, isAvailable, isLoading, refreshSettings, settings]);

  return (
    <ProductSettingsContext.Provider value={value}>
      {children}
    </ProductSettingsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProductSettings = () => {
  const context = useContext(ProductSettingsContext);
  if (!context) {
    throw new Error('useProductSettings must be used within ProductSettingsProvider');
  }
  return context;
};
