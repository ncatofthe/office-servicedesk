import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, MessageSquare, Search } from 'lucide-react';
import { cannedRepliesApi, tasksApi } from '../../api';
import { DataState } from '../ui/DataState';
import type {
  ApplyCannedReplyResponse,
  CannedReply,
  CannedReplyApplyMode,
  CannedReplyVisibility,
} from '../../types';

interface Props {
  taskId: string;
  disabled?: boolean;
  onApplied: (message: string) => Promise<void> | void;
}

const visibilityLabels: Record<CannedReplyVisibility, string> = {
  PRIVATE: 'Личный',
  SHARED: 'Общий',
};

const modeLabels: Record<CannedReplyApplyMode, string> = {
  COMMENT: 'Добавить публичный комментарий',
  EMAIL_REPLY: 'Отправить email-ответ',
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Недостаточно прав для использования шаблонов ответов.';
  }
  if (status === 404) {
    return 'Шаблон ответа или endpoint не найден.';
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

const getApplySuccessMessage = (response: ApplyCannedReplyResponse) => {
  if (response.mode === 'EMAIL_REPLY') {
    if (response.dryRun) {
      return 'Шаблон применён. Письмо не отправлено реально, потому что outbound email выключен.';
    }

    return 'Шаблон применён, email-ответ отправлен.';
  }

  return 'Шаблон применён как публичный комментарий.';
};

export const CannedReplyPicker: React.FC<Props> = ({
  taskId,
  disabled = false,
  onApplied,
}) => {
  const [templates, setTemplates] = useState<CannedReply[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [bodyOverride, setBodyOverride] = useState('');
  const [mode, setMode] = useState<CannedReplyApplyMode>('COMMENT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [applying, setApplying] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await cannedRepliesApi.getAll({
          search: search.trim() || undefined,
          isActive: true,
        });
        setTemplates(data);
        setSelectedTemplateId((current) => {
          if (current && data.some((item) => item.id === current)) {
            return current;
          }
          return data[0]?.id || '';
        });
      } catch (loadError) {
        setTemplates([]);
        setSelectedTemplateId('');
        setError(getApiErrorMessage(loadError, 'Не удалось загрузить шаблоны ответов.'));
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!selectedTemplate) {
      setBodyOverride('');
      return;
    }

    setBodyOverride(selectedTemplate.body);
    setNotice('');
  }, [selectedTemplate]);

  const applyTemplate = async () => {
    if (!selectedTemplate) {
      setError('Выберите шаблон ответа.');
      return;
    }

    if (!bodyOverride.trim()) {
      setError('Текст перед отправкой не должен быть пустым.');
      return;
    }

    setApplying(true);
    setError('');
    setNotice('');

    try {
      const response = await tasksApi.applyCannedReply(taskId, {
        templateId: selectedTemplate.id,
        mode,
        bodyOverride: bodyOverride.trim(),
      });

      const successMessage = getApplySuccessMessage(response);
      await onApplied(successMessage);
      setNotice(successMessage);
    } catch (applyError) {
      setError(getApiErrorMessage(applyError, 'Не удалось применить шаблон ответа.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3" data-testid="canned-reply-picker">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1f1f1f]">Шаблоны ответов</p>
          <p className="mt-1 text-xs text-[#8a8a8a]">
            Здесь доступны только активные личные и общие шаблоны, которые можно применить к этой заявке.
          </p>
        </div>
      </div>

      {notice && (
        <div className="rounded-[10px] border border-[#b8e4c6] bg-[#eef9f2] px-3 py-3 text-sm text-[#1f7a42]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-3 text-sm text-[#b23b3b]">
          {error}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" size={15} />
        <input
          className="input pl-9"
          placeholder="Найти шаблон по названию, тексту или категории"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled || applying}
        />
      </div>

      {loading ? (
        <DataState variant="loading" message="Загружаем шаблоны ответов..." />
      ) : templates.length === 0 ? (
        <DataState variant="empty" message="Активные шаблоны не найдены." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,360px),1fr]">
          <div className="space-y-2">
            {templates.map((template) => {
              const selected = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`w-full rounded-[12px] border bg-white p-3 text-left transition ${
                    selected ? 'border-[#2f2f2f] shadow-[0_10px_24px_rgba(0,0,0,0.08)]' : 'border-[#e3e3e3] hover:border-[#bcbcbc]'
                  }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                  disabled={disabled || applying}
                  data-testid="canned-reply-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1f1f1f]">{template.title}</p>
                      <p className="mt-1 text-xs text-[#7a7a7a]">{template.category || 'Без категории'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      template.visibility === 'SHARED'
                        ? 'border border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]'
                        : 'border border-[#e5e5e5] bg-[#f7f7f7] text-[#535353]'
                    }`}>
                      {visibilityLabels[template.visibility]}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-4 text-sm leading-6 text-[#5b5b5b]">{template.body}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4 space-y-4">
            {!selectedTemplate ? (
              <DataState variant="empty" message="Выберите шаблон из списка." />
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#535353]">
                      {visibilityLabels[selectedTemplate.visibility]}
                    </span>
                    <span className="rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#535353]">
                      {selectedTemplate.category || 'Без категории'}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[#1f1f1f]">{selectedTemplate.title}</p>
                    <p className="mt-1 text-xs text-[#8a8a8a]">
                      Автор: {selectedTemplate.author?.name || 'Не указан'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-[#5f5f5f]">Исходный текст</label>
                  <div className="rounded-[10px] border border-[#e3e3e3] bg-[#fcfcfc] px-3 py-3 text-sm whitespace-pre-wrap text-[#3f3f3f]">
                    {selectedTemplate.body}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-[#5f5f5f]">Режим применения</label>
                  <select
                    className="input"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as CannedReplyApplyMode)}
                    disabled={disabled || applying}
                    data-testid="canned-reply-apply-mode"
                  >
                    <option value="COMMENT">{modeLabels.COMMENT}</option>
                    <option value="EMAIL_REPLY">{modeLabels.EMAIL_REPLY}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-[#5f5f5f]">Текст перед отправкой</label>
                  <textarea
                    className="input min-h-[220px]"
                    value={bodyOverride}
                    onChange={(event) => setBodyOverride(event.target.value)}
                    disabled={disabled || applying}
                    data-testid="canned-reply-body-override"
                  />
                  <p className="mt-2 text-xs text-[#8a8a8a]">
                    При применении к заявке этот текст будет использован как итоговый публичный комментарий или email-ответ.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn btn-primary inline-flex items-center gap-2"
                    onClick={() => void applyTemplate()}
                    disabled={disabled || applying || !bodyOverride.trim() || !selectedTemplate}
                    data-testid="canned-reply-apply"
                  >
                    {applying ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Применяем...
                      </>
                    ) : mode === 'EMAIL_REPLY' ? (
                      <>
                        <Mail size={15} />
                        Применить как email-ответ
                      </>
                    ) : (
                      <>
                        <MessageSquare size={15} />
                        Применить как комментарий
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
