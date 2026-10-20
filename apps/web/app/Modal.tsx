'use client';
import React, { useEffect, useRef, type ReactNode } from 'react';
import { X, AlertTriangle, AlertCircle, Sparkles, CheckCircle } from './Icons';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'default' | 'danger' | 'warning' | 'info' | 'success';
  maxWidth?: string;
  closeOnBackdrop?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  variant = 'default',
  maxWidth = '520px',
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const defaultIcon =
    variant === 'danger' ? <AlertTriangle size={22} className="modal-icon-danger" /> :
    variant === 'warning' ? <AlertCircle size={22} className="modal-icon-warning" /> :
    variant === 'success' ? <CheckCircle size={22} className="modal-icon-success" /> :
    variant === 'info' ? <Sparkles size={22} className="modal-icon-info" /> : null;

  return (
    <div
      className="modal-backdrop"
      onClick={e => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className={`modal-card modal-${variant}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
      >
        <div className="modal-header">
          <div className="modal-title-wrapper">
            {icon !== undefined ? icon : defaultIcon}
            {title && <h3 className="modal-title">{title}</h3>}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
