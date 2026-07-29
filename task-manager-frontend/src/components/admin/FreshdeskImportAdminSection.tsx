import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CloudDownload,
  FileUp,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ServerCog,
} from 'lucide-react';
import { freshdeskImportAdminApi } from '../../api';
import { DataState } from '../ui/DataState';
import { formatDateTime } from '../../utils';
import type {
  FreshdeskImportError,
  FreshdeskImportResult,
  FreshdeskImportRun,
  FreshdeskImportSummary,
  FreshdeskPullDryRunPayload,
  FreshdeskSourceHealth,
} from '../../types';

type ImportMethod = 'direct' | 'file';
type RunningAction = 'direct-dry-run' | 'direct-import' | 'file-dry-run' | 'file-import' | '';
type HealthState = 'loading' | 'ready' | 'unavailable';

const statusLabels: Record<string, string> = {
  DRY_RUN: 'Проверка',
  SUCCESS: 'Успешно',
  PARTIAL: 'Частично',
  FAILED: 'Ошибка',
};

const statusStyles: Record<string, string> = {
  DRY_RUN: 'border-[#d7e3ef] bg-[#eef6ff] text-[#315f86]',
  SUCCESS: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
  PARTIAL: 'border-[#eee0c8] bg-[#fff7ea] text-[#8a5b14]',
  FAILED: 'border-[#f3c4c4] bg-[#fff4f4] text-[#b23b3b]',
};

const getResponseStatus = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;
const isUnsupportedEndpoint = (error: unknown) => [404, 405, 501].includes(getResponseStatus(error) || 0);

const safeServerMessage = (error: unknown, fallback: string) => {
  const status = getResponseStatus(error);
  if (status === 403) {
    return 'Недостаточно прав для импорта Freshdesk. Нужна роль администратора.';
  }

  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  const message = typeof data?.error === 'string' ? data.error : data?.message;
  if (typeof message === 'string' && message.trim() && message.length < 260 && !message.includes('\n')) {
    return message.trim();
  }
  return fallback;
};

const parseCsv = (content: string): Record<string, unknown>[] => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows.filter((item) => item.some((cell) => cell.trim()));
  if (!headerRow) return [];
  const headers = headerRow.map((header) => header.trim());
  return dataRows
    .filter((dataRow) => dataRow.some((cell) => cell.trim()))
    .map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ''])));
};

const parseImportFile = async (file: File): Promise<Record<string, unknown>[]> => {
  const content = await file.text();
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'json') {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tickets?: unknown }).tickets)) {
      return (parsed as { tickets: unknown[] }).tickets
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    }
    throw new Error('JSON должен быть массивом заявок или объектом { tickets: [...] }.');
  }
  if (extension === 'csv') return parseCsv(content);
  throw new Error('Поддерживаются только JSON и CSV файлы.');
};

const numberValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const getSummaryValue = (summary: FreshdeskImportSummary | null | undefined, key: keyof FreshdeskImportSummary) =>
  numberValue(summary?.[key]);

const normalizeError = (value: unknown, index: number): FreshdeskImportError => {
  if (!value || typeof value !== 'object') return { row: index + 1, message: 'Неизвестная ошибка' };
  const item = value as Record<string, unknown>;
  return {
    row: typeof item.row === 'number' ? item.row : undefined,
    ticketId: typeof item.ticketId === 'string' || typeof item.ticketId === 'number' ? item.ticketId : undefined,
    externalId: typeof item.externalId === 'string' || typeof item.externalId === 'number' ? item.externalId : undefined,
    message: typeof item.message === 'string' ? item.message : typeof item.error === 'string' ? item.error : 'Неизвестная ошибка',
  };
};

