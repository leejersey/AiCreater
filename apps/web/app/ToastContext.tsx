'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Sparkles, X } from './Icons';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
};

type ToastFn = (message: string, options?: ToastOptions) => number;

const ToastContext = createContext<ToastFn>(() => 0);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, options) => {
    const id = seq.current++;
    const variant = options?.variant ?? 'info';
    const duration = options?.duration ?? (variant === 'error' ? 5000 : 3200);
    setItems(prev => [...prev.slice(-3), { id, message, variant, action: options?.action }]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  const iconOf = (variant: ToastVariant) => {
    if (variant === 'success') return <CheckCircle size={15} className="toast-icon" />;
    if (variant === 'warning') return <AlertTriangle size={15} className="toast-icon" />;
    if (variant === 'error') return <AlertCircle size={15} className="toast-icon" />;
    return <Sparkles size={15} className="toast-icon" />;
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {items.length > 0 && (
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {items.map(item => (
            <div key={item.id} className={`toast-item toast-${item.variant}`} role={item.variant === 'error' ? 'alert' : 'status'}>
              {iconOf(item.variant)}
              <span className="toast-message">{item.message}</span>
              {item.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              )}
              <button
                type="button"
                className="toast-close"
                aria-label="关闭提示"
                onClick={() => dismiss(item.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
