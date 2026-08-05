export type MessageSendMode = 'enter-send' | 'enter-newline';

export interface UiPreferences {
  accentColor?: string;
  messageSendMode?: MessageSendMode;
}

export const UI_PREFERENCES_UPDATED_EVENT = 'ui-preferences-updated';
export const DEFAULT_ACCENT_COLOR = '#2f2f2f';
export const DEFAULT_MESSAGE_SEND_MODE: MessageSendMode = 'enter-send';

const getStorageKey = (userId: string) => `ui-preferences:${userId}`;

const readStoredUiPreferences = (userId: string): UiPreferences => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as UiPreferences;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const emitUiPreferencesUpdated = (userId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(UI_PREFERENCES_UPDATED_EVENT, {
      detail: { userId },
    })
  );
};

export const getUiPreferences = (userId?: string | null): UiPreferences => {
  if (!userId) {
    return {};
  }

  return readStoredUiPreferences(userId);
};

export const saveUiPreferences = (userId: string, nextPreferences: UiPreferences): UiPreferences => {
  const normalized: UiPreferences = {
    accentColor: nextPreferences.accentColor || undefined,
    messageSendMode: nextPreferences.messageSendMode || undefined,
  };

  localStorage.setItem(getStorageKey(userId), JSON.stringify(normalized));
  emitUiPreferencesUpdated(userId);
  return normalized;
};

export const getMessageSendMode = (userId?: string | null): MessageSendMode =>
  getUiPreferences(userId).messageSendMode || DEFAULT_MESSAGE_SEND_MODE;

const darkenHexColor = (hex: string, amount: number): string => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }

  const r = Math.max(0, Math.round(parseInt(normalized.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(normalized.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(normalized.slice(4, 6), 16) * (1 - amount)));

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const applyAccentColor = (accentColor?: string) => {
  if (typeof document === 'undefined') {
    return;
  }

  const color = accentColor || DEFAULT_ACCENT_COLOR;
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-hover', darkenHexColor(color, 0.15));
};

export const ACCENT_COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'Как в системе', value: DEFAULT_ACCENT_COLOR },
  { label: 'Синий', value: '#2f5fdb' },
  { label: 'Зелёный', value: '#1f7a42' },
  { label: 'Бирюзовый', value: '#0e8a8a' },
  { label: 'Фиолетовый', value: '#6b3fd6' },
  { label: 'Оранжевый', value: '#c2660f' },
  { label: 'Малиновый', value: '#b23b6f' },
];
