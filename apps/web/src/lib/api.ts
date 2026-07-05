import {
  Project,
  GraphData,
  FileTreeNode,
  CommitDetails,
  Task,
  ProjectInsights,
  GitStatus
} from '../types';

export interface ModelResult {
  id: string;
  name: string;
}

export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * Retry wrapper with exponential backoff.
 * Retries on network errors (e.g. backend not yet ready, connection refused).
 * Does NOT retry on HTTP 4xx/5xx — those are real errors from a live backend.
 *
 * Backoff sequence: 500ms → 1s → 2s → 4s → 8s (max 5 attempts, ~15.5s total).
 */
export async function fetchWithRetry(
  input: RequestInfo,
  init?: RequestInit,
  maxRetries = 5,
  baseDelayMs = 500
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError ?? new Error('Request failed after retries');
}

export async function scanProject(path: string): Promise<{ project_id: string }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Scan failed: ${error}`);
  }
  
  return response.json();
}

export async function getProjects(): Promise<{ projects: Project[] }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch projects: ${error}`);
  }
  
  return response.json();
}

export async function updateProject(id: string, data: { name?: string, path?: string }): Promise<{ status: string }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Update failed: ${error}`);
  }
  
  return response.json();
}

export async function deleteProject(id: string): Promise<{ status: string }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Delete failed: ${error}`);
  }
  
  return response.json();
}

export async function getProjectGraph(projectId: string): Promise<GraphData> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/graph`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph fetch failed: ${error}`);
  }
  
  return response.json();
}

export async function analyzeProjectGraph(projectId: string, model: string): Promise<string> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/graph/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph analysis failed: ${error}`);
  }

  const data = await response.json();
  return data.analysis;
}

export const getProjectFiles = async (projectId: string): Promise<FileTreeNode> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/files`);
  if (!res.ok) throw new Error("Failed to fetch project files");
  return res.json();
};

export const getFileContent = async (projectId: string, path: string): Promise<string> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch file content");
  const data = await res.json();
  return data.content;
};

export const saveFileContent = async (projectId: string, path: string, content: string): Promise<{ status: string }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to save file content");
  return res.json();
};

export const createFile = async (projectId: string, path: string, content: string): Promise<{ status: string; path: string }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/create?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to create file");
  }
  return res.json();
};

export const renameFile = async (projectId: string, path: string, newName: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, new_name: newName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to rename file');
  }
  return res.json();
};

export const duplicateFile = async (projectId: string, path: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to duplicate file');
  }
  return res.json();
};

export const deleteFile = async (projectId: string, path: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to delete file');
  }
  return res.json();
};

export const getCommitDetails = async (projectId: string, hash: string): Promise<CommitDetails> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}`);
  if (!res.ok) throw new Error("Failed to fetch commit details");
  return res.json();
};

export const getCommitFileDiff = async (
  projectId: string,
  hash: string,
  path: string
): Promise<{ original: string; modified: string }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}/diff?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch file diff");
  return res.json();
};

export const fetchProviderModels = async (provider: string): Promise<ModelResult[]> => {
  const response = await fetchWithRetry(`${API_BASE_URL}/settings/providers/${provider}/models`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Failed to fetch models for ${provider}`);
  }
  return response.json();
};

export const verifyAndSaveProviderKey = async (provider: string, apiKey: string): Promise<ModelResult[]> => {
  const response = await fetchWithRetry(`${API_BASE_URL}/settings/providers/${provider}/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ api_key: apiKey }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Failed to verify API key for ${provider}`);
  }
  
  return response.json();
};

export const checkApiKeyStatus = async (provider: string): Promise<{ is_configured: boolean }> => {
  const response = await fetchWithRetry(`${API_BASE_URL}/settings/api-key/${provider}`);
  if (!response.ok) throw new Error(`Failed to check API key status for ${provider}`);
  return response.json();
};

export const deleteProviderKey = async (provider: string): Promise<{ status: string }> => {
  const response = await fetchWithRetry(`${API_BASE_URL}/settings/api-key/${provider}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete API key for ${provider}`);
  return response.json();
};

export const getProjectTasks = async (projectId: string): Promise<{ tasks: Task[] }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/tasks`);
  if (!res.ok) throw new Error("Failed to fetch project tasks");
  return res.json();
};

export const saveProjectTasks = async (projectId: string, tasks: Task[]): Promise<{ status: string }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  if (!res.ok) throw new Error("Failed to save project tasks");
  return res.json();
};

export const getProjectInsights = async (projectId: string): Promise<ProjectInsights> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/insights`);
  if (!res.ok) throw new Error("Failed to fetch project insights");
  return res.json();
};

