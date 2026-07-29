import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, FileText, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { knowledgeApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { DataState } from '../components/ui/DataState';
import { Modal } from '../components/ui/Modal';
import type { KnowledgeArticle, KnowledgeArticleInput, UserRole } from '../types';

const manageRoles: UserRole[] = ['ADMIN', 'AGENT'];

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Недостаточно прав для изменения базы знаний.';
  }
  if (status === 404) {
    return 'Статья или endpoint базы знаний не найден.';
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
  return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
};

export const KnowledgePage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = Boolean(user?.role && manageRoles.includes(user.role));

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [publicationFilter, setPublicationFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [loading, setLoading] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [draft, setDraft] = useState<KnowledgeArticleInput>({
    title: '',
    category: '',
    body: '',
    isPublished: true,
  });
  const [saving, setSaving] = useState(false);

  const categories = useMemo(() => (
    Array.from(new Set(articles.map((article) => article.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru'))
  ), [articles]);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await knowledgeApi.getArticles({
        search: search.trim() || undefined,
        category: category || undefined,
        isPublished: canManage
          ? publicationFilter === 'published'
            ? true
            : publicationFilter === 'drafts'
              ? false
              : undefined
          : true,
      });
      setArticles(data);

      const articleIdFromUrl = searchParams.get('article');
      const nextSelected = articleIdFromUrl
        ? data.find((article) => article.id === articleIdFromUrl || article.slug === articleIdFromUrl)
        : data[0];
      setSelectedArticle(nextSelected || data[0] || null);
    } catch (loadError) {
      setArticles([]);
      setSelectedArticle(null);
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить статьи базы знаний.'));
    } finally {
      setLoading(false);
    }
  }, [canManage, category, publicationFilter, search, searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadArticles();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadArticles]);

  useEffect(() => {
    const articleId = searchParams.get('article');
    if (!articleId || articles.some((article) => article.id === articleId || article.slug === articleId)) {
      return;
    }

    setArticleLoading(true);
    knowledgeApi.getArticle(articleId)
      .then((article) => {
        setSelectedArticle(article);
        setArticles((current) => (current.some((item) => item.id === article.id) ? current : [article, ...current]));
      })
      .catch((loadError) => setError(getApiErrorMessage(loadError, 'Не удалось открыть статью базы знаний.')))
      .finally(() => setArticleLoading(false));
  }, [articles, searchParams]);

  const selectArticle = (article: KnowledgeArticle) => {
    setSelectedArticle(article);
    setSearchParams({ article: article.id });
  };

  const openCreateEditor = () => {
    setEditingArticle(null);
    setDraft({
      title: '',
      category: '',
      body: '',
      isPublished: true,
    });
    setEditorOpen(true);
    setError('');
    setNotice('');
  };

  const openEditEditor = (article: KnowledgeArticle) => {
    setEditingArticle(article);
    setDraft({
      title: article.title,
      category: article.category || '',
      body: article.body,
      isPublished: article.isPublished,
    });
    setEditorOpen(true);
    setError('');
    setNotice('');
  };

  const closeEditor = () => {
    if (!saving) {
      setEditorOpen(false);
    }
  };

  const saveArticle = async () => {
    if (!draft.title.trim() || !draft.body.trim()) {
      setError('Заполните название и текст статьи.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: KnowledgeArticleInput = {
        title: draft.title.trim(),
        category: draft.category?.trim() || null,
        body: draft.body.trim(),
        isPublished: draft.isPublished !== false,
      };
      const saved = editingArticle
        ? await knowledgeApi.updateArticle(editingArticle.id, payload)
        : await knowledgeApi.createArticle(payload);

      setNotice(editingArticle ? 'Статья обновлена.' : 'Статья создана.');
      setEditorOpen(false);
      setSelectedArticle(saved);
      setSearchParams({ article: saved.id });
      await loadArticles();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось сохранить статью.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (article: KnowledgeArticle) => {
    const confirmed = window.confirm(`Удалить статью «${article.title}»?`);
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await knowledgeApi.deleteArticle(article.id);
      setNotice('Статья удалена.');
      setSelectedArticle(null);
      setSearchParams({});
      await loadArticles();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Не удалось удалить статью.'));
    }
  };

  const selectedBody = selectedArticle?.body || '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">База знаний</h1>
          <p className="page-subtitle mt-1">Инструкции и решения для ServiceDesk</p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={openCreateEditor}>
            <Plus size={16} />
            Создать статью
          </button>
        )}
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

      <div className="flex flex-col gap-3 rounded-[12px] border border-[#e3e3e3] bg-white p-4 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" size={16} />
          <input
            className="input pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию, тексту или категории"
          />
        </div>
        <select className="input lg:max-w-[240px]" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Все категории</option>
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        {canManage && (
          <select
            className="input lg:max-w-[200px]"
            value={publicationFilter}
            onChange={(event) => setPublicationFilter(event.target.value as 'all' | 'published' | 'drafts')}
          >
            <option value="all">Все статусы</option>
            <option value="published">Опубликованные</option>
            <option value="drafts">Черновики</option>
          </select>
        )}
        <button type="button" className="btn inline-flex items-center gap-2" onClick={loadArticles} disabled={loading}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,420px),1fr]">
        <div className="space-y-3" data-testid="knowledge-article-list">
          {loading ? (
            <DataState variant="loading" message="Загружаем статьи..." />
          ) : articles.length === 0 ? (
            <DataState variant="empty" message="Статей пока нет или фильтр ничего не нашёл." />
          ) : (
            articles.map((article) => (
              <button
                key={article.id}
                type="button"
                className={`card w-full p-4 text-left transition hover:border-[#9d9d9d] ${selectedArticle?.id === article.id ? 'border-[#2f2f2f]' : ''}`}
                onClick={() => selectArticle(article)}
                data-testid="knowledge-article-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-[#1f1f1f]">{article.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#606060]">{getExcerpt(article.body)}</p>
                  </div>
                  <FileText size={18} className="mt-1 shrink-0 text-[#8a8a8a]" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#7a7a7a]">
                  <span className="chip">{article.category || 'Без категории'}</span>
                  <span className="chip">{article.isPublished ? 'Опубликована' : 'Черновик'}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <section className="rounded-[12px] border border-[#e3e3e3] bg-white p-5">
          {articleLoading ? (
            <DataState variant="loading" message="Открываем статью..." />
          ) : !selectedArticle ? (
            <DataState variant="empty" message="Выберите статью из списка." />
          ) : (
            <article className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="chip">{selectedArticle.category || 'Без категории'}</span>
                    <span className="chip">{selectedArticle.isPublished ? 'Опубликована' : 'Черновик'}</span>
                  </div>
                  <h2 className="text-2xl font-semibold leading-tight text-[#1f1f1f]">{selectedArticle.title}</h2>
                  <p className="mt-2 text-sm text-[#7a7a7a]">Обновлено: {formatDate(selectedArticle.updatedAt)}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn h-10 w-10 p-0" onClick={() => openEditEditor(selectedArticle)} title="Редактировать">
                      <Edit3 size={15} className="mx-auto" />
                    </button>
                    <button
                      type="button"
                      className="btn h-10 w-10 border-[#efc1c1] p-0 text-[#b23b3b]"
                      onClick={() => deleteArticle(selectedArticle)}
                      title="Удалить"
                    >
                      <Trash2 size={15} className="mx-auto" />
                    </button>
                  </div>
                )}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-7 text-[#333]">{selectedBody}</div>
            </article>
          )}
        </section>
      </div>

      <Modal open={editorOpen} onClose={closeEditor} title={editingArticle ? 'Редактировать статью' : 'Новая статья'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-[#5f5f5f]">Название *</label>
            <input
              className="input"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[#5f5f5f]">Категория</label>
            <input
              className="input"
              value={draft.category || ''}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              disabled={saving}
              placeholder="Например: Почта, Доступы, 1С"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[#5f5f5f]">Текст статьи *</label>
            <textarea
              className="input min-h-[260px]"
              value={draft.body}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              disabled={saving}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
            <input
              type="checkbox"
              checked={draft.isPublished !== false}
              onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))}
              disabled={saving}
            />
            Опубликована
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={closeEditor} disabled={saving}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={saveArticle} disabled={saving || !draft.title.trim() || !draft.body.trim()}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
