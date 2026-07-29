import React from 'react';
import { DataState } from '../components/ui/DataState';

export const ReviewsPage: React.FC = () => (
  <div className="space-y-4">
    <h1 className="page-title">Согласования</h1>
    <DataState
      variant="empty"
      message="Отдельный модуль согласований убран из MVP. Закрытие объединённых заявок теперь подтверждается прямо внутри карточки заявки."
    />
  </div>
);
