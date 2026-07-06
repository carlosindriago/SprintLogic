import { useEffect, type ReactNode } from 'react';

interface ContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  children: ReactNode;
}

export function ContextMenu({ position, onClose, children }: ContextMenuProps) {
  useEffect(() => {
    const handle = () => onClose();
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-zinc-800 border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      {children}
    </div>
  );
}

export function ContextMenuSeparator() {
  return <div className="h-px bg-zinc-700/50 my-0.5" />;
}

interface ContextMenuItemProps {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function ContextMenuItem({ icon, label, onClick, destructive }: ContextMenuItemProps) {
  return (
    <button
      className={
        destructive
          ? 'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors'
          : 'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors'
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}
