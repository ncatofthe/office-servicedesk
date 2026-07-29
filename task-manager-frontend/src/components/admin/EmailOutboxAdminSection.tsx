import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { emailOutboxAdminApi } from '../../api';
import { Card } from '../ui/Card';
import { DataState } from '../ui/DataState';
import { formatDateTime } from '../../utils';
import type { EmailOutboxHealth, EmailOutboxItem, EmailOutboxQuery, EmailOutboxStatus } from '../../types';

const ALLOWED_LIMITS = [25, 50, 100] as const;
const RETRYABLE_STATUSES = new Set<EmailOutboxStatus>(['FAILED', 'RETRY_PENDING']);

const outboxStatusLabels: Record<EmailOutboxStatus, string> = {
  SENT: 'Отправлено',
  FAILED: 'Ошибка',
  RETRY_PENDING: 'Ожидает повтора',
  DRY_RUN: 'Тестовый режим',
};

const outboxStatusStyles: Record<EmailOutboxStatus, string> = {
  SENT: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
  FAILED: 'border-[#f3c4c4] bg-[#fff4f4] text-[#b23b3b]',
  RETRY_PENDING: 'border-[#eee0c8] bg-[#fff7ea] text-[#8a5b14]',
  DRY_RUN: 'border-[#e1daf2] bg-[#f6f1ff] text-[#5d3a9a]',
};

const getResponseStatus = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;

const sanitizeServerMessage = (message?: string | null) => {
  if (!message || typeof message !== 'string') {
    return '';
  }

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 220 || trimmed.includes('\n') || trimmed.includes(' at ')) {
    return '';
  }

  return trimmed;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = getResponseStatus(error);
  if (status === 403) {
    return 'Недостаточно прав для управления email-очередью. Нужна роль администратора.';
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  const safeMessage = sanitizeServerMessage(response?.data?.error || response?.data?.message);
  return safeMessage || fallback;
};

const toBool = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const firstValue = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
};

const normalizeHealth = (raw: EmailOutboxHealth | Record<string, unknown>): EmailOutboxHealth => {
  const source = toRecord(raw);
  const worker = toRecord(source.worker);
  const settings = toRecord(source.settings);
  const retry = toRecord(source.retry);
  const counters = toRecord(source.counters);
  const queue = toRecord(source.queue);
  const outbox = toRecord(source.outbox);
  const smtp = toRecord(source.smtp);
  const from = toRecord(source.from);
  const workerIntervalMs = toNumber(
    firstValue(source, ['workerIntervalMs']) ??
    firstValue(worker, ['intervalMs'])
  );

  return {
    outboundEnabled: toBool(
      firstValue(source, ['outboundEnabled', 'emailEnabled', 'enabled']) ??
      firstValue(settings, ['outboundEnabled', 'enabled'])
    ),
    workerEnabled: toBool(
      firstValue(source, ['workerEnabled']) ??
      firstValue(worker, ['enabled'])
    ),
    workerIntervalSeconds: toNumber(
      firstValue(source, ['workerIntervalSeconds', 'workerIntervalSec']) ??
      firstValue(worker, ['intervalSeconds', 'intervalSec'])
    ) ?? (workerIntervalMs !== null ? Math.round(workerIntervalMs / 1000) : null),
    workerIntervalMinutes: toNumber(
      firstValue(source, ['workerIntervalMinutes']) ??
      firstValue(worker, ['intervalMinutes'])
    ),
    batchSize: toNumber(
      firstValue(source, ['batchSize', 'workerBatchSize']) ??
      firstValue(worker, ['batchSize'])
    ),
    maxAttempts: toNumber(
      firstValue(source, ['maxAttempts']) ??
      firstValue(retry, ['maxAttempts'])
    ),
    retryableCount: toNumber(
      firstValue(source, ['retryableCount']) ??
      firstValue(counters, ['retryableCount']) ??
      firstValue(queue, ['retryableCount']) ??
      firstValue(outbox, ['retryable'])
    ),
    lockedCount: toNumber(
      firstValue(source, ['lockedCount']) ??
      firstValue(counters, ['lockedCount']) ??
      firstValue(queue, ['lockedCount']) ??
      firstValue(outbox, ['locked'])
    ),
    oldestPendingAt: toStringOrNull(
      firstValue(source, ['oldestPendingAt']) ??
      firstValue(queue, ['oldestPendingAt']) ??
      firstValue(outbox, ['oldestPendingOrFailedAt'])
    ),
    oldestFailedAt: toStringOrNull(
      firstValue(source, ['oldestFailedAt']) ??
      firstValue(queue, ['oldestFailedAt'])
    ),
    maskedSmtpHost: toStringOrNull(
      firstValue(source, ['maskedSmtpHost']) ??
      firstValue(smtp, ['hostMasked', 'maskedHost'])
    ),
    maskedSmtpUser: toStringOrNull(
      firstValue(source, ['maskedSmtpUser']) ??
      firstValue(smtp, ['userMasked', 'maskedUser'])
    ),
    maskedFromEmail: toStringOrNull(
      firstValue(source, ['maskedFromEmail']) ??
      firstValue(from, ['emailMasked', 'maskedEmail']) ??
      firstValue(smtp, ['fromAddressMasked'])
    ),
  };
};

