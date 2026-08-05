import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/ui/Card';
import { UserAvatar } from '../components/ui/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { usersApi } from '../api';
import { getRoleLabel } from '../utils';
import { getProfileExtras, saveProfileExtras } from '../utils/profile-extras';
import { prepareAvatarImage } from '../utils/avatar';
import {
  ACCENT_COLOR_PRESETS,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_MESSAGE_SEND_MODE,
  getUiPreferences,
  saveUiPreferences,
  type MessageSendMode,
} from '../utils/ui-preferences';

const getDepartmentLabel = (user: NonNullable<ReturnType<typeof useAuth>['user']>) => {
  const primaryDepartmentName = user.primaryDepartment?.name?.trim();
  if (primaryDepartmentName) {
    return primaryDepartmentName;
  }

  if (user.department?.trim()) {
    return user.department.trim();
  }

  const primaryMembershipName = Array.isArray(user.departmentMemberships)
    ? user.departmentMemberships.find((membership) => membership.isPrimary)?.department?.name?.trim()
    : undefined;

  if (primaryMembershipName) {
    return primaryMembershipName;
  }

  return 'Не указан';
};

export const ProfilePage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [about, setAbout] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>();
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [messageSendMode, setMessageSendMode] = useState<MessageSendMode>(DEFAULT_MESSAGE_SEND_MODE);
  const [preferencesMessage, setPreferencesMessage] = useState('');

  useEffect(() => {
    if (!user) {
      return;
    }

    const extras = getProfileExtras(user.id);
    setName(user.name);
    setAbout(extras.about || '');
    setAvatarDataUrl(user.avatar || extras.avatarDataUrl);

    const preferences = getUiPreferences(user.id);
    setAccentColor(preferences.accentColor || DEFAULT_ACCENT_COLOR);
    setMessageSendMode(preferences.messageSendMode || DEFAULT_MESSAGE_SEND_MODE);
  }, [user]);

  const departmentLabel = useMemo(() => (user ? getDepartmentLabel(user) : 'Не указан'), [user]);

  if (!user) {
    return null;
  }

  const handleAccentColorChange = (nextColor: string) => {
    setAccentColor(nextColor);
    saveUiPreferences(user.id, { accentColor: nextColor, messageSendMode });
    setPreferencesMessage('Цвет применён только для вас.');
  };

  const handleMessageSendModeChange = (nextMode: MessageSendMode) => {
    setMessageSendMode(nextMode);
    saveUiPreferences(user.id, { accentColor, messageSendMode: nextMode });
    setPreferencesMessage('Настройка отправки сообщений сохранена.');
  };

  const handleProfileSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Укажите имя');
      return;
    }

    setIsSaving(true);
    setError('');
    setSaveMessage('');

    try {
      await usersApi.updateProfile(user.id, {
        name: trimmedName,
        avatar: avatarDataUrl || null,
      });
      await refreshUser();

      saveProfileExtras(user.id, {
        about,
        avatarDataUrl,
      });

      setSaveMessage('Профиль сохранён');
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: string; message?: string } } };
      setError(apiError.response?.data?.error || apiError.response?.data?.message || 'Не удалось сохранить профиль');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!password || password.length < 6) {
      setPasswordError('Пароль должен содержать минимум 6 символов');
      return;
    }

    if (password !== passwordConfirm) {
      setPasswordError('Пароли не совпадают');
      return;
    }

    setPasswordSaving(true);
    setPasswordError('');
    setPasswordMessage('');

    try {
      await usersApi.updateProfile(user.id, { password });
      setPassword('');
      setPasswordConfirm('');
      setPasswordMessage('Пароль обновлён');
      setPasswordOpen(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: string; message?: string } } };
      setPasswordError(apiError.response?.data?.error || apiError.response?.data?.message || 'Не удалось обновить пароль');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleAvatarUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setError('');
    setSaveMessage('');
    setAvatarSaving(true);
    try {
      const nextAvatarDataUrl = await prepareAvatarImage(file);
      await usersApi.updateProfile(user.id, { avatar: nextAvatarDataUrl });
      setAvatarDataUrl(nextAvatarDataUrl);
      saveProfileExtras(user.id, { about, avatarDataUrl: nextAvatarDataUrl });
      await refreshUser();
      setSaveMessage('Аватар обновлён и уже виден коллегам.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось обработать изображение.');
    } finally {
      setAvatarSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarSaving(true);
    setError('');
    setSaveMessage('');
    try {
      await usersApi.updateProfile(user.id, { avatar: null });
      setAvatarDataUrl(undefined);
      saveProfileExtras(user.id, { about, avatarDataUrl: undefined });
      await refreshUser();
      setSaveMessage('Аватар удалён.');
    } catch (removeError: unknown) {
      const apiError = removeError as { response?: { data?: { error?: string; message?: string } } };
      setError(apiError.response?.data?.error || apiError.response?.data?.message || 'Не удалось удалить аватар.');
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Профиль</h1>
        <p className="page-subtitle mt-1">Личные данные, настройки профиля и доступные действия</p>
      </div>

      <Card padding="lg" className="space-y-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar
            name={user.name}
            avatar={avatarDataUrl}
            className="h-24 w-24 border border-[#dddddd] bg-[#f3f3f3] text-[#626262]"
          />

          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-[#1f1f1f]">{user.name}</h2>
            <p className="mt-1 text-sm text-[#6b6b6b]">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-[10px] border border-[#e2e2e2] bg-[#f7f7f7] px-3 py-1 text-xs text-[#4f4f4f]">
                Роль: {getRoleLabel(user.role)}
              </span>
              <span className="rounded-[10px] border border-[#e2e2e2] bg-[#f7f7f7] px-3 py-1 text-xs text-[#4f4f4f]">
                Отдел: {departmentLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => handleAvatarUpload(event.target.files)}
            />
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} disabled={avatarSaving}>
              {avatarSaving ? 'Сохраняем...' : 'Загрузить аватар'}
            </button>
            {avatarDataUrl && (
              <button type="button" className="btn" onClick={() => void handleAvatarRemove()} disabled={avatarSaving}>
                Удалить аватар
              </button>
            )}
            <p className="max-w-[240px] text-xs text-[#8a8a8a]">
              JPG, PNG или WebP. Изображение автоматически обрежется до квадрата и будет видно коллегам.
            </p>
          </div>
        </div>
      </Card>

      <Card padding="lg" className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1f1f1f]">Основная информация</h3>
            <p className="mt-1 text-sm text-[#6b6b6b]">Имя и аватар сохраняются на сервере, поле «О себе» пока хранится локально.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Имя</label>
            <input
              className="input w-full"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ваше имя"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Электронная почта</label>
            <input className="input w-full bg-[#fafafa]" value={user.email} readOnly />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">О себе</label>
          <textarea
            className="input min-h-[130px] w-full"
            value={about}
            onChange={(event) => setAbout(event.target.value)}
            placeholder="Коротко расскажите о себе, зоне ответственности или специализации"
          />
        </div>

        {error && <p className="text-sm text-[#b23b3b]">{error}</p>}
        {saveMessage && <p className="text-sm text-[#1f7a42]">{saveMessage}</p>}

        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={handleProfileSave} disabled={isSaving}>
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </Card>

      <Card padding="lg" className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1f1f1f]">Персонализация</h3>
          <p className="mt-1 text-sm text-[#6b6b6b]">Эти настройки видны только вам и хранятся в этом браузере.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Акцентный цвет</label>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                onClick={() => handleAccentColorChange(preset.value)}
                className={`h-9 w-9 rounded-full border-2 transition ${
                  accentColor.toLowerCase() === preset.value.toLowerCase() ? 'border-[#1f1f1f]' : 'border-transparent'
                }`}
                style={{ backgroundColor: preset.value }}
              >
                <span className="sr-only">{preset.label}</span>
              </button>
            ))}
            <label
              title="Свой цвет"
              className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-dashed border-[#c7c7c7] text-[10px] text-[#8a8a8a]"
            >
              +
              <input
                type="color"
                value={accentColor}
                onChange={(event) => handleAccentColorChange(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Отправка сообщений в чатах и комментариях</label>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-[#4a4a4a]">
              <input
                type="radio"
                className="mt-1"
                name="message-send-mode"
                checked={messageSendMode === 'enter-send'}
                onChange={() => handleMessageSendModeChange('enter-send')}
              />
              <span>
                Enter — отправить, Shift+Enter — новая строка
                <span className="mt-0.5 block text-xs text-[#8a8a8a]">Стандартное поведение.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[#4a4a4a]">
              <input
                type="radio"
                className="mt-1"
                name="message-send-mode"
                checked={messageSendMode === 'enter-newline'}
                onChange={() => handleMessageSendModeChange('enter-newline')}
              />
              <span>
                Enter — новая строка, отправка только кнопкой
                <span className="mt-0.5 block text-xs text-[#8a8a8a]">Удобно, если часто печатаете многострочные сообщения.</span>
              </span>
            </label>
          </div>
        </div>

        {preferencesMessage && <p className="text-sm text-[#1f7a42]">{preferencesMessage}</p>}
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#1f1f1f]">Безопасность</h3>
            <p className="mt-1 text-sm text-[#6b6b6b]">Смена пароля выполняется через текущий профильный API.</p>
          </div>
          <button type="button" className="btn" onClick={() => setPasswordOpen((value) => !value)}>
            {passwordOpen ? 'Скрыть форму' : 'Сменить пароль'}
          </button>
        </div>

        {passwordOpen && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Новый пароль</label>
              <input
                type="password"
                className="input w-full"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Минимум 6 символов"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Повторите пароль</label>
              <input
                type="password"
                className="input w-full"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="Повторите новый пароль"
              />
            </div>
          </div>
        )}

        {passwordError && <p className="text-sm text-[#b23b3b]">{passwordError}</p>}
        {passwordMessage && <p className="text-sm text-[#1f7a42]">{passwordMessage}</p>}

        {passwordOpen && (
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={handlePasswordSave} disabled={passwordSaving}>
              {passwordSaving ? 'Сохраняем...' : 'Обновить пароль'}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
