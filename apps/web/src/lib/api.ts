import {
  Project,
  GraphData,
  FileTreeNode,
  CommitDetails,
  Task,
  ProjectRepoInsights,
  ProjectFlowInsights,
  GitStatus
} from '../types';

export interface ModelResult {
  id: string;
  name: string;
}

export interface CuratedProvider {
  provider: string;
  provider_id: string;
  is_configured: boolean;
  models: ModelResult[];
}

export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

// 1. CLASE DE ERROR PERSONALIZADA
// Permite al frontend saber exactamente qué falló (ej. error.status === 404)
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// 2. RETRY INTELIGENTE (Fail-Fast)
// Solo reintenta si el servidor está caído (Network Error) o arroja 5xx.
// NUNCA reintenta errores 4xx (como 400 Bad Request o 429 Rate Limit) para no alargar el sufrimiento.
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      // Fail-Fast: Si el cliente cometió un error (4xx), no tiene sentido reintentar.
      if (response.status >= 400 && response.status < 500) {
        return response; 
      }
      // Si el servidor colapsó (5xx), forzamos el catch para que reintente.
      if (response.status >= 500) {
        throw new Error(`Server Error HTTP ${response.status}`);
      }
      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError ?? new Error('Network request failed after retries');
}

// 3. EL ENVOLTORIO MAESTRO (The Wrapper)
// Centraliza los headers, el parseo de JSON y la intercepción de errores.
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetchWithRetry(url, { ...options, headers });

  if (!response.ok) {
    let errorMessage = `HTTP Error ${response.status}`;
    const responseText = await response.text();
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    throw new ApiError(response.status, `[${url}] ${errorMessage}`);
  }

  // Manejo de respuestas vacías (ej. HTTP 204 No Content)
  if (response.status === 204) return {} as T;

  return response.json();
}