export const getGitStatus = async (projectId: string): Promise<GitStatus> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/status`);
  if (!res.ok) throw new Error("Failed to fetch git status");
  return res.json();
};

export interface ChangedFile {
  status_code: string;
  file_path: string;
  is_untracked: boolean;
  is_modified: boolean;
  added: number;
  deleted: number;
}

export interface LocalChangesResponse {
  files: ChangedFile[];
}

export const getLocalChanges = async (projectId: string): Promise<LocalChangesResponse> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/changes`);
  if (!res.ok) throw new Error("Failed to fetch local changes");
  return res.json();
};

export interface FileLocalDiff {
  diff?: string;
  original_content: string;
  modified_content: string;
  status: string;
}

export const getFileLocalDiff = async (
  projectId: string,
  filePath: string,
): Promise<FileLocalDiff> => {
  const res = await fetchWithRetry(
    `${API_BASE_URL}/projects/${projectId}/git/diff?file_path=${encodeURIComponent(filePath)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch file diff");
  return res.json();
};

export const revertFile = async (
  projectId: string,
  filePath: string,
): Promise<{ status: string; action: string }> => {
  const res = await fetchWithRetry(
    `${API_BASE_URL}/projects/${projectId}/git/revert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to revert file");
  }
  return res.json();
};

export interface GitDashboardKPIs {
  total_files: number;
  tracked: number;
  untracked: number;
  ignored: number;
  modified: number;
  last_commit_files: number;
}

export interface GitDashboardFileStatus {
  status: string;
  file_path: string;
}

export interface GitDashboardBranch {
  current_branch: string;
  diff_with_main: { ahead: number | null; behind: number | null };
}

export interface GitDashboard {
  kpis: GitDashboardKPIs;
  lists: {
    untracked_list: string[];
    staged_list: GitDashboardFileStatus[];
    last_commit_list: GitDashboardFileStatus[];
    penultimate_commit_list: GitDashboardFileStatus[];
  };
  branch: GitDashboardBranch;
}

export const getGitDashboard = async (projectId: string): Promise<GitDashboard> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/dashboard`);
  if (!res.ok) throw new Error("Failed to fetch git dashboard");
  return res.json();
};

export const stageFile = async (projectId: string, filePath: string) => {
  const res = await fetchWithRetry(
    `${API_BASE_URL}/projects/${projectId}/git/stage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath }),
    },
  );
  if (!res.ok) throw new Error("Failed to stage file");
};

export const unstageFile = async (projectId: string, filePath: string) => {
  const res = await fetchWithRetry(
    `${API_BASE_URL}/projects/${projectId}/git/unstage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath }),
    },
  );
  if (!res.ok) throw new Error("Failed to unstage file");
};

export const commitChanges = async (projectId: string, message: string) => {
  const res = await fetchWithRetry(
    `${API_BASE_URL}/projects/${projectId}/git/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) throw new Error("Failed to commit changes");
};

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  rule?: 'manual' | 'pomodoro' | 'auto-on-test-fail' | 'auto-on-test-pass';
}

export interface KanbanConfig {
  columns: KanbanColumn[];
}

export const getKanbanConfig = async (projectId: string): Promise<KanbanConfig> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/kanban/config`);
  if (!res.ok) throw new Error("Failed to fetch kanban config");
  return res.json();
};

export const saveKanbanConfig = async (projectId: string, columns: KanbanColumn[]): Promise<{ status: string }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/kanban/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columns }),
  });
  if (!res.ok) throw new Error("Failed to save kanban config");
  return res.json();
};

export const syncKanbanCommits = async (projectId: string): Promise<{ status: string; tests_passing: boolean; updated_tasks: string[] }> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/tasks/sync-commits`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error("Failed to sync project commits with tasks");
  return res.json();
};

export interface WBSTask {
  title: string;
  estimated_mins: number;
  priority: 'Low' | 'Medium' | 'High';
  type: string;
  tags: string[];
}

export interface WBSResponse {
  tasks: WBSTask[];
  explanation: string;
}

export const generateWBS = async (projectId: string, requirements: string, model = "openai/gpt-4o"): Promise<WBSResponse> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/kanban/wbs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requirements, model })
  });
  if (!res.ok) throw new Error("Failed to generate WBS from IA");
  return res.json();
};

// --- Chat / AI Agent ------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  isError?: boolean;
}

export interface ChatRequestPayload {
  messages: ChatMessage[];
  /** Fully-qualified model identifier, format: `provider/model_id`. */
  model: string;
  project_id: string | null;
}

export interface ChatResponsePayload {
  response: string;
}

export const sendChatMessage = async (
  payload: ChatRequestPayload,
): Promise<ChatResponsePayload> => {
  const response = await fetchWithRetry(`${API_BASE_URL}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || "Failed to fetch chat response");
  }
  return response.json() as Promise<ChatResponsePayload>;
};

export interface AnalyzeResult {
  tech_stack: Record<string, number>;
  total_files: number;
  global_markers: Record<string, unknown>;
}

export const analyzeProject = async (projectId: string): Promise<AnalyzeResult> => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/analyze`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error("Failed to analyze project");
  return res.json();
};
