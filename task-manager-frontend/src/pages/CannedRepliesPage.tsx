import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { cannedRepliesApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { CannedReplyFormModal } from '../components/canned-replies/CannedReplyFormModal';
import { DataState } from '../components/ui/DataState';
import type {
  CannedReply,
  CannedReplyInput,
  CannedReplyVisibility,
} from '../types';

type VisibilityFilter = 'all' | CannedReplyVisibility;
type ActivityFilter = 'all' | 'active' | 'disabled';

const visibilityLabels: Record<CannedReplyVisibility, string> = {
  PRIVATE: 'Личный',
  SHARED: 'Общий',
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Недостаточно прав для работы с шаблонами ответов.';
  }
  if (status === 404) {
    return 'Шаблон ответа или endpoint не найден.';
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const getExcerpt = (body: string) => {
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
};

export const CannedRepliesPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [replies, setReplies] = useState<CannedReply[]>([]);
  const [selectedReply, setSelectedReply] = useState<CannedReply | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [activity, setActivity] = useState<ActivityFilter>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<CannedReply | null>(null);
  const loadRequestIdRef = useRef(0);
  const [hiddenReplyIds, setHiddenReplyIds] = useState<string[]>([]);

  const visibleReplies = useMemo(
    () => replies.filter((reply) => !hiddenReplyIds.includes(reply.id)),
    [hiddenReplyIds, replies]
  );

  const categories = useMemo(
    () => Array.from(new Set(visibleReplies.map((reply) => reply.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')),
    [visibleReplies]
  );

  const canManageReply = useCallback((reply: CannedReply | null) => {
    if (!reply || !user) {
      return false;
    }

    return isAdmin || reply.authorId === user.id;
  }, [isAdmin, user]);

  const loadReplies = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const data = await cannedRepliesApi.getAll({
        search: search.trim() || undefined,
        category: category || undefined,
        visibility: visibility === 'all' ? undefined : visibility,
        isActive: activity === 'all' ? undefined : activity === 'active',
      });

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setReplies(data);
      setSelectedReply((current) => {
        const nextVisibleReplies = data.filter((item) => !hiddenReplyIds.includes(item.id));

        if (current && nextVisibleReplies.some((item) => item.id === current.id)) {
          return nextVisibleReplies.find((item) => item.id === current.id) || null;
        }

        return nextVisibleReplies[0] || null;
      });
    } catch (loadError) {
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setReplies([]);
      setSelectedReply(null);
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить шаблоны ответов.'));
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [activity, category, hiddenReplyIds, search, visibility]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadReplies();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadReplies]);

  const openCreateModal = () => {
    setEditingReply(null);
    setModalOpen(true);
    setError('');
    setNotice('');
  };

  const openEditModal = (reply: CannedReply) => {
    setEditingReply(reply);
    setModalOpen(true);
    setError('');
    setNotice('');
  };

  const closeModal = () => {
    if (!saving) {
      setModalOpen(false);
      setEditingReply(null);
    }
  };

  const saveReply = async (payload: CannedReplyInput) => {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const saved = editingReply
        ? await cannedRepliesApi.update(editingReply.id, payload)
        : await cannedRepliesApi.create(payload);

      setModalOpen(false);
      setEditingReply(null);
      setSelectedReply(saved);
      setNotice(editingReply ? 'Шаблон ответа обновлён.' : 'Шаблон ответа создан.');
      await loadReplies();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось сохранить шаблон ответа.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteReply = async (reply: CannedReply) => {
    const confirmed = window.confirm(`Удалить шаблон «${reply.title}»?`);
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await cannedRepliesApi.delete(reply.id);
      setHiddenReplyIds((current) => (current.includes(reply.id) ? current : [...current, reply.id]));
      setReplies((current) => current.filter((item) => item.id !== reply.id));
      setNotice('Шаблон ответа удалён.');
      if (selectedReply?.id === reply.id) {
        setSelectedReply(null);
      }
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Не удалось удалить шаблон ответа.'));
    }
  };

  const toggleReply = async (reply: CannedReply) => {
    setError('');
    setNotice('');
    try {
      const updated = await cannedRepliesApi.update(reply.id, { isActive: !reply.isActive });
      setNotice(updated.isActive ? 'Шаблон ответа включён.' : 'Шаблон ответа отключён.');
      setSelectedReply(updated);
      await loadReplies();
    } catch (toggleError) {
      setError(getApiErrorMessage(toggleError, 'Не удалось изменить состояние шаблона.'));
    }
  };

  return (
    <div className="space-y-5" data-testid="canned-replies-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Шаблоны ответов</h1>
          <p className="page-subtitle mt-1">Готовые ответы для переписки по заявкам и email-ответов</p>
        </div>
        <button
          type="button"
          className="btn btn-primary inline-flex items-center gap-2"
          onClick={openCreateModal}
          data-testid="canned-reply-create"
        >
          <Plus size={16} />
          Создать шаблон
        </button>
      </div>

      {notice && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[12px] border border-[#e3e3e3] bg-white p-4 xl:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" size={16} />
          <input
            className="input pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию, тексту или категории"
            data-testid="canned-reply-search"
          />
        </div>
        <select
          className="input xl:max-w-[220px]"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          data-testid="canned-reply-filter-category"
        >
          <option value="">Все категории</option>
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          className="input xl:max-w-[180px]"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as VisibilityFilter)}
          data-testid="canned-reply-filter-visibility"
        >
          <option value="all">Все видимости</option>
          <option value="PRIVATE">Личные</option>
          <option value="SHARED">Общие</option>
        </select>
        <select
          className="input xl:max-w-[200px]"
          value={activity}
          onChange={(event) => setActivity(event.target.value as ActivityFilter)}
          data-testid="canned-reply-filter-activity"
        >
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="disabled">Отключённые</option>
        </select>
        <button type="button" className="btn inline-flex items-center gap-2" onClick={() => void loadReplies()} disabled={loading}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,420px),1fr]">
        <div className="space-y-3">
          {loading ? (
            <DataState variant="loading" message="Загружаем шаблоны ответов..." />
          ) : visibleReplies.length === 0 ? (
            <DataState variant="empty" message="Шаблоны пока не найдены. Попробуйте снять фильтры или создать новый." />
          ) : (
            visibleReplies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                className={`card w-full p-4 text-left transition hover:border-[#9d9d9d] ${selectedReply?.id === reply.id ? 'border-[#2f2f2f]' : ''}`}
                onClick={() => setSelectedReply(reply)}
                data-testid="canned-reply-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-[#1f1f1f]">{reply.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#606060]">{getExcerpt(reply.body)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${
                    reply.visibility === 'SHARED'
                      ? 'border border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]'
                      : 'border border-[#e5e5e5] bg-[#f7f7f7] text-[#535353]'
                  }`}>
                    {visibilityLabels[reply.visibility]}
                  </span>
                  {reply.category && <span className="chip">{reply.category}</span>}
                  {!reply.isActive && (
                    <span className="rounded-full border border-[#efc1c1] bg-[#fff4f4] px-2.5 py-1 font-semibold text-[#b23b3b]">
                      Отключён
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <section className="rounded-[12px] border border-[#e3e3e3] bg-white p-5">
          {!selectedReply ? (
            <DataState variant="empty" message="Выберите шаблон из списка." />
          ) : (
            <article className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-semibold ${
                      selectedReply.visibility === 'SHARED'
                        ? 'border border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]'
                        : 'border border-[#e5e5e5] bg-[#f7f7f7] text-[#535353]'
                    }`}>
                      {visibilityLabels[selectedReply.visibility]}
                    </span>
                    <span className="chip">{selectedReply.category || 'Без категории'}</span>
                    {!selectedReply.isActive && (
                      <span className="rounded-full border border-[#efc1c1] bg-[#fff4f4] px-2.5 py-1 font-semibold text-[#b23b3b]">
                        Отключён
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-semibold leading-tight text-[#1f1f1f]">{selectedReply.title}</h2>
                  <p className="mt-2 text-sm text-[#7a7a7a]">
                    Автор: {selectedReply.author?.name || 'Не указан'} · Обновлено: {formatDate(selectedReply.updatedAt)}
                  </p>
                </div>

                {canManageReply(selectedReply) && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="btn h-10 w-10 p-0"
                      onClick={() => openEditModal(selectedReply)}
                      title="Редактировать"
                      data-testid="canned-reply-edit"
                    >
                      <Edit3 size={15} className="mx-auto" />
                    </button>
                    <button
                      type="button"
                      className="btn h-10 w-10 p-0"
                      onClick={() => void toggleReply(selectedReply)}
                      title={selectedReply.isActive ? 'Отключить' : 'Включить'}
                      data-testid="canned-reply-toggle"
                    >
                      <Power size={15} className="mx-auto" />
                    </button>
                    <button
                      type="button"
                      className="btn h-10 w-10 border-[#efc1c1] p-0 text-[#b23b3b]"
                      onClick={() => void deleteReply(selectedReply)}
                      title="Удалить"
                      data-testid="canned-reply-delete"
                    >
                      <Trash2 size={15} className="mx-auto" />
                    </button>
                  </div>
                )}
              </div>

              {!canManageReply(selectedReply) && (
                <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] px-4 py-3 text-sm text-[#6b6b6b]">
                  Этот шаблон доступен для использования, но менять его может только автор или администратор.
                </div>
              )}

              <div className="whitespace-pre-wrap text-sm leading-7 text-[#333333]">{selectedReply.body}</div>
            </article>
          )}
        </section>
      </div>

      <CannedReplyFormModal
        key={`${editingReply?.id ?? 'new'}-${modalOpen ? 'open' : 'closed'}`}
        open={modalOpen}
        reply={editingReply}
        saving={saving}
        onClose={closeModal}
        onSave={saveReply}
      />
    </div>
  );
};