// 4. MÉTODOS HTTP GENÉRICOS
// Una API limpia y tipada para consumir desde los componentes
export const api = {
  get: <T>(endpoint: string, init?: RequestInit) => 
    request<T>(endpoint, { ...init, method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown, init?: RequestInit) => 
    request<T>(endpoint, { ...init, method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body?: unknown, init?: RequestInit) => 
    request<T>(endpoint, { ...init, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string, init?: RequestInit) => 
    request<T>(endpoint, { ...init, method: 'DELETE' }),
};

// ============================================================================
// 5. DOMINIOS FUNCIONALES (Refactorizados al 10%)
// Observa cómo las funciones pasaron de tener 10 líneas a solo 1 o 2.
// ============================================================================

// --- Projects ---
export const scanProject = (path: string) => api.post<{ project_id: string }>('/projects/scan', { path });
export const getProjects = () => api.get<{ projects: Project[] }>('/projects');
export const updateProject = (id: string, data: { name?: string, path?: string }) => api.put<{ status: string }>(`/projects/${id}`, data);
export const deleteProject = (id: string) => api.delete<{ status: string }>(`/projects/${id}`);

// --- Graph ---
export const getProjectGraph = (projectId: string) => api.get<GraphData>(`/projects/${projectId}/graph`);

// --- Files ---
export const getProjectFiles = (projectId: string) => api.get<FileTreeNode>(`/projects/${projectId}/files`);
export const getFileContent = async (projectId: string, path: string) => {
  const data = await api.get<{ content: string; original_hash?: string }>(`/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`);
  return data;
};
export const saveFileContent = (projectId: string, path: string, content: string, base_hash?: string) => 
  api.put<{ status: string; new_hash?: string }>(`/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`, { content, base_hash });
export const createFile = (projectId: string, path: string, content: string) => 
  api.post<{ status: string; path: string }>(`/projects/${projectId}/file/create?path=${encodeURIComponent(path)}`, { content });
export const renameFile = (projectId: string, path: string, newName: string) => 
  api.post<{ status: string }>(`/projects/${projectId}/file/rename`, { path, new_name: newName });
export const duplicateFile = (projectId: string, path: string) => 
  api.post<{ status: string }>(`/projects/${projectId}/file/duplicate`, { path });
export const deleteFile = (projectId: string, path: string) => 
  api.delete<{ status: string }>(`/projects/${projectId}/file/delete?path=${encodeURIComponent(path)}`);

// --- Git ---
export const getCommitDetails = (projectId: string, hash: string) => api.get<CommitDetails>(`/projects/${projectId}/git/commits/${hash}`);
export const getCommitFileDiff = (projectId: string, hash: string, path: string) => 
  api.get<{ original: string; modified: string }>(`/projects/${projectId}/git/commits/${hash}/diff?path=${encodeURIComponent(path)}`);
export const getGitStatus = (projectId: string) => api.get<GitStatus>(`/projects/${projectId}/git/status`);
export const getLocalChanges = (projectId: string) => api.get<{ files: unknown[] }>(`/projects/${projectId}/git/changes`);
export const getFileLocalDiff = (projectId: string, filePath: string) => 
  api.get<FileLocalDiff>(`/projects/${projectId}/git/diff?file_path=${encodeURIComponent(filePath)}`);
export const revertFile = (projectId: string, filePath: string) => 
  api.post<{ status: string; action: string }>(`/projects/${projectId}/git/revert`, { file_path: filePath });
export interface GitDashboardFileStatus {
  file_path: string;
  status: string;
  timestamp?: number;
}

export interface GitDashboardBranch {
  current_branch: string;
  ahead?: number;
  behind?: number;
  diff_with_main?: {
    ahead: number | null;
    behind: number | null;
  };
}

export interface GitDashboardKPIs {
  total_files: number;
  untracked: number;
  ignored: number;
  modified: number;
}

export interface GitDashboardLists {
  staged_list: GitDashboardFileStatus[];
  unstaged_list: GitDashboardFileStatus[];
  untracked_list: GitDashboardFileStatus[];
  modified_list: GitDashboardFileStatus[];
  last_commit_list: GitDashboardFileStatus[];
  penultimate_commit_list: GitDashboardFileStatus[];
}

export interface GitDashboardCommits {
  last_commit_message?: string;
  penultimate_commit_message?: string;
}

export interface GitDashboard {
  branch: GitDashboardBranch;
  kpis: GitDashboardKPIs;
  lists: GitDashboardLists;
  commits?: GitDashboardCommits;
}

export interface FileLocalDiff {
  original_content: string;
  modified_content: string;
}

export const getGitDashboard = (projectId: string) => api.get<GitDashboard>(`/projects/${projectId}/git/dashboard`);
export const stageFile = (projectId: string, filePath: string) => api.post(`/projects/${projectId}/git/stage`, { file_path: filePath });
export const unstageFile = (projectId: string, filePath: string) => api.post(`/projects/${projectId}/git/unstage`, { file_path: filePath });
export const commitChanges = (projectId: string, message: string) => api.post(`/projects/${projectId}/git/commit`, { message });

// --- Kanban & Tasks ---
export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  rule?: 'manual' | 'auto-on-test-fail' | 'auto-on-test-pass';
}

export interface WBSTask {
  title: string;
  priority: 'Low' | 'Medium' | 'High' | undefined;
  tags: string[];
  estimated_mins: number;
}

export interface WBSResponse {
  tasks: WBSTask[];
  explanation?: string;
}

export const getProjectTasks = (projectId: string) => api.get<{ tasks: Task[] }>(`/projects/${projectId}/tasks`);
export const saveProjectTasks = (projectId: string, tasks: Task[]) => api.post<{ status: string }>(`/projects/${projectId}/tasks`, { tasks });
export const getKanbanConfig = (projectId: string) => api.get<{ columns: KanbanColumn[] }>(`/projects/${projectId}/kanban/config`);
export const saveKanbanConfig = (projectId: string, columns: KanbanColumn[]) => api.post<{ status: string }>(`/projects/${projectId}/kanban/config`, { columns });
export const syncKanbanCommits = (projectId: string) => api.post<unknown>(`/projects/${projectId}/tasks/sync-commits`);
export const generateWBS = (projectId: string, requirements: string, model = "openai/gpt-4o") => 
  api.post<WBSResponse>(`/projects/${projectId}/kanban/wbs`, { requirements, model });

// --- Providers & Settings ---
export const fetchProviderModels = (provider: string) => api.get<ModelResult[]>(`/settings/providers/${provider}/models`);
export const verifyAndSaveProviderKey = (provider: string, apiKey: string) => 
  api.post<ModelResult[]>(`/settings/providers/${provider}/keys`, { api_key: apiKey });
export const checkApiKeyStatus = (provider: string) => api.get<{ is_configured: boolean }>(`/settings/api-key/${provider}`);
export const deleteProviderKey = (provider: string) => api.delete<{ status: string }>(`/settings/api-key/${provider}`);
export const getCuratedModels = () => api.get<CuratedProvider[]>('/ai/models');

// --- AI / Analysis ---
export const getGlobalFlowInsights = () => api.get<ProjectFlowInsights>('/insights/flow');
export const getProjectFlowInsights = (projectId: string) => api.get<ProjectFlowInsights>(`/projects/${projectId}/insights/flow`);
export const getProjectRepoInsights = (projectId: string) => api.get<ProjectRepoInsights>(`/projects/${projectId}/insights/repo`);
export const rescanProject = (projectId: string) => api.post<{ status: string; message: string }>(`/projects/${projectId}/rescan`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const analyzeProject = (projectId: string) => api.post<any>(`/projects/${projectId}/analyze`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getProjectReports = (projectId: string) => api.get<{ reports: any[] }>(`/projects/${projectId}/reports`);
export const getProjectReport = (projectId: string, reportId: string) => api.get<{ content: string; id: string; created_at: string; ai_model_version: string }>(`/projects/${projectId}/reports/${reportId}`);
export const fetchFimCompletion = async (prefix: string, suffix: string, language: string) => {
  try {
    return await api.post<unknown>('/ai/fim-completion', { prefix, suffix, language });
  } catch {
    return { code: '', explanation: '' }; // Silencia el error de FIM como lo hacía el original
  }
};
export const sendChatMessage = (payload: unknown) => api.post<unknown>('/chat/', payload);

export interface CodeCoachMarker {
  line: number;
  severity: string;
  message: string;
  title?: string;
  explanation: string;
  suggested_code?: string;
  snippet_before?: string;
  snippet_after?: string;
  is_degraded?: boolean;
}

export interface CodeCoachOverview {
  structure: string;
  critical_security: string;
  clean_code_score: number;
  technical_debt_and_tips?: string[];
  is_degraded?: boolean;
  error_detail?: string;
}

// --- Code Coach (Los Nuevos Endpoints) ---
export const fetchHealthOverview = async (
  fileContent: string,
  language: string,
  model?: string,
  fallbackModel?: string,
  signal?: AbortSignal
): Promise<CodeCoachOverview> => {
  return await api.post<CodeCoachOverview>(`/ai/health-overview`, {
    file_content: fileContent,
    language,
    model,
    fallback_model: fallbackModel
  }, { signal });
};

export const fetchContextualMentorship = async (
  fileContent: string,
  language: string,
  cursorLine: number,
  nativeErrors?: string[],
  model?: string,
  fallbackModel?: string,
  signal?: AbortSignal
): Promise<CodeCoachMarker[]> => {
  return await api.post<CodeCoachMarker[]>(`/ai/contextual-mentorship`, {
    file_content: fileContent,
    language,
    cursor_line: cursorLine,
    native_errors: nativeErrors,
    model,
    fallback_model: fallbackModel
  }, { signal });
};

export const fetchTechScan = async (
  fileContent: string,
  language: string,
  model?: string,
  fallbackModel?: string
): Promise<unknown> => {
  return await api.post<unknown>(`/ai/tech-scan`, {
    file_content: fileContent,
    language,
    model,
    fallback_model: fallbackModel
  });
};

export interface UndocumentedExport {
  name: string;
  signature: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
}

export const auditCode = async (code: string, language: string): Promise<UndocumentedExport[]> => {
  return await api.post<UndocumentedExport[]>('/editor/audit', { code, language });
};

export const generateDocs = async (signature: string): Promise<{ jsdoc: string }> => {
  return await api.post<{ jsdoc: string }>('/editor/generate_docs', { signature });
};