const normalizeResult = (value: unknown, dryRun: boolean): FreshdeskImportResult => {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawRun = data.run && typeof data.run === 'object' ? data.run as Record<string, unknown> : {};
  const summary = data.summary && typeof data.summary === 'object'
    ? data.summary as FreshdeskImportSummary
    : rawRun.summary && typeof rawRun.summary === 'object'
      ? rawRun.summary as FreshdeskImportSummary
      : {};
  const rawErrors = Array.isArray(data.errors) ? data.errors : Array.isArray(rawRun.errors) ? rawRun.errors : [];
  const now = new Date().toISOString();
  return {
    run: {
      id: typeof rawRun.id === 'string' ? rawRun.id : `local-${Date.now()}`,
      source: typeof rawRun.source === 'string' ? rawRun.source : 'FRESHDESK',
      status: typeof rawRun.status === 'string' ? rawRun.status : dryRun ? 'DRY_RUN' : 'SUCCESS',
      dryRun: typeof rawRun.dryRun === 'boolean' ? rawRun.dryRun : dryRun,
      fileName: typeof rawRun.fileName === 'string' ? rawRun.fileName : null,
      summary,
      errors: rawErrors.map(normalizeError),
      createdAt: typeof rawRun.createdAt === 'string' ? rawRun.createdAt : now,
    },
    summary,
    errors: rawErrors.map(normalizeError),
  };
};

const SummaryItem: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="min-w-0 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2">
    <p className="truncate text-xs text-[#747474]">{label}</p>
    <p className="mt-1 text-base font-semibold tabular-nums text-[#1f1f1f]">{value}</p>
  </div>
);

const SummaryGrid: React.FC<{ summary?: FreshdeskImportSummary | null }> = ({ summary }) => {
  const optional = [
    { label: 'Комментарии', value: getSummaryValue(summary, 'comments') || getSummaryValue(summary, 'commentsCreated') || getSummaryValue(summary, 'commentsImported') || getSummaryValue(summary, 'commentsPlanned') },
    { label: 'Вложения', value: getSummaryValue(summary, 'attachments') || getSummaryValue(summary, 'attachmentsCreated') || getSummaryValue(summary, 'attachmentsImported') || getSummaryValue(summary, 'attachmentsPlanned') },
    { label: 'Пользователи', value: getSummaryValue(summary, 'users') || getSummaryValue(summary, 'usersCreated') },
  ].filter((item) => item.value > 0);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      <SummaryItem label="Всего заявок" value={getSummaryValue(summary, 'total')} />
      <SummaryItem label="Создано" value={getSummaryValue(summary, 'created')} />
      <SummaryItem label="Обновлено" value={getSummaryValue(summary, 'updated')} />
      <SummaryItem label="Пропущено" value={getSummaryValue(summary, 'skipped')} />
      <SummaryItem label="Ошибок" value={getSummaryValue(summary, 'errors')} />
      {optional.map((item) => <SummaryItem key={item.label} {...item} />)}
    </div>
  );
};

const ImportResult: React.FC<{ result: FreshdeskImportResult }> = ({ result }) => (
  <section className="space-y-3 rounded-[14px] border border-[#d8e1e8] bg-[#f8fbfd] p-4" data-testid="freshdesk-import-result">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#1f1f1f]">{result.run.dryRun ? 'Результат проверки' : 'Результат импорта'}</p>
        <p className="mt-1 truncate text-xs text-[#747474]">Запуск: {result.run.id}</p>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[result.run.status] || 'border-[#dedede] bg-white text-[#5a5a5a]'}`}>
        {statusLabels[result.run.status] || result.run.status}
      </span>
    </div>
    <SummaryGrid summary={result.summary} />
    {result.errors.length > 0 && (
      <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] p-3 text-sm text-[#8f2f2f]" data-testid="freshdesk-import-errors">
        <p className="font-semibold">Ошибки и пропущенные записи</p>
        <ul className="mt-2 space-y-1.5">
          {result.errors.slice(0, 20).map((error, index) => {
            const identity = error.ticketId ?? error.externalId;
            const prefix = identity !== undefined ? `Заявка ${identity}` : error.row ? `Строка ${error.row}` : `Запись ${index + 1}`;
            return <li className="break-words" key={`${prefix}-${index}`}>{prefix}: {error.message || 'Неизвестная ошибка'}</li>;
          })}
        </ul>
        {result.errors.length > 20 && <p className="mt-2 text-xs">Показаны первые 20 из {result.errors.length} ошибок.</p>}
      </div>
    )}
  </section>
);

const RunCard: React.FC<{ run: FreshdeskImportRun }> = ({ run }) => (
  <article className="rounded-[12px] border border-[#e3e3e3] bg-white p-3" data-testid="freshdesk-import-run-card">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#1f1f1f]">{run.fileName || (run.source === 'FRESHDESK_API' ? 'Прямой перенос' : 'Freshdesk import')}</p>
        <p className="mt-1 text-xs text-[#747474]">{formatDateTime(run.createdAt)}</p>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[run.status] || 'border-[#dedede] bg-[#f7f7f7] text-[#5a5a5a]'}`}>
        {statusLabels[run.status] || run.status}
      </span>
    </div>
    <div className="mt-3"><SummaryGrid summary={run.summary} /></div>
  </article>
);

