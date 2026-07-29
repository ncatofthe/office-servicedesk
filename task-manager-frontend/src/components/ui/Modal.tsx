import React, { useEffect, useId } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testId?: string;
  size?: 'default' | 'wide';
}

const sizeClasses = {
  default: 'max-w-2xl',
  wide: 'max-w-6xl',
};

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, testId, size = 'default' }) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/26 backdrop-blur-[2px] transition-opacity" onClick={onClose} />
      <div
        className={`relative w-full ${sizeClasses[size]} max-h-[92vh] overflow-y-auto rounded-[12px] border border-[#e2e2e2] bg-white p-4 shadow-[0_18px_46px_rgba(0,0,0,0.12)] animate-modal sm:p-6`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id={titleId} className="min-w-0 break-words text-lg font-semibold leading-6 text-[#1f1f1f]">{title}</h3>
          <button type="button" className="shrink-0 rounded-[8px] px-2 text-2xl leading-6 text-[#8a8a8a] hover:bg-[#f4f4f4] hover:text-[#1f1f1f]" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        {children}
      </div>
    </div>
  );
};
