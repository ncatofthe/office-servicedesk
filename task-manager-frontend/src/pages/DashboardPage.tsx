import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Clock, FilePlus2, LifeBuoy, Star, TimerReset, TrendingUp, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dashboardApi, tasksApi } from '../api';
import { ChartSurface } from '../components/ui/ChartSurface';
import { UserAvatar } from '../components/ui/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { useProductSettings } from '../contexts/ProductSettingsContext';
import type { DashboardData, TaskSummary } from '../types';
import { getRoleLabel, getStatusLabel, priorityLabels } from '../utils';

const KpiTile: React.FC<{
  title: string;
  value: string | number;
  deltaLabel?: string;
  trend?: 'up' | 'down';
  progressLabel?: string;
  progress?: number;
  icon: React.ReactNode;
  to?: string;
}> = ({ title, value, deltaLabel, trend = 'up', progressLabel, progress, icon, to }) => {
  const content = <>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-[#6b6b6b]">{title}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[34px] font-semibold leading-none text-[#2f2f2f]">{value}</span>
          {deltaLabel && (
            <div className={`flex items-center gap-1 text-xs ${trend === 'up' ? 'text-[#2f2f2f]' : 'text-[#6b6b6b]'}`}>
              {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              <span>{deltaLabel}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center rounded-2xl bg-[#e8e8e8] p-2 text-[#353535]">
        {icon}
      </div>
    </div>
    {progressLabel && typeof progress === 'number' && (
      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-between text-xs text-[#6b6b6b]">
          <span>{progressLabel}</span>
          <span className="font-semibold text-[#2f2f2f]">{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8e8e8]">
          <div className="h-full rounded-full bg-[#2f2f2f]" style={{ width: `${progress}%` }} />
        </div>
      </div>
    )}
  </>;
  const className = `relative overflow-hidden rounded-2xl border border-[#dedede] bg-white px-5 py-4 shadow-[0px_10px_30px_rgba(0,0,0,0.06)] ${
    to ? 'block transition hover:-translate-y-0.5 hover:border-[#b9b9b9] hover:shadow-[0px_14px_34px_rgba(0,0,0,0.09)]' : ''
  }`;

  return to
    ? <Link to={to} className={className}>{content}</Link>
    : <div className={className}>{content}</div>;
};

const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, children, actions, className }) => (
  <div
    className={`min-w-0 rounded-2xl border border-[#dedede] bg-white px-6 py-5 shadow-[0px_10px_30px_rgba(0,0,0,0.06)] ${
      className ?? ''
    }`}
  >
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-xl font-semibold leading-tight text-[#2f2f2f]">{title}</p>
        {subtitle && <p className="text-sm text-[#9d9d9d]">{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children}
  </div>
);

const Chip: React.FC<{ text: string }> = ({ text }) => (
  <span className="inline-flex min-w-[64px] items-center justify-center rounded-lg bg-[#e8e8e8] px-2 py-1 text-[11px] font-medium text-[#353535]">
    {text}
  </span>
);

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useProductSettings();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentTasks, setRecentTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isRequester = user?.role === 'REQUESTER';
  const ticketsEnabled = isFeatureEnabled('tickets');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (isRequester && ticketsEnabled) {
          const tasksResp = await tasksApi.getAll({ limit: 100, offset: 0 });
          setRecentTasks(tasksResp.tasks || []);
          setData(null);
          return;
        }

        if (isRequester) {
          setRecentTasks([]);
          setData(null);
          return;
        }

        const [dashboard, tasksResp] = await Promise.all([
          dashboardApi.getDashboard(),
          ticketsEnabled
            ? tasksApi.getAll({ limit: 5, offset: 0 })
            : Promise.resolve({ tasks: [], total: 0, limit: 5, offset: 0 }),
        ]);
        if (!dashboard || Array.isArray(dashboard) || typeof dashboard !== 'object') {
          throw new Error('Invalid dashboard payload');
        }
        setData(dashboard);
        setRecentTasks(tasksResp.tasks || []);
      } catch (e) {
        setError('Не удалось загрузить дашборд');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isRequester, ticketsEnabled]);

  const kpi = data?.kpi ?? { pending: 0, inProgress: 0, completed: 0, completionRate: '0%' };
  const totalKpi = Math.max(1, kpi.pending + kpi.inProgress + kpi.completed);
  const pendingProgress = Math.round((kpi.pending / totalKpi) * 100);
  const inProgressProgress = Math.round((kpi.inProgress / totalKpi) * 100);
  const completedProgress = Math.round((kpi.completed / totalKpi) * 100);
  const completionProgress = Math.max(0, Math.min(100, parseFloat(String(kpi.completionRate).replace('%', '')) || 0));

  const performanceBreakdown = useMemo(() => {
    const onTimeRaw = parseFloat(String(data?.efficiency?.onTimePercent ?? '0').replace('%', ''));
    const onTime = Number.isFinite(onTimeRaw) ? onTimeRaw : 0;
    const late = Math.max(0, 100 - onTime);
    return [
      { name: 'В срок', value: onTime, tone: '#353535' },
      { name: 'Просрочено', value: late, tone: '#b3b3b3' },
    ];
  }, [data]);

  const productivityByMonth = useMemo(() => {
    return (data?.monthlyProductivity || []).map((m) => ({
      month: m.month,
      value: m.completed,
    }));
  }, [data]);

  const activeEmployees = Array.isArray(data?.activeEmployees) ? data.activeEmployees : [];
  const worker = data?.workerOfMonth ?? null;
  const recentClosures = Array.isArray(data?.recentClosures) ? data.recentClosures : [];
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-center text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        <span>{isRequester ? 'Загружаем ваши заявки…' : 'Подготавливаем сводку по команде…'}</span>
      </div>
    );
  }

  if (error) {
    return <div className="py-12 text-center text-red-500">{error}</div>;
  }

  if (isRequester) {
    const activeTasks = recentTasks.filter((task) => task.status !== 'DONE' && task.status !== 'MERGED');
    const newTasks = recentTasks.filter((task) => task.status === 'NEW');
    const inProgressTasks = recentTasks.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'REVIEW');
    const completedTasks = recentTasks.filter((task) => task.status === 'DONE');

    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[22px] border border-[#dedede] bg-[#2f2f2f] px-5 py-6 text-white shadow-[0_16px_40px_rgba(0,0,0,0.12)] sm:px-7 sm:py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm text-white/65">Здравствуйте, {user?.name?.split(/\s+/)[0] || 'коллега'}</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Чем мы можем помочь?</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
                Опишите проблему или запрос — обращение попадёт нужной команде, а все ответы появятся в переписке.
              </p>
            </div>
            {isFeatureEnabled('tickets') && <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              {isFeatureEnabled('ticketCreation') && (
              <Link
                to="/tickets?create=1"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] bg-white px-5 text-sm font-semibold text-[#1f1f1f] transition hover:bg-[#f2f2f2]"
              >
                <FilePlus2 size={18} />
                Создать заявку
              </Link>
              )}
              <Link
                to="/tickets"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-white/25 px-5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Мои заявки
                <ArrowRight size={16} />
              </Link>
            </div>}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Ожидают обработки', value: newTasks.length, helper: 'Команда ещё не взяла их в работу', icon: <TimerReset size={19} />, to: '/tickets?status=NEW' },
            { label: 'Сейчас в работе', value: inProgressTasks.length, helper: 'Исполнитель занимается вопросом', icon: <Clock size={19} />, to: '/tickets?status=IN_PROGRESS' },
            { label: 'Решено', value: completedTasks.length, helper: 'Закрытые обращения', icon: <CheckCircle2 size={19} />, to: '/tickets?status=DONE' },
          ].map((item) => (
            <Link key={item.label} to={item.to} className="rounded-[16px] border border-[#dedede] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-[#b9b9b9] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#4f4f4f]">{item.label}</p>
                  <p className="mt-1 text-3xl font-semibold text-[#1f1f1f]">{item.value}</p>
                </div>
                <span className="rounded-[12px] bg-[#eeeeee] p-2.5 text-[#353535]">{item.icon}</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#8a8a8a]">{item.helper}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <SectionCard
            title={activeTasks.length > 0 ? 'Актуальные заявки' : 'Ваши последние заявки'}
            subtitle="Откройте заявку, чтобы посмотреть статус или написать исполнителю"
            actions={(
              <Link to="/tickets" className="inline-flex items-center gap-1 text-sm font-medium text-[#353535] hover:underline">
                Все заявки <ArrowRight size={15} />
              </Link>
            )}
          >
            <div className="divide-y divide-[#ededed]">
              {(activeTasks.length > 0 ? activeTasks : recentTasks).slice(0, 6).map((task) => (
                <Link
                  key={task.id}
                  to={`/tickets?taskId=${encodeURIComponent(task.id)}`}
                  className="flex items-center justify-between gap-3 py-3 transition hover:bg-[#fafafa]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2f2f2f]">
                      {[task.displayNumber, task.title].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-[#7d7d7d]">
                      {getStatusLabel(task.status)} · обновлено {new Date(task.updatedAt).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-[#8a8a8a]" />
                </Link>
              ))}
              {recentTasks.length === 0 && (
                <div className="py-7 text-center">
                  <p className="text-sm font-medium text-[#353535]">Заявок пока нет</p>
                  <p className="mt-1 text-sm text-[#8a8a8a]">Создайте первую — это займёт около минуты.</p>
                </div>
              )}
            </div>
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="Что будет дальше?" subtitle="Три понятных этапа">
              <ol className="space-y-4">
                {[
                  ['1', 'Заявка создана', 'Мы получили обращение и направляем его нужной команде.'],
                  ['2', 'В работе', 'Исполнитель может задать вопрос в переписке.'],
                  ['3', 'Решено', 'Вы получите уведомление и увидите результат в заявке.'],
                ].map(([step, title, description]) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2f2f2f] text-xs font-semibold text-white">{step}</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2f2f2f]">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#7a7a7a]">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </SectionCard>

            <Link
              to="/knowledge"
              className="flex items-center gap-3 rounded-[16px] border border-[#dedede] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition hover:border-[#bdbdbd]"
            >
              <span className="rounded-[12px] bg-[#eeeeee] p-2.5 text-[#353535]"><LifeBuoy size={20} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#2f2f2f]">Возможно, ответ уже есть</span>
                <span className="mt-1 block text-xs text-[#7a7a7a]">Посмотреть инструкции в базе знаний</span>
              </span>
              <ArrowRight size={16} className="ml-auto shrink-0 text-[#8a8a8a]" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Главная</h1>
        <p className="page-subtitle mt-1">Ключевые показатели, активность команды и последние заявки</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          title="Необработанные"
          value={kpi.pending}
          trend="down"
          progressLabel="Доля новых заявок"
          progress={pendingProgress}
          icon={<TimerReset size={20} />}
          to="/tickets?status=NEW"
        />
        <KpiTile
          title="В работе"
          value={kpi.inProgress}
          trend="up"
          progressLabel="Доля заявок в работе"
          progress={inProgressProgress}
          icon={<Clock size={20} />}
          to="/tickets?status=IN_PROGRESS"
        />
        <KpiTile
          title="Закрытые"
          value={kpi.completed}
          trend="up"
          progressLabel="Доля закрытых заявок"
          progress={completedProgress}
          icon={<TrendingUp size={20} />}
          to="/tickets?status=DONE"
        />
        <KpiTile
          title="Рейтинг выполнения"
          value={kpi.completionRate}
          trend="up"
          progressLabel="Рейтинг"
          progress={completionProgress}
          icon={<Star size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          title="Продуктивность по месяцам"
          subtitle="Сколько заявок команда закрывает по месяцам"
          className="xl:col-span-2"
        >
          <ChartSurface height={320}>
            {({ width, height }) => (
              <BarChart width={width} height={height} data={productivityByMonth} barCategoryGap={10}>
                <CartesianGrid vertical={false} stroke="#e8e8e8" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: '#e8e8e8' }}
                  tick={{ fill: '#6b6b6b', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: '#e8e8e8' }}
                  tick={{ fill: '#6b6b6b', fontSize: 12 }}
                />
                <Tooltip cursor={{ fill: '#f5f5f5' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#353535">
                  {productivityByMonth.map((entry) => (
                    <Cell key={entry.month} fill="#353535" />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartSurface>
        </SectionCard>

        <SectionCard title="Производительность" actions={<Chip text="Текущий месяц" />}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              {performanceBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-[#353535]">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: item.tone }} />
                    {item.name}
                  </div>
                  <span className="text-base font-semibold text-[#2f2f2f]">{item.value.toFixed(1)}%</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-sm text-[#9d9d9d]">
                <Clock size={14} />
                Данные за текущий месяц
              </div>
            </div>
            <ChartSurface height={200}>
              {({ width, height }) => (
                <PieChart width={width} height={height}>
                  <Pie
                    data={performanceBreakdown}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    stroke="#fff"
                    strokeWidth={1}
                  >
                    {performanceBreakdown.map((item) => (
                      <Cell key={item.name} fill={item.tone} />
                    ))}
                  </Pie>
                </PieChart>
              )}
            </ChartSurface>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Производительность сотрудников" actions={<Chip text="Команда" />}>
          <div className="space-y-4">
            {activeEmployees.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-3 rounded-xl border border-[#ededed] bg-[#f9f9f9] px-3 py-2"
              >
                <UserAvatar name={person.name} avatar={person.avatar} className="h-10 w-10 rounded-lg bg-[#353535] text-xs text-white" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#2f2f2f]">{person.name}</p>
                  <p className="text-xs text-[#9d9d9d]">{getRoleLabel(person.role)}</p>
                </div>
                <div className="w-40">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8e8e8]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#353535] to-[#9d9d9d]"
                      style={{ width: `${Math.min(100, (person.tasks_count / Math.max(1, data?.kpi.completed || 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-xs text-[#353535]">{person.tasks_count} заявок</div>
                </div>
              </div>
            ))}
            {activeEmployees.length === 0 && (
              <p className="text-sm text-[#9d9d9d]">Пока нет данных по активным сотрудникам за текущий период.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Работник месяца">
          {worker ? (
            <div className="space-y-3 rounded-xl border border-[#ededed] bg-[#f9f9f9] p-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={worker.name} avatar={worker.avatar} className="h-16 w-16 rounded-xl bg-[#353535] text-xl text-white" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-[#2f2f2f]">{worker.name}</p>
                  <p className="text-sm text-[#9d9d9d]">{getRoleLabel(worker.role)}</p>
                </div>
              </div>
              <div className="text-sm text-[#353535]">Завершено заявок: {worker.done_count}</div>
            </div>
          ) : (
            <p className="text-sm text-[#9d9d9d]">Когда появятся завершённые заявки за месяц, здесь будет лучший сотрудник периода.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Последние заявки">
          <div className="divide-y divide-[#ededed]">
            {recentTasks.map((t) => (
              <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#2f2f2f]">
                    {[t.displayNumber, t.title].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-[#9d9d9d]">{priorityLabels[t.priority] || t.priority} · {getStatusLabel(t.status)}</p>
                </div>
                <span className="shrink-0 text-xs text-[#9d9d9d]">{t.dueDate ? new Date(t.dueDate).toLocaleDateString('ru-RU') : '-'}</span>
              </div>
            ))}
            {recentTasks.length === 0 && <p className="py-4 text-sm text-[#9d9d9d]">Пока нет заявок. После создания они появятся в этой ленте.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Последние закрытия">
          <div className="divide-y divide-[#ededed]">
            {recentClosures.map((item) => (
              <div key={item.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  {item.actor && <UserAvatar name={item.actor.name} avatar={item.actor.avatar} className="h-9 w-9 bg-[#353535] text-[10px] text-white" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#2f2f2f]">
                      {[item.task.displayNumber, item.task.title].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-[#9d9d9d]">
                      Закрыл: {item.actor?.name || 'Система'} · {item.actor ? getRoleLabel(item.actor.role) : 'автоматизация'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[#9d9d9d]">
                    {new Date(item.closedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#9d9d9d]">{priorityLabels[item.task.priority] || item.task.priority}</p>
              </div>
            ))}
            {recentClosures.length === 0 && (
              <p className="py-4 text-sm text-[#9d9d9d]">Закрытых заявок с историей действий пока нет.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