const formatBooleanLabel = (value: boolean | null) => {
  if (value === null) {
    return 'Неизвестно';
  }
  return value ? 'Включено' : 'Выключено';
};

const normalizeLimit = (value: number) =>
  ALLOWED_LIMITS.includes(value as (typeof ALLOWED_LIMITS)[number]) ? value : 25;

const displayAddress = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || /<(undefined|null)>/i.test(normalized) || /^(undefined|null)$/i.test(normalized)) {
    return 'Не указано';
  }
  return normalized;
};

const SummaryItem: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2">
    <p className="text-xs text-[#8a8a8a]">{label}</p>
    <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">{value}</p>
  </div>
);

export const EmailOutboxAdminSection: React.FC = () => {
  const [items, setItems] = useState<EmailOutboxItem[]>([]);
  const [health, setHealth] = useState<EmailOutboxHealth | null>(null);
  const [healthUnavailable, setHealthUnavailable] = useState(false);
  const [filters, setFilters] = useState<{
    status: '' | EmailOutboxStatus;
    taskId: string;
    limit: number;
  }>({
    status: '',
    taskId: '',
    limit: 25,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const requestParams = useMemo<EmailOutboxQuery>(() => ({
    status: filters.status || undefined,
    taskId: filters.taskId.trim() || undefined,
    limit: normalizeLimit(filters.limit),
  }), [filters.limit, filters.status, filters.taskId]);

  const loadHealth = useCallback(async () => {
    try {
      const response = await emailOutboxAdminApi.getHealth();
      setHealth(normalizeHealth(response as Record<string, unknown>));
      setHealthUnavailable(false);
    } catch (loadError) {
      const status = getResponseStatus(loadError);
      if (status === 404 || status === 500 || status === 501) {
        setHealth(null);
        setHealthUnavailable(true);
        return;
      }

      setHealth(null);
      setHealthUnavailable(true);
    }
  }, []);

  const loadOutbox = useCallback(async () => {
    const response = await emailOutboxAdminApi.getAll(requestParams);
    setItems(response);
  }, [requestParams]);

  const refreshAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      await Promise.all([loadOutbox(), loadHealth()]);
    } catch (loadError) {
      setItems([]);
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить email-очередь.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadHealth, loadOutbox]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const resetFilters = () => {
    setFilters({
      status: '',
      taskId: '',
      limit: 25,
    });
  };

  const retryMessage = async (item: EmailOutboxItem) => {
    setRetryingId(item.id);
    setError('');
    setNotice('');
    try {
      const response = await emailOutboxAdminApi.retry(item.id);
      await refreshAll(true);

      if (response.skipped) {
        setNotice('Повтор не требуется: запись уже отправлена или находится в тестовом режиме.');
      } else {
        setNotice('Повтор отправки поставлен в обработку.');
      }
    } catch (retryError) {
      setError(getApiErrorMessage(retryError, 'Не удалось выполнить повтор отправки.'));
    } finally {
      setRetryingId('');
    }
  };

  const summary = useMemo(() => {
    const total = items.length;
    const sent = items.filter((item) => item.status === 'SENT').length;
    const failed = items.filter((item) => item.status === 'FAILED').length;
    const retryPending = items.filter((item) => item.status === 'RETRY_PENDING').length;
    const dryRun = items.filter((item) => item.status === 'DRY_RUN' || item.dryRun).length;
    const retryable = items.filter((item) => RETRYABLE_STATUSES.has(item.status)).length;
    return { total, sent, failed, retryPending, dryRun, retryable };
  }, [items]);

  return (
    <div className="space-y-4" data-testid="admin-email-outbox">
      <div>
        <p className="text-sm font-semibold text-[#1f1f1f]">Почта и очередь отправки</p>
        <p className="mt-1 text-xs text-[#8a8a8a]">Исходящие ответы, ошибки доставки и безопасный повтор отправки.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-3 md:grid-cols-4 xl:grid-cols-7" data-testid="admin-email-outbox-summary">
        <SummaryItem label="Всего в выборке" value={summary.total} />
        <SummaryItem label="Отправлено" value={summary.sent} />
        <SummaryItem label="Ошибка" value={summary.failed} />
        <SummaryItem label="Ожидает повтора" value={summary.retryPending} />
        <SummaryItem label="Тестовый режим" value={summary.dryRun} />
        <SummaryItem label="Повторяемые" value={summary.retryable} />
        <SummaryItem label="Заблокированные" value={health?.lockedCount ?? '—'} />
      </div>

      <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-3" data-testid="admin-email-health">
        <p className="text-sm font-semibold text-[#1f1f1f]">Диагностика email</p>
        {healthUnavailable ? (
          <p className="mt-2 rounded-[10px] border border-dashed border-[#d7d7d7] bg-white px-3 py-3 text-sm text-[#6b6b6b]">
            Диагностика email пока недоступна.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-[#4a4a4a] md:grid-cols-2 xl:grid-cols-3">
            <p>Отправка писем: <span className="font-medium text-[#1f1f1f]">{formatBooleanLabel(health?.outboundEnabled ?? null)}</span></p>
            <p>Фоновая обработка: <span className="font-medium text-[#1f1f1f]">{formatBooleanLabel(health?.workerEnabled ?? null)}</span></p>
            <p>Интервал обработки: <span className="font-medium text-[#1f1f1f]">{health?.workerIntervalSeconds ?? (health?.workerIntervalMinutes ? `${health.workerIntervalMinutes} мин` : '—')}</span></p>
            <p>Писем за цикл: <span className="font-medium text-[#1f1f1f]">{health?.batchSize ?? '—'}</span></p>
            <p>Максимум попыток: <span className="font-medium text-[#1f1f1f]">{health?.maxAttempts ?? '—'}</span></p>
            <p>Доступно к повтору: <span className="font-medium text-[#1f1f1f]">{health?.retryableCount ?? '—'}</span></p>
            <p>Сейчас обрабатывается: <span className="font-medium text-[#1f1f1f]">{health?.lockedCount ?? '—'}</span></p>
            <p>Старейшая ожидающая/ошибка: <span className="font-medium text-[#1f1f1f]">{health?.oldestPendingAt ? formatDateTime(health.oldestPendingAt) : '—'}</span></p>
            <p>Старейшая ошибка: <span className="font-medium text-[#1f1f1f]">{health?.oldestFailedAt ? formatDateTime(health.oldestFailedAt) : '—'}</span></p>
            <p>SMTP-сервер: <span className="font-medium text-[#1f1f1f]">{health?.maskedSmtpHost || '—'}</span></p>
            <p>Учётная запись SMTP: <span className="font-medium text-[#1f1f1f]">{health?.maskedSmtpUser || '—'}</span></p>
            <p>Email отправителя: <span className="font-medium text-[#1f1f1f]">{health?.maskedFromEmail || '—'}</span></p>
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-[#777]">Адрес почтового сервера и пароль задаются в защищённых настройках сервера и не отображаются в браузере.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]" htmlFor="outbox-status">Статус</label>
          <select
            id="outbox-status"
            className="input w-full"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as '' | EmailOutboxStatus }))}
          >
            <option value="">Все</option>
            <option value="SENT">Отправлено</option>
            <option value="FAILED">Ошибка</option>
            <option value="RETRY_PENDING">Ожидает повтора</option>
            <option value="DRY_RUN">Тестовый режим</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]" htmlFor="outbox-task-id">Внутренний ID заявки</label>
          <input
            id="outbox-task-id"
            className="input w-full"
            value={filters.taskId}
            onChange={(event) => setFilters((current) => ({ ...current, taskId: event.target.value }))}
            placeholder="Например, cm..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]" htmlFor="outbox-limit">Лимит</label>
          <select
            id="outbox-limit"
            className="input w-full"
            value={String(normalizeLimit(filters.limit))}
            onChange={(event) => setFilters((current) => ({ ...current, limit: normalizeLimit(Number(event.target.value)) }))}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>

        <div className="flex items-end justify-end gap-2">
          <button
            type="button"
            className="btn"
            onClick={resetFilters}
            disabled={loading || refreshing || Boolean(retryingId)}
          >
            Сбросить
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void refreshAll(true)}
            disabled={loading || refreshing || Boolean(retryingId)}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Обновить
          </button>
        </div>
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

      {loading ? (
        <DataState variant="loading" message="Загружаем email-очередь..." />
      ) : items.length === 0 ? (
        <DataState variant="empty" message="В email-очереди нет записей по текущему фильтру." />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {items.map((item) => {
            const canRetry = RETRYABLE_STATUSES.has(item.status);
            return (
              <Card key={item.id} className="space-y-3 p-4" data-testid="admin-email-outbox-item">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1f1f1f] break-all">{item.subject || 'Без темы'}</p>
                    <p className="text-xs text-[#8a8a8a]">
                      {item.task?.ticketNumber ? `#${item.task.ticketNumber}` : item.taskId} · {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${outboxStatusStyles[item.status]}`}>
                      {outboxStatusLabels[item.status]}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs text-[#5f5f5f] md:grid-cols-2">
                  <p>От: <span className="font-medium break-all text-[#1f1f1f]">{displayAddress(item.fromEmail)}</span></p>
                  <p>Кому: <span className="font-medium break-all text-[#1f1f1f]">{displayAddress(item.recipientEmail)}</span></p>
                  <p>Попыток: <span className="font-medium text-[#1f1f1f]">{item.attempts}</span></p>
                  <p>Следующий повтор: <span className="font-medium text-[#1f1f1f]">{item.nextRetryAt ? formatDateTime(item.nextRetryAt) : '—'}</span></p>
                </div>

                {item.textPreview && (
                  <p className="rounded-[10px] border border-[#e8e8e8] bg-[#fafafa] px-3 py-2 text-sm text-[#3f3f3f]">
                    {item.textPreview}
                  </p>
                )}

                {item.errorMessage && (
                  <p className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-2 text-xs text-[#b23b3b]">
                    {sanitizeServerMessage(item.errorMessage) || 'Ошибка отправки. Подробности скрыты в целях безопасности.'}
                  </p>
                )}

                <div className="flex justify-end">
                  {canRetry ? (
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-2"
                      disabled={Boolean(retryingId)}
                      onClick={() => void retryMessage(item)}
                      data-testid="admin-email-outbox-retry"
                    >
                      {retryingId === item.id ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Повторяем...
                        </>
                      ) : (
                        'Повторить отправку'
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-[#8a8a8a]">Повтор не требуется</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
