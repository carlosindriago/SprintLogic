import { FilePlus, FileMinus, FileText } from 'lucide-react';
import React from 'react';

const BRANCH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function getBranchColor(branchName: string): string {
  if (branchName === 'main' || branchName === 'master') return '#3b82f6';
  let hash = 0;
  for (let i = 0; i < branchName.length; i++) {
    hash = branchName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BRANCH_COLORS.length;
  return BRANCH_COLORS[index];
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + '…' : s;
}

export const getFileIcon = (status: string) => {
  if (status.startsWith('A')) return React.createElement(FilePlus, { className: "w-4 h-4 text-green-500" });
  if (status.startsWith('D')) return React.createElement(FileMinus, { className: "w-4 h-4 text-red-500" });
  return React.createElement(FileText, { className: "w-4 h-4 text-yellow-500" });
};
