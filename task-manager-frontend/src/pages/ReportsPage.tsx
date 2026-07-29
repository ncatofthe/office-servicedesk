import React, { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { Loader2 } from 'lucide-react';
import { KpiCard } from '../components/ui/KpiCard';
import { ChartCard } from '../components/ui/ChartCard';
import { ChartSurface } from '../components/ui/ChartSurface';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { reportsApi } from '../api';
import type { ReportsData } from '../types';
import { DataState } from '../components/ui/DataState';

export const ReportsPage: React.FC = () => {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const reports = await reportsApi.getReports();
        setData(reports);
      } catch (e: unknown) {
        const status = (e as AxiosError)?.response?.status;
        if (status === 403) {
          setError('Нет доступа к разделу «Отчёты». Для просмотра нужны роли Администратор или Наблюдатель.');
        } else {
          setError('Не удалось загрузить отчёты');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const completion = data?.completionRatings || [];
  const activity = data?.activity || [];
  const overdue = data?.overdue || [];

  const totalTasks = completion.reduce((sum, c) => sum + c.total, 0);
  const doneTasks = completion.reduce((sum, c) => sum + c.done, 0);
  const overdueTotal = overdue.reduce((sum, item) => sum + item.overdue_count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-center text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        <span>Подготавливаем отчёты по команде…</span>
      </div>
    );
  }
  if (error) return <div className="py-12 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Отчёты</h1>
        <p className="page-subtitle mt-1">Показатели команды, динамика активности и соблюдение сроков</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="В срок" value={`${data?.onTimePercent ?? 0}%`} progress={data?.onTimePercent ?? 0} />
        <KpiCard label="Завершено" value={doneTasks.toString()} progress={100} />
        <KpiCard label="Всего заявок" value={totalTasks.toString()} progress={100} />
        <KpiCard label="Просрочено" value={overdueTotal.toString()} progress={Math.min(100, overdueTotal)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Эффективность команды (комментарии в мес.)">
          {activity.length === 0 ? (
            <DataState variant="empty" message="Пока недостаточно данных, чтобы показать активность команды по месяцам." />
          ) : (
            <ChartSurface height={240}>
              {({ width, height }) => (
                <LineChart width={width} height={height} data={activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" stroke="#6b6b6b" />
                  <YAxis stroke="#6b6b6b" />
                  <Tooltip />
                  <Line type="monotone" dataKey="comments" stroke="#2f2f2f" strokeWidth={2} dot />
                </LineChart>
              )}
            </ChartSurface>
          )}
        </ChartCard>

        <ChartCard title="Заявки по исполнителям">
          {completion.length === 0 ? (
            <DataState variant="empty" message="Нет данных по исполнителям для построения отчёта." />
          ) : (
            <ChartSurface height={240}>
              {({ width, height }) => (
                <BarChart width={width} height={height} data={completion}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" stroke="#6b6b6b" interval={0} angle={-20} textAnchor="end" height={80} />
                  <YAxis stroke="#6b6b6b" />
                  <Tooltip />
                  <Bar dataKey="completionPercent" fill="#2f2f2f" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ChartSurface>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Просроченные заявки по сотрудникам">
        {overdue.length === 0 ? (
          <DataState variant="empty" message="Просроченных заявок за выбранный период пока нет." />
        ) : (
          <ChartSurface height={240}>
            {({ width, height }) => (
              <BarChart width={width} height={height} data={overdue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="name" stroke="#6b6b6b" interval={0} angle={-20} textAnchor="end" height={80} />
                <YAxis stroke="#6b6b6b" />
                <Tooltip />
                <Bar dataKey="overdue_count" fill="#6b6b6b" radius={[6, 6, 0, 0]} />
              </BarChart>
            )}
          </ChartSurface>
        )}
      </ChartCard>
    </div>
  );
};
