import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { productSettingsApi, serviceDeskFoldersApi } from '../../api';
import { useProductSettings } from '../../contexts/ProductSettingsContext';
import type { ProductSettings, ServiceDeskFolder, TaskPriority, UpdateProductSettingsInput } from '../../types';
import { formatDateTime, priorityLabels } from '../../utils';

interface SettingsDraft {
  portalName: string;
  companyName: string;
  welcomeMessage: string;
  locale: string;
  timezone: string;
  defaultPriority: TaskPriority;
  defaultFolderId: string;
}

const DEFAULT_DRAFT: SettingsDraft = {
  portalName: 'Office ServiceDesk',
  companyName: '',
  welcomeMessage: '',
  locale: 'ru-RU',
  timezone: 'Europe/Moscow',
  defaultPriority: 'MEDIUM',
  defaultFolderId: '',
};

const toDraft = (settings: ProductSettings): SettingsDraft => ({
  portalName: settings.portalName,
  companyName: settings.companyName,
  welcomeMessage: settings.welcomeMessage || '',
  locale: settings.locale,
  timezone: settings.timezone,
  defaultPriority: settings.defaultPriority,
  defaultFolderId: settings.defaultFolderId || '',
});

const isEndpointUnavailable = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 405 || status === 501;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  const response = (error as {
    response?: { status?: number; data?: { error?: string; message?: string; errors?: Array<{ msg?: string }> } };
  })?.response;

  if (response?.status === 403) {
    return 'Недостаточно прав. Изменять параметры компании может только администратор.';
  }

  return response?.data?.error
    || response?.data?.message
    || response?.data?.errors?.find((item) => item.msg)?.msg
    || fallback;
};

