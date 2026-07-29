import React from 'react';
import { DataState } from '../components/ui/DataState';

export const FinancePage: React.FC = () => (
  <div className="space-y-4">
    <h1 className="page-title">Финансы</h1>
    <DataState
      variant="empty"
      message="Финансовый модуль выведен из MVP. В рабочем контуре остаются только заявки, база знаний, очередь и отчёты по исполнению."
    />
  </div>
);
