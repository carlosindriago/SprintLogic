"use client";

import { useEffect } from "react";

export default function ErrorSilencer() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (!reason) return;

      const name = reason.name ?? '';
      const message = reason.message ?? '';

      if (
        name === 'Canceled' ||
        message === 'Canceled' ||
        message?.includes('disposed') ||
        message?.includes('TextModel') ||
        name === 'AbortError'
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return null;
}
