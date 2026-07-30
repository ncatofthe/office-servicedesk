import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  FileUp,
  Gauge,
  Import,
  LayoutGrid,
  Mail,
  MessageCircle,
  MessagesSquare,
  RotateCcw,
  Ticket,
  Users,
  WandSparkles,
} from 'lucide-react';
import { productSettingsApi } from '../../api';
import { useProductSettings } from '../../contexts/ProductSettingsContext';
import type { ProductFeatureKey, ProductFeatures } from '../../types';
import { DataState } from '../ui/DataState';

type FeatureItem = {
  key: ProductFeatureKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  dependsOn?: ProductFeatureKey;
};

const GROUPS: Array<{ title: string; description: string; items: FeatureItem[] }> = [
  {
    title: 'Основная работа',
    description: 'Главные разделы, которые видят сотрудники и заявители.',
    items: [
      { key: 'dashboard', title: 'Главная страница', description: 'Сводка, показатели и быстрые действия.', icon: Gauge },
      { key: 'tickets', title: 'Заявки', description: 'Список, карточки, статусы и переписка по обращениям.', icon: Ticket },
      { key: 'ticketCreation', title: 'Создание заявок', description: 'Кнопки и API создания новых обращений.', icon: WandSparkles, dependsOn: 'tickets' },
      { key: 'queue', title: 'Очередь', description: 'Рабочая канбан-доска заявок для сотрудников.', icon: LayoutGrid, dependsOn: 'tickets' },
    ],
  },
  {
    title: 'Общение и материалы',
    description: 'Каналы коммуникации и инструменты для быстрых ответов.',
    items: [
      { key: 'chats', title: 'Внутренние чаты', description: 'Личные, групповые, отделовые и связанные с заявками чаты.', icon: MessageCircle },
      { key: 'email', title: 'Работа с почтой', description: 'Приём писем, email-переписка и исходящая очередь.', icon: Mail, dependsOn: 'tickets' },
      { key: 'notifications', title: 'Уведомления', description: 'Колокольчик и центр событий по заявкам.', icon: Bell, dependsOn: 'tickets' },
      { key: 'cannedReplies', title: 'Шаблоны ответов', description: 'Готовые сообщения для комментариев и email.', icon: MessagesSquare, dependsOn: 'tickets' },
      { key: 'taskAttachments', title: 'Файлы в заявках', description: 'Загрузка, скачивание и удаление вложений.', icon: FileUp, dependsOn: 'tickets' },
    ],
  },
  {
    title: 'Знания и управление',
    description: 'Дополнительные разделы для команды и руководителей.',
    items: [
      { key: 'knowledge', title: 'База знаний', description: 'Статьи, инструкции и поиск решений.', icon: BookOpen },
      { key: 'team', title: 'Пользователи', description: 'Раздел сотрудников, ролей и отделов.', icon: Users },
      { key: 'reports', title: 'Отчёты', description: 'Аналитика работы ServiceDesk.', icon: Gauge, dependsOn: 'tickets' },
    ],
  },
  {
    title: 'Автоматизация и перенос',
    description: 'Служебные возможности, которые можно не включать небольшим компаниям.',
    items: [
      { key: 'automation', title: 'Автоматизация', description: 'Правила маршрутизации и автоматических действий.', icon: Bot, dependsOn: 'tickets' },
      { key: 'freshdeskImport', title: 'Импорт Freshdesk', description: 'Перенос заявок и данных из Freshdesk.', icon: Import, dependsOn: 'tickets' },
    ],
  },
];

const ALL_FEATURE_KEYS = GROUPS.flatMap((group) => group.items.map((item) => item.key));

const getApiError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

