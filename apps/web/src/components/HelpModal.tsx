import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 id="help-modal-title" className="text-lg font-semibold text-zinc-100">Cheat Sheet & Ayuda (SprintLogic IDE)</h2>
          <button 
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-zinc-800 focus-visible:ring-2 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Navegación</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Enfocar Editor</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Ctrl + 1</kbd>
              </div>
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Enfocar Explorador</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Ctrl + Shift + E</kbd>
              </div>
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Pestaña Siguiente</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Ctrl + PageDown</kbd>
              </div>
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Pestaña Anterior</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Ctrl + PageUp</kbd>
              </div>
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Búsqueda Rápida (OmniSearch)</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Shift + Shift</kbd>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Inteligencia Artificial</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Forzar Análisis del Sensei</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Ctrl + Shift + S</kbd>
              </div>
              <div className="flex items-center justify-between bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                <span className="text-sm text-zinc-300">Mostrar esta Ayuda</span>
                <kbd className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono shadow-sm">Ctrl + /</kbd>
              </div>
            </div>
          </section>

          <section className="bg-blue-900/10 border border-blue-900/30 rounded p-4">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Uso del Code Coach</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              El asistente inteligente integrado (Code Coach) evalúa tu código en busca de mejoras y errores arquitectónicos. 
              Para maximizar tu enfoque y evitar distracciones, <strong className="text-zinc-200">el Coach despierta automáticamente tras 3.5 segundos de dejar de escribir</strong> o al seleccionar texto.
              No desperdiciará tokens mientras tecleas activamente.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
