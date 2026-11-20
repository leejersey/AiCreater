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
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = () => {
      const root = dialogRef.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !dialogRef.current?.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !dialogRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
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