export const ProductSettingsAdminSection: React.FC = () => {
  const { applySettings } = useProductSettings();
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_DRAFT);
  const [folders, setFolders] = useState<ServiceDeskFolder[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [notice, setNotice] = useState('');

  const activeFolders = useMemo(
    () => folders.filter((folder) => folder.isActive !== false),
    [folders]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    setNotice('');

    const foldersPromise = serviceDeskFoldersApi.getManaged();

    try {
      let settings: ProductSettings;
      try {
        const managedSettings = await productSettingsApi.getManaged();
        settings = managedSettings;
        setUpdatedAt(managedSettings.updatedAt);
        setCanSave(true);
      } catch (adminError) {
        if (!isEndpointUnavailable(adminError)) {
          throw adminError;
        }

        settings = await productSettingsApi.getPublic();
        setUpdatedAt(null);
        setCanSave(false);
        setWarning('Админский endpoint настроек пока недоступен. Параметры показаны только для чтения, остальной портал продолжает работать.');
      }

      setDraft(toDraft(settings));
      applySettings(settings);
    } catch (loadError) {
      setCanSave(false);
      setError(getErrorMessage(loadError, 'Не удалось загрузить настройки компании и портала.'));
    }

    try {
      setFolders(await foldersPromise);
    } catch {
      setFolders([]);
      setWarning((current) => current || 'Не удалось загрузить папки. Остальные параметры можно просмотреть и изменить.');
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateDraft = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
    setNotice('');
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.portalName.trim()) {
      setError('Укажите название портала.');
      return;
    }

    const payload: UpdateProductSettingsInput = {
      portalName: draft.portalName.trim(),
      companyName: draft.companyName.trim(),
      welcomeMessage: draft.welcomeMessage.trim() || null,
      locale: draft.locale.trim(),
      timezone: draft.timezone.trim(),
      defaultPriority: draft.defaultPriority,
      defaultFolderId: draft.defaultFolderId || null,
    };

    setSaving(true);
    setError('');
    setWarning('');
    setNotice('');
    try {
      const updated = await productSettingsApi.update(payload);
      setDraft(toDraft(updated));
      setUpdatedAt(updated.updatedAt);
      applySettings(updated);
      setNotice('Настройки компании и портала сохранены. Новое название уже отображается в интерфейсе.');
    } catch (saveError) {
      if (isEndpointUnavailable(saveError)) {
        setCanSave(false);
        setWarning('Сохранение пока недоступно на backend. Введённые значения не отправлены и не повлияли на работу портала.');
      } else {
        setError(getErrorMessage(saveError, 'Не удалось сохранить настройки компании и портала.'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[16px] border border-[#e2e2e2] bg-white px-5 py-8 text-sm text-[#6b6b6b]" data-testid="admin-product-settings-loading">
        Загружаем настройки компании и портала...
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="admin-product-settings">
      <div className="rounded-[18px] border border-[#dfdfdf] bg-[linear-gradient(135deg,#ffffff_0%,#f5f7f4_100%)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#2f2f2f] text-white">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#1f1f1f]">Компания и портал</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#666]">
                Общие подписи портала и значения, которые будут предлагаться при создании новых заявок.
              </p>
            </div>
          </div>
          <button type="button" className="btn inline-flex items-center gap-2" onClick={() => void loadSettings()} disabled={saving} data-testid="product-settings-refresh">
            <RefreshCw size={15} />
            Обновить
          </button>
        </div>
      </div>

      <div className="flex gap-3 rounded-[14px] border border-[#dce5dc] bg-[#f4f8f4] px-4 py-3 text-sm leading-6 text-[#45604b]">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <p>
          Здесь нет паролей, SMTP/IMAP, CORS, токенов и других секретов. Они настраиваются только на сервере через защищённые переменные окружения.
        </p>
      </div>

      {notice && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]" role="status" data-testid="product-settings-success">
          {notice}
        </div>
      )}
      {warning && (
        <div className="rounded-[12px] border border-[#ead7a5] bg-[#fff9e9] px-4 py-3 text-sm text-[#80621d]" role="status" data-testid="product-settings-warning">
          {warning}
        </div>
      )}
      {error && (
        <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]" role="alert" data-testid="product-settings-error">
          {error}
        </div>
      )}

      <form className="card space-y-5 p-5 sm:p-6" onSubmit={saveSettings} data-testid="product-settings-form">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="product-portal-name" className="mb-1.5 block text-sm font-medium text-[#444]">Название портала *</label>
            <input
              id="product-portal-name"
              className="input w-full"
              value={draft.portalName}
              onChange={(event) => updateDraft('portalName', event.target.value)}
              maxLength={120}
              required
              disabled={!canSave || saving}
              data-testid="product-settings-portal-name"
            />
            <p className="mt-1.5 text-xs text-[#7a7a7a]">Показывается на страницах входа и в шапке рабочего портала.</p>
          </div>

          <div>
            <label htmlFor="product-company-name" className="mb-1.5 block text-sm font-medium text-[#444]">Название компании</label>
            <input
              id="product-company-name"
              className="input w-full"
              value={draft.companyName}
              onChange={(event) => updateDraft('companyName', event.target.value)}
              maxLength={255}
              disabled={!canSave || saving}
              data-testid="product-settings-company-name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="product-welcome-message" className="mb-1.5 block text-sm font-medium text-[#444]">Приветственный текст</label>
          <textarea
            id="product-welcome-message"
            className="input min-h-[104px] w-full resize-y"
            value={draft.welcomeMessage}
            onChange={(event) => updateDraft('welcomeMessage', event.target.value)}
            maxLength={2000}
            disabled={!canSave || saving}
            placeholder="Например: Оставьте заявку, и служба поддержки свяжется с вами."
            data-testid="product-settings-welcome-message"
          />
          <p className="mt-1.5 text-xs text-[#7a7a7a]">Если оставить поле пустым, страницы входа используют стандартный текст.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="product-default-folder" className="mb-1.5 block text-sm font-medium text-[#444]">Папка по умолчанию</label>
            <select
              id="product-default-folder"
              className="input w-full"
              value={draft.defaultFolderId}
              onChange={(event) => updateDraft('defaultFolderId', event.target.value)}
              disabled={!canSave || saving}
              data-testid="product-settings-default-folder"
            >
              <option value="">Не выбирать автоматически</option>
              {activeFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-[#7a7a7a]">В списке только активные папки.</p>
          </div>

          <div>
            <label htmlFor="product-default-priority" className="mb-1.5 block text-sm font-medium text-[#444]">Приоритет по умолчанию</label>
            <select
              id="product-default-priority"
              className="input w-full"
              value={draft.defaultPriority}
              onChange={(event) => updateDraft('defaultPriority', event.target.value as TaskPriority)}
              disabled={!canSave || saving}
              data-testid="product-settings-default-priority"
            >
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="product-locale" className="mb-1.5 block text-sm font-medium text-[#444]">Локаль</label>
            <input
              id="product-locale"
              className="input w-full"
              value={draft.locale}
              onChange={(event) => updateDraft('locale', event.target.value)}
              maxLength={35}
              required
              disabled={!canSave || saving}
              placeholder="ru-RU"
              data-testid="product-settings-locale"
            />
            <p className="mt-1.5 text-xs text-[#7a7a7a]">Формат BCP 47, например `ru-RU`.</p>
          </div>

          <div>
            <label htmlFor="product-timezone" className="mb-1.5 block text-sm font-medium text-[#444]">Часовой пояс</label>
            <input
              id="product-timezone"
              className="input w-full"
              value={draft.timezone}
              onChange={(event) => updateDraft('timezone', event.target.value)}
              maxLength={100}
              required
              disabled={!canSave || saving}
              placeholder="Europe/Moscow"
              data-testid="product-settings-timezone"
            />
            <p className="mt-1.5 text-xs text-[#7a7a7a]">Формат IANA, например `Europe/Moscow`.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e6e6] pt-4">
          <p className="text-xs text-[#7a7a7a]">
            {updatedAt ? `Последнее изменение: ${formatDateTime(updatedAt)}` : 'Используются безопасные значения по умолчанию.'}
          </p>
          <button type="submit" className="btn btn-primary inline-flex items-center gap-2" disabled={!canSave || saving} data-testid="product-settings-save">
            <Save size={16} />
            {saving ? 'Сохраняем...' : 'Сохранить настройки'}
          </button>
        </div>
      </form>
    </section>
  );
};