export const FreshdeskImportAdminSection: React.FC = () => {
  const [method, setMethod] = useState<ImportMethod>('direct');
  const [healthState, setHealthState] = useState<HealthState>('loading');
  const [sourceHealth, setSourceHealth] = useState<FreshdeskSourceHealth | null>(null);
  const [updatedSince, setUpdatedSince] = useState('');
  const [maxTickets, setMaxTickets] = useState(20);
  const [downloadAttachments, setDownloadAttachments] = useState(false);
  const [verifiedDirectKey, setVerifiedDirectKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [parseError, setParseError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [runningAction, setRunningAction] = useState<RunningAction>('');
  const [result, setResult] = useState<FreshdeskImportResult | null>(null);
  const [runs, setRuns] = useState<FreshdeskImportRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState('');
  const [actionError, setActionError] = useState('');

  const directPayload = useMemo<FreshdeskPullDryRunPayload>(() => ({
    ...(updatedSince ? { updatedSince } : {}),
    maxTickets,
    downloadAttachments,
  }), [downloadAttachments, maxTickets, updatedSince]);
  const directKey = useMemo(() => JSON.stringify(directPayload), [directPayload]);
  const directConfigured = healthState === 'ready' && sourceHealth?.configured === true;
  const directVerified = directConfigured && verifiedDirectKey === directKey;
  const busy = runningAction !== '';
  const canRunFile = records.length > 0 && !loadingFile && !busy;

  const loadHealth = useCallback(async () => {
    setHealthState('loading');
    try {
      const data = await freshdeskImportAdminApi.getSourceHealth();
      setSourceHealth({
        configured: data?.configured === true,
        domain: typeof data?.domain === 'string' ? data.domain : null,
        downloadAttachmentsEnabled: data?.downloadAttachmentsEnabled === true,
      });
      setHealthState('ready');
    } catch (error) {
      setSourceHealth(null);
      setHealthState(isUnsupportedEndpoint(error) ? 'unavailable' : 'ready');
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError('');
    try {
      const response = await freshdeskImportAdminApi.getRuns({ limit: 10 });
      const data = response as unknown;
      const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: FreshdeskImportRun[] }).items
        : [];
      setRuns(list);
    } catch (error) {
      setRuns([]);
      setRunsError(safeServerMessage(error, 'Не удалось загрузить последние импорты Freshdesk.'));
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadHealth(), loadRuns()]);
  }, [loadHealth, loadRuns]);

  const switchMethod = (next: ImportMethod) => {
    setMethod(next);
    setResult(null);
    setActionError('');
  };

  const runDirect = async (mode: 'dry-run' | 'import') => {
    if (!directConfigured || busy || (mode === 'import' && !directVerified)) return;
    if (mode === 'import' && !window.confirm(
      `Будет запущен перенос до ${maxTickets} заявок из Freshdesk. Не закрывайте страницу до завершения. Продолжить?`,
    )) return;

    setRunningAction(mode === 'dry-run' ? 'direct-dry-run' : 'direct-import');
    setActionError('');
    setResult(null);
    try {
      const response = mode === 'dry-run'
        ? await freshdeskImportAdminApi.pullDryRun(directPayload)
        : await freshdeskImportAdminApi.pull({ ...directPayload, downloadAttachments });
      const normalized = normalizeResult(response, mode === 'dry-run');
      setResult(normalized);
      if (mode === 'dry-run') setVerifiedDirectKey(directKey);
      else setVerifiedDirectKey('');
      await loadRuns();
    } catch (error) {
      if (isUnsupportedEndpoint(error)) {
        setHealthState('unavailable');
        setActionError('Прямой перенос не поддерживается текущей версией сервера. Используйте импорт подготовленного файла.');
      } else {
        setActionError(safeServerMessage(error, mode === 'dry-run'
          ? 'Не удалось проверить перенос из Freshdesk.'
          : 'Не удалось выполнить перенос из Freshdesk.'));
      }
    } finally {
      setRunningAction('');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setResult(null);
    setActionError('');
    setParseError('');
    if (!file) {
      setFileName('');
      setRecords([]);
      return;
    }
    setFileName(file.name);
    setLoadingFile(true);
    try {
      const parsedRecords = await parseImportFile(file);
      if (parsedRecords.length === 0) throw new Error('В файле не найдено заявок для импорта.');
      setRecords(parsedRecords);
    } catch (error) {
      setRecords([]);
      setParseError(error instanceof Error ? error.message : 'Не удалось прочитать файл импорта.');
    } finally {
      setLoadingFile(false);
    }
  };

  const runFileImport = async (mode: 'dry-run' | 'import') => {
    if (!canRunFile) return;
    if (mode === 'import' && !window.confirm(`Будет импортировано до ${records.length} записей из файла ${fileName}. Продолжить?`)) return;
    setRunningAction(mode === 'dry-run' ? 'file-dry-run' : 'file-import');
    setActionError('');
    setResult(null);
    try {
      const payload = { tickets: records, fileName: fileName || 'freshdesk-import.json' };
      const response = mode === 'dry-run' ? await freshdeskImportAdminApi.dryRun(payload) : await freshdeskImportAdminApi.run(payload);
      setResult(normalizeResult(response, mode === 'dry-run'));
      await loadRuns();
    } catch (error) {
      setActionError(safeServerMessage(error, mode === 'dry-run'
        ? 'Не удалось выполнить проверку файла.'
        : 'Не удалось выполнить импорт файла.'));
    } finally {
      setRunningAction('');
    }
  };

  const summaryPreview = useMemo(() => ({
    total: records.length,
    firstExternalId: records[0]?.externalId || records[0]?.id || records[0]?.ticketId || records[0]?.ticket_id || '—',
  }), [records]);

  return (
    <div className="space-y-5" data-testid="admin-freshdesk-import">
      <header>
        <p className="text-base font-semibold text-[#1f1f1f]">Перенос данных из Freshdesk</p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#666]">
          Сначала выполните безопасную проверку. Она ничего не записывает в ServiceDesk и показывает ожидаемый результат переноса.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2" role="tablist" aria-label="Способ переноса Freshdesk">
        <button
          type="button"
          role="tab"
          aria-selected={method === 'direct'}
          className={`min-w-0 rounded-[14px] border p-4 text-left transition ${method === 'direct' ? 'border-[#2f5f78] bg-[#eef6f9] shadow-sm' : 'border-[#dedede] bg-white hover:border-[#bcbcbc]'}`}
          onClick={() => switchMethod('direct')}
          data-testid="freshdesk-import-method-direct"
        >
          <span className="flex items-start gap-3">
            <CloudDownload className="mt-0.5 shrink-0 text-[#315f73]" size={20} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-semibold text-[#1f1f1f]">
                Перенос напрямую из Freshdesk
                <span className="rounded-full bg-[#dcecf2] px-2 py-0.5 text-[11px] text-[#315f73]">Рекомендуется</span>
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#666]">Заявки, переписка и доступные вложения загружаются сервером.</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'file'}
          className={`min-w-0 rounded-[14px] border p-4 text-left transition ${method === 'file' ? 'border-[#2f5f78] bg-[#eef6f9] shadow-sm' : 'border-[#dedede] bg-white hover:border-[#bcbcbc]'}`}
          onClick={() => switchMethod('file')}
          data-testid="freshdesk-import-method-file"
        >
          <span className="flex items-start gap-3">
            <FileUp className="mt-0.5 shrink-0 text-[#555]" size={20} />
            <span className="min-w-0">
              <span className="font-semibold text-[#1f1f1f]">Импорт подготовленного файла</span>
              <span className="mt-1 block text-sm leading-5 text-[#666]">Резервный способ для JSON или CSV экспорта.</span>
            </span>
          </span>
        </button>
      </div>

      {method === 'direct' ? (
        <section className="space-y-4 rounded-[14px] border border-[#dfe5e8] bg-[#fcfdfd] p-4 sm:p-5" data-testid="freshdesk-direct-import">
          <div className="flex items-start gap-3">
            <ServerCog className="mt-0.5 shrink-0 text-[#4f6670]" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#1f1f1f]">Подключение к Freshdesk</p>
              {healthState === 'loading' ? (
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-[#666]"><Loader2 size={14} className="animate-spin" />Проверяем настройку сервера...</p>
              ) : healthState === 'unavailable' ? (
                <div className="mt-2 rounded-[10px] border border-[#eee0c8] bg-[#fff8ed] p-3 text-sm leading-5 text-[#76511d]" data-testid="freshdesk-source-unavailable">
                  Текущая версия сервера ещё не поддерживает прямой перенос. Файловый импорт ниже продолжает работать.
                </div>
              ) : sourceHealth?.configured ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#41612b]" data-testid="freshdesk-source-configured">
                  <CheckCircle2 size={16} /> Подключение настроено{sourceHealth.domain ? `: ${sourceHealth.domain}` : ''}.
                </div>
              ) : (
                <div className="mt-2 rounded-[10px] border border-[#eee0c8] bg-[#fff8ed] p-3 text-sm leading-6 text-[#76511d]" data-testid="freshdesk-source-not-configured">
                  <p className="font-semibold">Подключение на сервере не настроено</p>
                  <p className="mt-1">Администратору сервера нужно задать <code>FRESHDESK_DOMAIN</code> и <code>FRESHDESK_API_KEY</code>. Для загрузки файлов используется <code>FRESHDESK_DOWNLOAD_ATTACHMENTS_ENABLED</code>.</p>
                  <p className="mt-1">Секретный ключ хранится только в защищённых настройках сервера и никогда не вводится и не отображается в браузере.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="min-w-0 text-sm text-[#4a4a4a]">
              <span className="mb-1.5 block font-medium">Перенести изменения с даты</span>
              <input className="input" type="date" value={updatedSince} onChange={(event) => setUpdatedSince(event.target.value)} disabled={!directConfigured || busy} data-testid="freshdesk-pull-updated-since" />
              <span className="mt-1 block text-xs leading-5 text-[#777]">Оставьте пустым для первоначального переноса.</span>
            </label>
            <label className="min-w-0 text-sm text-[#4a4a4a]">
              <span className="mb-1.5 block font-medium">Количество заявок</span>
              <select className="input" value={maxTickets} onChange={(event) => setMaxTickets(Number(event.target.value))} disabled={!directConfigured || busy} data-testid="freshdesk-pull-max-tickets">
                <option value={20}>20 — безопасный тест</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="mt-1 block text-xs leading-5 text-[#777]">Начните с 20 заявок и проверьте результат.</span>
            </label>
          </div>

          <label className={`flex items-start gap-3 rounded-[10px] border p-3 text-sm ${sourceHealth?.downloadAttachmentsEnabled ? 'border-[#dfe5e8] bg-white' : 'border-[#e7e7e7] bg-[#f7f7f7] text-[#858585]'}`}>
            <input type="checkbox" className="mt-0.5" checked={downloadAttachments} onChange={(event) => setDownloadAttachments(event.target.checked)} disabled={!directConfigured || !sourceHealth?.downloadAttachmentsEnabled || busy} data-testid="freshdesk-pull-attachments" />
            <span><span className="font-medium">Скачать вложения при реальном переносе</span><span className="mt-1 block text-xs leading-5">Dry-run файлы не скачивает. Опция доступна только если загрузка вложений разрешена на сервере.</span></span>
          </label>

          <div className="rounded-[10px] border border-[#d8e3e8] bg-[#f2f8fa] p-3 text-sm leading-5 text-[#3f5964]">
            <p className="flex items-center gap-2 font-medium"><Info size={15} /> Порядок безопасного переноса</p>
            <p className="mt-1">1. Выполните проверку. 2. Изучите количество ошибок. 3. Только после этого запустите реальный перенос с теми же параметрами.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" className="btn sm:w-auto" disabled={!directConfigured || busy} onClick={() => void runDirect('dry-run')} data-testid="freshdesk-pull-dry-run">
              {runningAction === 'direct-dry-run' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Проверить перенос
            </button>
            <button type="button" className="btn btn-primary sm:w-auto" disabled={!directVerified || busy} onClick={() => void runDirect('import')} data-testid="freshdesk-pull-run">
              {runningAction === 'direct-import' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Запустить перенос
            </button>
            {!directVerified && directConfigured && <p className="self-center text-xs text-[#777]" data-testid="freshdesk-pull-verification-hint">Реальный перенос станет доступен после успешного dry-run.</p>}
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-[14px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 sm:p-5" data-testid="freshdesk-file-import">
          <div>
            <p className="font-semibold text-[#1f1f1f]">Файл импорта JSON/CSV</p>
            <div className="mt-2 rounded-[10px] border border-[#eee0c8] bg-[#fff8ed] p-3 text-sm leading-6 text-[#76511d]">
              Обычный CSV-экспорт Freshdesk часто не содержит полной переписки и бинарных вложений. Для полного переноса используйте прямое подключение или подготовленный JSON.
            </div>
          </div>
          <input className="input" type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => void handleFileChange(event)} data-testid="freshdesk-import-file" />
          {loadingFile ? (
            <p className="inline-flex items-center gap-2 text-sm text-[#5f5f5f]"><Loader2 size={14} className="animate-spin" />Читаем файл...</p>
          ) : records.length > 0 ? (
            <div className="rounded-[10px] border border-[#d9e6d2] bg-[#eef8e8] px-3 py-2 text-sm text-[#41612b]" data-testid="freshdesk-import-file-summary">
              Загружено заявок: {summaryPreview.total}. Первый externalId: {String(summaryPreview.firstExternalId)}.
            </div>
          ) : <p className="text-sm text-[#777]">Выберите подготовленный экспорт Freshdesk в формате JSON или CSV.</p>}
          {parseError && <p className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-2 text-sm text-[#b23b3b]">{parseError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" className="btn" disabled={!canRunFile} onClick={() => void runFileImport('dry-run')} data-testid="freshdesk-import-dry-run">
              {runningAction === 'file-dry-run' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Проверить файл
            </button>
            <button type="button" className="btn btn-primary" disabled={!canRunFile} onClick={() => void runFileImport('import')} data-testid="freshdesk-import-run">
              {runningAction === 'file-import' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Запустить импорт файла
            </button>
          </div>
        </section>
      )}

      {actionError && <p className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-2 text-sm text-[#b23b3b]" data-testid="freshdesk-import-action-error">{actionError}</p>}
      {result && <ImportResult result={result} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-semibold text-[#1f1f1f]">История переносов</p><p className="mt-1 text-xs text-[#777]">Последние проверки и реальные запуски.</p></div>
          <button type="button" className="btn" onClick={() => void loadRuns()} disabled={runsLoading}><RefreshCw size={14} />Обновить</button>
        </div>
        {runsLoading ? <DataState variant="loading" message="Загружаем историю импорта..." />
          : runsError ? <DataState variant="error" message={runsError} />
            : runs.length === 0 ? <DataState variant="empty" message="Запусков импорта Freshdesk пока нет." />
              : <div className="space-y-2" data-testid="freshdesk-import-runs">{runs.map((run) => <RunCard key={run.id} run={run} />)}</div>}
      </section>
    </div>
  );
};
