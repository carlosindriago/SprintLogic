"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, File, Hash } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

interface SearchResult {
  type: string;
  name: string;
  path: string;
  line: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}

export default function SearchEverywhereModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/search?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setSelectedIndex(0);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [results, selectedIndex, onSelect, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-[560px] bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Everywhere — archivos, símbolos..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            autoFocus
          />
          {loading && (
            <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin shrink-0" />
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
          {query.trim() && results.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">
              Sin resultados para &quot;{query}&quot;
            </div>
          )}

          {results.map((r, i) => (
            <div
              key={`${r.path}-${i}`}
              className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'text-zinc-400 hover:bg-zinc-800/50'
              }`}
              onClick={() => {
                onSelect(r);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {r.type === 'file' ? (
                <File className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Hash className="w-3.5 h-3.5 shrink-0" />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs truncate">{r.name}</span>
                <span className="text-[10px] text-zinc-500 truncate">{r.path}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
