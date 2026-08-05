import React, { useEffect, useState } from 'react';
import { Loader2, PlugZap, Save } from 'lucide-react';
import { emailSettingsAdminApi } from '../../api';
import type { EmailSettingsAdmin, UpdateEmailSettingsInput } from '../../types';
import { DataState } from '../ui/DataState';

const errorText = (error: unknown) => (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Не удалось выполнить операцию.';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-sm text-[#555]"><span className="mb-1 block">{label}</span>{children}</label>;
const Toggle = ({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[12px] border border-[#e3e3e3] bg-white p-3">
    <span><span className="block text-sm font-medium text-[#222]">{label}</span><span className="mt-1 block text-xs leading-5 text-[#777]">{description}</span></span>
    <input type="checkbox" className="mt-1 h-5 w-5 accent-[#292929]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

export const EmailSettingsAdminSection: React.FC = () => {
  const [draft, setDraft] = useState<EmailSettingsAdmin | null>(null);
  const [secrets, setSecrets] = useState({ imapPassword: '', smtpPassword: '' });
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { emailSettingsAdminApi.get().then(setDraft).catch((e) => setError(errorText(e))); }, []);
  const set = <K extends keyof EmailSettingsAdmin>(key: K, value: EmailSettingsAdmin[K]) => setDraft((d) => d ? { ...d, [key]: value } : d);
  const save = async () => {
    if (!draft) return; setBusy('save'); setError(''); setNotice('');
    try {
      const payload: UpdateEmailSettingsInput = { ...draft, ...(secrets.imapPassword ? { imapPassword: secrets.imapPassword } : {}), ...(secrets.smtpPassword ? { smtpPassword: secrets.smtpPassword } : {}) };
      const saved = await emailSettingsAdminApi.update(payload); setDraft(saved); setSecrets({ imapPassword: '', smtpPassword: '' }); setNotice('Настройки сохранены и применены без перезапуска сервера.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test'); setError(''); setNotice('');
    try { const r = await emailSettingsAdminApi.test(); setNotice([r.imap && `IMAP: ${r.imap.message}`, r.smtp && `SMTP: ${r.smtp.message}`].filter(Boolean).join(' ')); }
    catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  if (!draft) return <DataState variant={error ? 'error' : 'loading'} message={error || 'Загружаем настройки почты...'} />;
  const input = 'input w-full';
  return <div className="space-y-4" data-testid="admin-email-settings">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-[16px] border border-[#dedede] bg-white p-4">
      <div><h2 className="font-semibold text-[#222]">Почтовый узел и уведомления</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#707070]">Приём заявок по IMAP, отправка через SMTP, очередь, маршрутизация и письма заявителю. Пароли зашифрованы и никогда не возвращаются в браузер.</p></div>
      <div className="flex gap-2"><button className="btn inline-flex items-center gap-2" onClick={() => void test()} disabled={!!busy}><PlugZap size={15}/>{busy === 'test' ? 'Проверяем...' : 'Проверить соединения'}</button><button className="btn btn-primary inline-flex items-center gap-2" onClick={() => void save()} disabled={!!busy}>{busy === 'save' ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}Сохранить</button></div>
    </div>
    {error && <div className="rounded-[12px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div className="rounded-[12px] border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</div>}
    <section className="rounded-[16px] border border-[#dedede] bg-[#fafafa] p-4"><h3 className="font-semibold">Режимы работы</h3><div className="mt-3 grid gap-3 md:grid-cols-2">
      <Toggle label="Принимать новые письма" description="Новые письма автоматически создают заявки." checked={draft.intakeEnabled} onChange={(v)=>set('intakeEnabled',v)}/>
      <Toggle label="Отправлять письма" description="Ответы и уведомления уходят через SMTP." checked={draft.outboundEnabled} onChange={(v)=>set('outboundEnabled',v)}/>
      <Toggle label="Фоновая очередь" description="Повторяет отправку после временных ошибок." checked={draft.workerEnabled} onChange={(v)=>set('workerEnabled',v)}/>
      <Toggle label="Автоматические уведомления" description="Главный выключатель писем заявителям, исполнителям и командам." checked={draft.notificationsEnabled} onChange={(v)=>set('notificationsEnabled',v)}/>
    </div></section>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[16px] border border-[#dedede] bg-white p-4"><h3 className="font-semibold">Входящая почта (IMAP)</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Сервер"><input className={input} value={draft.imapHost} onChange={e=>set('imapHost',e.target.value)}/></Field><Field label="Порт"><input type="number" className={input} value={draft.imapPort} onChange={e=>set('imapPort',Number(e.target.value))}/></Field>
        <Field label="Логин"><input className={input} value={draft.imapUser||''} onChange={e=>set('imapUser',e.target.value)}/></Field><Field label={`Пароль (${draft.imapPasswordConfigured?'настроен':'не настроен'})`}><input type="password" className={input} value={secrets.imapPassword} placeholder="Оставьте пустым, чтобы не менять" onChange={e=>setSecrets(s=>({...s,imapPassword:e.target.value}))}/></Field>
        <Field label="Папка"><input className={input} value={draft.mailbox} onChange={e=>set('mailbox',e.target.value)}/></Field><Field label="Начальный UID"><input type="number" className={input} value={draft.intakeStartUid} onChange={e=>set('intakeStartUid',Number(e.target.value))}/></Field>
        <Field label="Интервал проверки, мс"><input type="number" min={5000} step={1000} className={input} value={draft.intakePollIntervalMs} onChange={e=>set('intakePollIntervalMs',Number(e.target.value))}/><span className="mt-1 block text-xs text-[#888]">Рекомендуется 15 000 мс — заявка появится примерно за 15 секунд.</span></Field><Field label="Писем за цикл"><input type="number" className={input} value={draft.intakeMaxMessages} onChange={e=>set('intakeMaxMessages',Number(e.target.value))}/></Field>
      </div><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={draft.imapSecure} onChange={e=>set('imapSecure',e.target.checked)}/>Защищённое соединение TLS</label></section>
      <section className="rounded-[16px] border border-[#dedede] bg-white p-4"><h3 className="font-semibold">Исходящая почта (SMTP)</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Сервер"><input className={input} value={draft.smtpHost} onChange={e=>set('smtpHost',e.target.value)}/></Field><Field label="Порт"><input type="number" className={input} value={draft.smtpPort} onChange={e=>set('smtpPort',Number(e.target.value))}/></Field>
        <Field label="Логин"><input className={input} value={draft.smtpUser||''} onChange={e=>set('smtpUser',e.target.value)}/></Field><Field label={`Пароль (${draft.smtpPasswordConfigured?'настроен':'не настроен'})`}><input type="password" className={input} value={secrets.smtpPassword} placeholder="Оставьте пустым, чтобы не менять" onChange={e=>setSecrets(s=>({...s,smtpPassword:e.target.value}))}/></Field>
        <Field label="Email отправителя"><input className={input} value={draft.fromAddress||''} onChange={e=>set('fromAddress',e.target.value)}/></Field><Field label="Имя отправителя"><input className={input} value={draft.fromName} onChange={e=>set('fromName',e.target.value)}/></Field>
      </div><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={draft.smtpSecure} onChange={e=>set('smtpSecure',e.target.checked)}/>Защищённое соединение TLS</label></section>
    </div>
    <section className="rounded-[16px] border border-[#dedede] bg-white p-4"><h3 className="font-semibold">Автоматические уведомления</h3><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Toggle label="Заявка создана" description="Подтверждение с номером заявки." checked={draft.notifyRequesterCreated} onChange={v=>set('notifyRequesterCreated',v)}/><Toggle label="Публичный ответ" description="Ответ сотрудника в переписке." checked={draft.notifyRequesterComment} onChange={v=>set('notifyRequesterComment',v)}/><Toggle label="Статус изменён" description="Включая решение и повторное открытие." checked={draft.notifyRequesterStatus} onChange={v=>set('notifyRequesterStatus',v)}/><Toggle label="Назначен исполнитель" description="Сообщить имя ответственного." checked={draft.notifyRequesterAssigned} onChange={v=>set('notifyRequesterAssigned',v)}/>
      <Toggle label="Письмо исполнителю" description="Отправить содержание заявки при назначении." checked={draft.notifyAssigneeAssigned} onChange={v=>set('notifyAssigneeAssigned',v)}/>
      <Toggle label="Добавление в чат" description="Письмо новому участнику обычного чата или переписки заявки." checked={draft.notifyChatMemberAdded} onChange={v=>set('notifyChatMemberAdded',v)}/>
      <Toggle label="Новая заявка команды" description="Письмо всем участникам команды, в чью очередь поступила заявка." checked={draft.notifyTeamNewTask} onChange={v=>set('notifyTeamNewTask',v)}/>
    </div><div className="mt-3"><Field label="Публичный адрес портала"><input className={input} value={draft.portalBaseUrl||''} placeholder="https://service.company.ru" onChange={e=>set('portalBaseUrl',e.target.value)}/></Field></div></section>
    <section className="rounded-[16px] border border-[#dedede] bg-white p-4"><h3 className="font-semibold">Шаблоны писем</h3><p className="mt-1 text-xs text-[#777]">Переменные: {'{{ticketNumber}}'}, {'{{title}}'}, {'{{description}}'}, {'{{priority}}'}, {'{{status}}'}, {'{{oldStatus}}'}, {'{{requesterName}}'}, {'{{assigneeName}}'}, {'{{comment}}'}, {'{{chatTitle}}'}, {'{{memberName}}'}, {'{{addedByName}}'}, {'{{teamName}}'}, {'{{folderName}}'}, {'{{typeName}}'}, {'{{subtypeName}}'}, {'{{portalLink}}'}.</p><div className="mt-3 grid gap-4 xl:grid-cols-2">
      {(['created','comment','status','assigned','assignee','chatMember','teamNewTask'] as const).map((kind) => { const subject=`${kind}SubjectTemplate` as keyof EmailSettingsAdmin; const body=`${kind}BodyTemplate` as keyof EmailSettingsAdmin; const names={created:'Создание для заявителя',comment:'Ответ заявителю',status:'Статус для заявителя',assigned:'Назначение для заявителя',assignee:'Назначение для исполнителя',chatMember:'Добавление участника в чат',teamNewTask:'Новая заявка для команды'}; return <div key={kind} className="rounded-[12px] border border-[#e5e5e5] p-3"><p className="mb-2 text-sm font-medium">{names[kind]}</p><input className={input} value={String(draft[subject])} onChange={e=>set(subject,e.target.value as never)}/><textarea className="input mt-2 min-h-32 w-full" value={String(draft[body])} onChange={e=>set(body,e.target.value as never)}/></div>; })}
    </div></section>
    <section className="rounded-[16px] border border-[#dedede] bg-white p-4"><h3 className="font-semibold">Очередь и маршрутизация</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Повтор через, минут"><input type="number" className={input} value={draft.retryDelayMinutes} onChange={e=>set('retryDelayMinutes',Number(e.target.value))}/></Field><Field label="Максимум попыток"><input type="number" className={input} value={draft.maxAttempts} onChange={e=>set('maxAttempts',Number(e.target.value))}/></Field><Field label="Пакет очереди"><input type="number" className={input} value={draft.workerBatchSize} onChange={e=>set('workerBatchSize',Number(e.target.value))}/></Field><Field label="Макс. вложение, байт"><input type="number" className={input} value={draft.attachmentMaxBytes} onChange={e=>set('attachmentMaxBytes',Number(e.target.value))}/></Field>
      <Field label="Интервал очереди, мс"><input type="number" className={input} value={draft.workerIntervalMs} onChange={e=>set('workerIntervalMs',Number(e.target.value))}/></Field><Field label="Блокировка задания, мс"><input type="number" className={input} value={draft.lockTtlMs} onChange={e=>set('lockTtlMs',Number(e.target.value))}/></Field>
      <Field label="ID папки по умолчанию"><input className={input} value={draft.defaultFolderId||''} onChange={e=>set('defaultFolderId',e.target.value)}/></Field><Field label="ID объекта"><input className={input} value={draft.defaultEntityId||''} onChange={e=>set('defaultEntityId',e.target.value)}/></Field><Field label="ID типа"><input className={input} value={draft.defaultTypeId||''} onChange={e=>set('defaultTypeId',e.target.value)}/></Field><Field label="ID подтипа"><input className={input} value={draft.defaultSubtypeId||''} onChange={e=>set('defaultSubtypeId',e.target.value)}/></Field>
    </div></section>
  </div>;
};
