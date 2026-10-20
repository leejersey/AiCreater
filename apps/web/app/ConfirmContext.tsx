'use client';
import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { Modal } from './Modal';

export type ConfirmOptions = {
  title: string;
  message: string | ReactNode;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'warning' | 'info';
};

type ConfirmContextType = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextType>(async () => false);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
  }>({
    open: false,
    options: { title: '', message: '' },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
      const options: ConfirmOptions = typeof opts === 'string'
        ? { title: '请确认操作', message: opts }
        : opts;
      setState({ open: true, options });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    setState(prev => ({ ...prev, open: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <Modal
          open={state.open}
          onClose={() => handleClose(false)}
          title={state.options.title}
          variant={state.options.variant || 'default'}
          footer={
            <>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => handleClose(false)}
              >
                {state.options.cancelText || '取消'}
              </button>
              <button
                type="button"
                className={`btn-modal-confirm ${state.options.variant === 'danger' ? 'danger' : 'primary'}`}
                autoFocus
                onClick={() => handleClose(true)}
              >
                {state.options.confirmText || '确定'}
              </button>
            </>
          }
        >
          <div className="confirm-body">
            <div className="confirm-message">{state.options.message}</div>
            {state.options.detail && (
              <pre className="confirm-detail">{state.options.detail}</pre>
            )}
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
