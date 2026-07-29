import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import type { CannedReply, CannedReplyInput, CannedReplyVisibility } from '../../types';

interface Props {
  open: boolean;
  reply: CannedReply | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (data: CannedReplyInput) => Promise<void> | void;
}

const visibilityLabels: Record<CannedReplyVisibility, string> = {
  PRIVATE: 'Личный',
  SHARED: 'Общий',
};

const getInitialState = (reply: CannedReply | null) => ({
  title: reply?.title || '',
  body: reply?.body || '',
  category: reply?.category || '',
  visibility: reply?.visibility || 'PRIVATE' as CannedReplyVisibility,
  isActive: reply?.isActive !== false,
});

export const CannedReplyFormModal: React.FC<Props> = ({
  open,
  reply,
  saving = false,
  onClose,
  onSave,
}) => {
  const initialState = getInitialState(reply);
  const [title, setTitle] = useState(initialState.title);
  const [body, setBody] = useState(initialState.body);
  const [category, setCategory] = useState(initialState.category);
  const [visibility, setVisibility] = useState<CannedReplyVisibility>(initialState.visibility);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [formError, setFormError] = useState('');

  const handleClose = () => {
    if (!saving) {
      setFormError('');
      onClose();
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      setFormError('Заполните название и текст шаблона.');
      return;
    }

    setFormError('');
    await onSave({
      title: title.trim(),
      body: body.trim(),
      category: category.trim() || null,
      visibility,
      isActive,
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={reply ? 'Редактировать шаблон ответа' : 'Новый шаблон ответа'}
      testId="canned-reply-form"
    >
      <div className="space-y-4">
        {formError && (
          <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]">
            {formError}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]">Название *</label>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            placeholder="Например: Первичный ответ по заявке"
            data-testid="canned-reply-form-title"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]">Категория</label>
          <input
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={saving}
            placeholder="Например: Доступы, Почта, 1С"
            data-testid="canned-reply-form-category"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-[#5f5f5f]">Видимость</label>
            <select
              className="input"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as CannedReplyVisibility)}
              disabled={saving}
              data-testid="canned-reply-form-visibility"
            >
              {Object.entries(visibilityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                disabled={saving}
                data-testid="canned-reply-form-active"
              />
              Активен
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]">Текст шаблона *</label>
          <textarea
            className="input min-h-[240px]"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={saving}
            placeholder="Текст, который будет подставляться в ответ"
            data-testid="canned-reply-form-body"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={handleClose} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving || !title.trim() || !body.trim()}
            data-testid="canned-reply-save"
          >
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
