import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, MessageCircle, RotateCcw, Save, Search, SlidersHorizontal, Trash2, UserRound, Users, XCircle } from 'lucide-react';
import { chatsApi } from '../../api';
import { formatDateTime } from '../../utils';
import type { AdminChatThread, ChatKind, ChatSettings } from '../../types';
import { DataState } from '../ui/DataState';

const getApiError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

export const ChatsAdminSection: React.FC = () => {
  const [chats, setChats] = useState<AdminChatThread[]>([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | ChatKind>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [chatRows, chatSettings] = await Promise.all([
        chatsApi.getAdmin({
          search: search.trim() || undefined,
          kind: kind || undefined,
        }),
        chatsApi.getSettings(),
      ]);
      setChats(chatRows);
      setSettings(chatSettings);
    } catch (loadError) {
      setError(getApiError(loadError, 'Не удалось загрузить список чатов.'));
    } finally {
      setLoading(false);
    }
  }, [kind, search]);

  const updateSetting = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await chatsApi.updateSettings({
        directChatsEnabled: settings.directChatsEnabled,
        departmentChatsEnabled: settings.departmentChatsEnabled,
        ticketChatsEnabled: settings.ticketChatsEnabled,
        attachmentsEnabled: settings.attachmentsEnabled,
        maxAttachmentSizeMb: settings.maxAttachmentSizeMb,
      });
      setSettings(updated);
      setNotice('Настройки чатов сохранены.');
    } catch (saveError) {
      setError(getApiError(saveError, 'Не удалось сохранить настройки чатов.'));
    } finally {
      setSettingsSaving(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totals = useMemo(() => ({
    chats: chats.length,
    direct: chats.filter((chat) => chat.kind === 'DIRECT' || chat.kind === 'GROUP').length,
    department: chats.filter((chat) => chat.kind === 'DEPARTMENT').length,
    messages: chats.reduce((sum, chat) => sum + chat.messageCount, 0),
  }), [chats]);

  const clearChat = async (chat: AdminChatThread) => {
    if (!window.confirm(`Очистить всю историю «${chat.title}»? Участники и сам чат останутся. Действие нельзя отменить.`)) {
      return;
    }
    setBusyId(chat.id);
    setError('');
    setNotice('');
    try {
      await chatsApi.clearAdmin(chat.id);
      setNotice(`История чата «${chat.title}» очищена.`);
      await load();
    } catch (clearError) {
      setError(getApiError(clearError, 'Не удалось очистить чат.'));
    } finally {
      setBusyId('');
    }
  };

  const deleteChat = async (chat: AdminChatThread) => {
    const departmentHint = chat.kind === 'DEPARTMENT'
      ? ' При следующем входе участника отделский чат будет создан заново без старой истории.'
      : '';
    if (!window.confirm(`Удалить чат «${chat.title}» вместе со всеми сообщениями?${departmentHint} Действие нельзя отменить.`)) {
      return;
    }
    setBusyId(chat.id);
    setError('');
    setNotice('');
    try {
      await chatsApi.deleteAdmin(chat.id);
      setNotice(`Чат «${chat.title}» удалён.`);
      setChats((current) => current.filter((item) => item.id !== chat.id));
    } catch (deleteError) {
      setError(getApiError(deleteError, 'Не удалось удалить чат.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-chats-section">
      <div className="rounded-[14px] border border-[#dedede] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-[#4a4a4a]" />
              <h2 className="text-base font-semibold text-[#242424]">Управление чатами</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#707070]">
              Здесь видны тип, участники и объём переписки, но не текст личных сообщений. Чаты заявок являются частью истории заявки и управляются в её карточке.
            </p>
          </div>
          <button type="button" className="btn inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}>
            <RotateCcw size={15} />
            Обновить
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">{notice}</div>
      )}
      {error && (
        <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]">{error}</div>
      )}

      {settings && (
        <div className="rounded-[16px] border border-[#dcdcdc] bg-white p-4 sm:p-5" data-testid="admin-chat-settings">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-[#4a4a4a]" />
                <h3 className="text-base font-semibold text-[#242424]">Доступность и файлы</h3>
              </div>
              <p className="mt-1 text-sm leading-6 text-[#777]">Изменения применяются ко всем пользователям портала.</p>
              <p className="mt-1 text-xs leading-5 text-[#8a8a8a]">
                Весь раздел включается и отключается во вкладке «Функции».
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={() => void saveSettings()}
              disabled={settingsSaving}
            >
              <Save size={15} />
              {settingsSaving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              { key: 'directChatsEnabled' as const, title: 'Личные и групповые', hint: 'Диалоги между сотрудниками.' },
              { key: 'departmentChatsEnabled' as const, title: 'Чаты отделов', hint: 'Состав берётся из настроек отделов.' },
              { key: 'ticketChatsEnabled' as const, title: 'Чаты заявок', hint: 'Переписка остаётся частью заявки.' },
              { key: 'attachmentsEnabled' as const, title: 'Вложения файлов', hint: 'Файлы доступны только участникам.' },
            ].map((item) => (
              <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#e4e4e4] bg-[#fafafa] p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={settings[item.key]}
                  onChange={(event) => updateSetting(item.key, event.target.checked)}
                  disabled={settingsSaving || !settings.chatsEnabled}
                />
                <span>
                  <span className="block text-sm font-semibold text-[#303030]">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#858585]">{item.hint}</span>
                </span>
              </label>
            ))}

            <label className="rounded-[12px] border border-[#e4e4e4] bg-[#fafafa] p-3">
              <span className="block text-sm font-semibold text-[#303030]">Максимальный размер файла</span>
              <span className="mt-0.5 block text-xs leading-5 text-[#858585]">От 1 до 50 МБ на одно вложение.</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="input w-24"
                  value={settings.maxAttachmentSizeMb}
                  onChange={(event) => updateSetting('maxAttachmentSizeMb', Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
                  disabled={settingsSaving || !settings.attachmentsEnabled || !settings.chatsEnabled}
                />
                <span className="text-sm text-[#696969]">МБ</span>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Всего чатов', value: totals.chats },
          { label: 'Личных и групповых', value: totals.direct },
          { label: 'Отделов', value: totals.department },
          { label: 'Сообщений', value: totals.messages },
        ].map((item) => (
          <div key={item.label} className="rounded-[13px] border border-[#e2e2e2] bg-white p-4">
            <p className="text-xs text-[#858585]">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#242424]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-[14px] border border-[#dedede] bg-white p-3 sm:grid-cols-[minmax(0,1fr),220px]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#969696]" />
          <input
            className="input pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название, имя или почта участника"
          />
        </div>
        <select className="input" value={kind} onChange={(event) => setKind(event.target.value as '' | ChatKind)}>
          <option value="">Все типы</option>
          <option value="DIRECT">Личные чаты</option>
          <option value="GROUP">Групповые чаты</option>
          <option value="DEPARTMENT">Чаты отделов</option>
        </select>
      </div>

      {loading ? (
        <DataState variant="loading" message="Загружаем чаты..." />
      ) : chats.length === 0 ? (
        <DataState variant="empty" message="Чатов по заданному фильтру пока нет." />
      ) : (
        <div className="space-y-3">
          {chats.map((chat) => {
            const DepartmentIcon = chat.kind === 'DEPARTMENT' ? Building2 : chat.kind === 'GROUP' ? Users : UserRound;
            return (
              <div key={chat.id} className="rounded-[14px] border border-[#dedede] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                      chat.kind === 'DEPARTMENT' ? 'bg-[#e7edef] text-[#4c5f66]' : 'bg-[#f0eee9] text-[#5d574d]'
                    }`}>
                      <DepartmentIcon size={19} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-sm font-semibold text-[#242424]">{chat.title}</h3>
                        <span className="chip">{chat.kind === 'DEPARTMENT' ? 'Отдел' : chat.kind === 'GROUP' ? 'Группа' : 'Личный'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#7d7d7d]">
                        <span className="inline-flex items-center gap-1"><Users size={13} /> {chat.memberCount} участников</span>
                        <span>{chat.messageCount} сообщений</span>
                        <span>Активность: {formatDateTime(chat.updatedAt)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#8b8b8b]">
                        {chat.members.map((member) => member.user.name).join(', ') || 'Участники не назначены'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-2"
                      onClick={() => void clearChat(chat)}
                      disabled={busyId === chat.id || chat.messageCount === 0}
                      title="Удалить сообщения, сохранив чат"
                    >
                      <XCircle size={15} />
                      Очистить
                    </button>
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-2 border-[#efc1c1] text-[#a33b3b]"
                      onClick={() => void deleteChat(chat)}
                      disabled={busyId === chat.id}
                    >
                      <Trash2 size={15} />
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
