'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, variant: ToastVariant) => void;
  removeToast: (id: string) => void;
}

import { createContext, useContext } from 'react';

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant) => {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, message, variant };
    // Auto-dismiss is owned entirely by ToastItem's useEffect, which cleans up
    // its timer on unmount / id change. Scheduling one here as well would leave
    // an uncancellable timer running after an early manual dismiss.
    setToasts((prev) => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return {
    success: (message: string) => context.addToast(message, 'success'),
    error: (message: string) => context.addToast(message, 'error'),
    info: (message: string) => context.addToast(message, 'info'),
  };
}

function ToastContainer() {
  const context = useContext(ToastContext);
  if (!context) return null;

  const { toasts, removeToast } = context;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 space-y-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor = {
    success: 'bg-emerald-500/90',
    error: 'bg-red-500/90',
    info: 'bg-blue-500/90',
  }[toast.variant];

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  }[toast.variant];

  return (
    <div
      className={`${bgColor} flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200`}
      role="status"
      aria-label={toast.variant}
    >
      <span className="font-semibold">{icon}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-white/70 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
