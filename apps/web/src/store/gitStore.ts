import { create } from 'zustand';
import { getGitDashboard, getGitStatus, fetchWithRetry, API_BASE_URL } from '../lib/api';
import { Commit } from '../types';

interface GitState {
  currentBranch: string;
  ahead: number;
  behind: number;
  modified: number;
  untracked: number;
  commits: Commit[];
  stagedFiles: string[];
  modifiedFiles: string[];
  untrackedFiles: string[];
  tracked: number;
  ignored: number;
  isLoading: boolean;
  error: string | null;
  selectedFile: string | null;
  lastDashboardFetch: number | null;
  setSelectedFile: (file: string | null) => void;
  fetchStatus: (projectId: string) => Promise<void>;
  fetchDashboard: (projectId: string) => Promise<void>;
  fetchCommits: (projectId: string) => Promise<void>;
}

export const useGitStore = create<GitState>()((set, get) => ({
  currentBranch: 'unknown',
  ahead: 0,
  behind: 0,
  modified: 0,
  untracked: 0,
  commits: [],
  stagedFiles: [],
  modifiedFiles: [],
  untrackedFiles: [],
  tracked: 0,
  ignored: 0,
  isLoading: false,
  error: null,
  selectedFile: null,
  lastDashboardFetch: null,
  setSelectedFile: (file: string | null) => set({ selectedFile: file }),

  fetchStatus: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getGitStatus(projectId);
      set({
        currentBranch: data.branch,
        modified: data.modified || 0,
        untracked: data.untracked || 0,
        isLoading: false,
      });
    } catch (error: unknown) {
      set({ error: (error as Error).message || 'Error fetching Git status', isLoading: false });
    }
  },

  fetchDashboard: async (projectId: string) => {
    const { lastDashboardFetch } = get();
    if (lastDashboardFetch !== null && Date.now() - lastDashboardFetch < 30_000) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const data = await getGitDashboard(projectId);
      set({
        currentBranch: data.branch?.current_branch || 'unknown',
        ahead: data.branch?.diff_with_main?.ahead || 0,
        behind: data.branch?.diff_with_main?.behind || 0,
        modified: data.kpis?.modified || 0,
        untracked: data.kpis?.untracked || 0,
        stagedFiles: (data.lists?.staged_list || []).map(f => f.file_path),
        modifiedFiles: (data.lists?.modified_list || []).map(f => f.file_path),
        untrackedFiles: (data.lists?.untracked_list || []).map(f => f.file_path),
        tracked: data.kpis?.tracked || 0,
        ignored: data.kpis?.ignored || 0,
        isLoading: false,
        lastDashboardFetch: Date.now(),
      });
    } catch (error: unknown) {
      set({ error: (error as Error).message || 'Error fetching Git dashboard', isLoading: false });
    }
  },

  fetchCommits: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/log`, undefined, 20, 500);
      if (res.ok) {
        const data = await res.json();
        set({
          commits: data.commits ?? [],
          currentBranch: data.active_branch ?? 'unknown',
          isLoading: false,
        });
      } else {
        set({ error: `HTTP ${res.status}: Failed to fetch commits`, isLoading: false });
      }
    } catch (error: unknown) {
      set({ error: (error as Error).message || 'Error fetching commits', isLoading: false });
    }
  }
}));