export const FeatureSettingsAdminSection: React.FC = () => {
  const { applySettings } = useProductSettings();
  const [features, setFeatures] = useState<ProductFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ProductFeatureKey | 'all' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const settings = await productSettingsApi.getManaged();
      setFeatures(settings.features);
      applySettings(settings);
    } catch (loadError) {
      setError(getApiError(loadError, 'Не удалось загрузить функции приложения.'));
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const enabledCount = useMemo(
    () => features ? ALL_FEATURE_KEYS.filter((key) => features[key]).length : 0,
    [features]
  );

  const savePatch = async (patch: Partial<ProductFeatures>, key: ProductFeatureKey | 'all') => {
    if (!features) return;
    const previous = features;
    const next = { ...features, ...patch };
    setFeatures(next);
    setSavingKey(key);
    setError('');
    setNotice('');
    try {
      const updated = await productSettingsApi.update({ features: patch });
      setFeatures(updated.features);
      applySettings(updated);
      setNotice(key === 'all' ? 'Набор функций сохранён.' : 'Настройка применена для всех пользователей.');
    } catch (saveError) {
      setFeatures(previous);
      setError(getApiError(saveError, 'Не удалось сохранить настройку функции.'));
    } finally {
      setSavingKey('');
    }
  };

  const enableAll = () => {
    const patch = Object.fromEntries(ALL_FEATURE_KEYS.map((key) => [key, true])) as Partial<ProductFeatures>;
    void savePatch(patch, 'all');
  };

  if (loading && !features) {
    return <DataState variant="loading" message="Загружаем функции приложения..." />;
  }

  if (!features) {
    return (
      <div className="space-y-3">
        <DataState variant="error" message={error || 'Настройки функций недоступны.'} />
        <button type="button" className="btn inline-flex items-center gap-2" onClick={() => void load()}>
          <RotateCcw size={15} />
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-feature-settings">
      <div className="rounded-[16px] border border-[#dcdcdc] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-base font-semibold text-[#242424]">Функции приложения</h2>
            <p className="mt-1 text-sm leading-6 text-[#707070]">
              Соберите конфигурацию под конкретную компанию. Отключённые разделы исчезнут из меню,
              прямые ссылки и серверные операции тоже перестанут работать.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">{enabledCount} из {ALL_FEATURE_KEYS.length} включено</span>
            <button type="button" className="btn" onClick={enableAll} disabled={Boolean(savingKey)}>
              Включить всё
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-[12px] border border-[#dce5f3] bg-[#f7faff] px-4 py-3 text-sm leading-6 text-[#435a7a]">
          Настройки и профиль нельзя отключить: у администратора всегда останется доступ к этому экрану.
          Зависимые функции сохраняют выбранное состояние, но начнут работать только после включения раздела «Заявки».
        </div>
      </div>

      {notice && <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">{notice}</div>}
      {error && <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]">{error}</div>}

      {GROUPS.map((group) => (
        <section key={group.title} className="rounded-[16px] border border-[#dedede] bg-white p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold text-[#242424]">{group.title}</h3>
            <p className="mt-1 text-xs leading-5 text-[#858585]">{group.description}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {group.items.map((item) => {
              const Icon = item.icon;
              const enabled = features[item.key];
              const dependencyInactive = item.dependsOn ? !features[item.dependsOn] : false;
              const saving = savingKey === item.key;
              return (
                <div
                  key={item.key}
                  className={`flex items-start gap-3 rounded-[14px] border p-3.5 transition ${
                    enabled ? 'border-[#d8dfda] bg-[#fbfdfb]' : 'border-[#e5e5e5] bg-[#fafafa]'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] ${
                    enabled ? 'bg-[#e7f3eb] text-[#2d6b42]' : 'bg-[#ececea] text-[#777]'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#292929]">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#7f7f7f]">{item.description}</p>
                    {dependencyInactive && enabled && (
                      <p className="mt-1 text-xs font-medium text-[#9a6a19]">Ожидает включения раздела «Заявки»</p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${enabled ? 'Отключить' : 'Включить'}: ${item.title}`}
                    className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${
                      enabled ? 'bg-[#2f6f46]' : 'bg-[#c9c9c6]'
                    } ${saving || savingKey === 'all' ? 'cursor-wait opacity-60' : ''}`}
                    onClick={() => void savePatch({ [item.key]: !enabled }, item.key)}
                    disabled={Boolean(savingKey)}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                      enabled ? 'left-[22px]' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
