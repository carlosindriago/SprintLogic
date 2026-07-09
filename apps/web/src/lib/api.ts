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
    try {
      // Intentamos extraer el detalle exacto que manda FastAPI en 'detail'
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {
      errorMessage = (await response.text()) || errorMessage;
    }
    throw new ApiError(response.status, errorMessage);
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
export const analyzeProjectGraph = async (projectId: string, model: string) => {
  const data = await api.post<{ analysis: string }>(`/projects/${projectId}/graph/analyze`, { model });
  return data.analysis;
};

// --- Files ---
export const getProjectFiles = (projectId: string) => api.get<FileTreeNode>(`/projects/${projectId}/files`);
export const getFileContent = async (projectId: string, path: string) => {
  const data = await api.get<{ content: string }>(`/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`);
  return data.content;
};
export const saveFileContent = (projectId: string, path: string, content: string) => 
  api.put<{ status: string }>(`/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`, { content });
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
export const getLocalChanges = (projectId: string) => api.get<{ files: any[] }>(`/projects/${projectId}/git/changes`);
export const getFileLocalDiff = (projectId: string, filePath: string) => 
  api.get<any>(`/projects/${projectId}/git/diff?file_path=${encodeURIComponent(filePath)}`);
export const revertFile = (projectId: string, filePath: string) => 
  api.post<{ status: string; action: string }>(`/projects/${projectId}/git/revert`, { file_path: filePath });
export const getGitDashboard = (projectId: string) => api.get<any>(`/projects/${projectId}/git/dashboard`);
export const stageFile = (projectId: string, filePath: string) => api.post(`/projects/${projectId}/git/stage`, { file_path: filePath });
export const unstageFile = (projectId: string, filePath: string) => api.post(`/projects/${projectId}/git/unstage`, { file_path: filePath });
export const commitChanges = (projectId: string, message: string) => api.post(`/projects/${projectId}/git/commit`, { message });

// --- Kanban & Tasks ---
export const getProjectTasks = (projectId: string) => api.get<{ tasks: Task[] }>(`/projects/${projectId}/tasks`);
export const saveProjectTasks = (projectId: string, tasks: Task[]) => api.post<{ status: string }>(`/projects/${projectId}/tasks`, { tasks });
export const getKanbanConfig = (projectId: string) => api.get<any>(`/projects/${projectId}/kanban/config`);
export const saveKanbanConfig = (projectId: string, columns: any[]) => api.post<{ status: string }>(`/projects/${projectId}/kanban/config`, { columns });
export const syncKanbanCommits = (projectId: string) => api.post<any>(`/projects/${projectId}/tasks/sync-commits`);
export const generateWBS = (projectId: string, requirements: string, model = "openai/gpt-4o") => 
  api.post<any>(`/projects/${projectId}/kanban/wbs`, { requirements, model });

// --- Providers & Settings ---
export const fetchProviderModels = (provider: string) => api.get<ModelResult[]>(`/settings/providers/${provider}/models`);
export const verifyAndSaveProviderKey = (provider: string, apiKey: string) => 
  api.post<ModelResult[]>(`/settings/providers/${provider}/keys`, { api_key: apiKey });
export const checkApiKeyStatus = (provider: string) => api.get<{ is_configured: boolean }>(`/settings/api-key/${provider}`);
export const deleteProviderKey = (provider: string) => api.delete<{ status: string }>(`/settings/api-key/${provider}`);
export const getCuratedModels = () => api.get<CuratedProvider[]>('/ai/models');

// --- AI / Analysis ---
export const getProjectInsights = (projectId: string) => api.get<ProjectInsights>(`/projects/${projectId}/insights`);
export const analyzeProject = (projectId: string) => api.post<any>(`/projects/${projectId}/analyze`);
export const fetchFimCompletion = async (prefix: string, suffix: string, language: string) => {
  try {
    return await api.post<any>('/ai/fim-completion', { prefix, suffix, language });
  } catch {
    return { code: '', explanation: '' }; // Silencia el error de FIM como lo hacía el original
  }
};
export const sendChatMessage = (payload: any) => api.post<any>('/chat/', payload);

export interface CodeCoachMarker {
  line: number;
  severity: string;
  message: string;
  explanation: string;
  suggested_code?: string;
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
  fallbackModel?: string
): Promise<CodeCoachOverview> => {
  return await api.post<CodeCoachOverview>(`/ai/health-overview`, {
    file_content: fileContent,
    language,
    model,
    fallback_model: fallbackModel
  });
};

export const fetchContextualMentorship = async (
  fileContent: string,
  language: string,
  cursorLine: number,
  model?: string,
  fallbackModel?: string
): Promise<CodeCoachMarker[]> => {
  return await api.post<CodeCoachMarker[]>(`/ai/contextual-mentorship`, {
    file_content: fileContent,
    language,
    cursor_line: cursorLine,
    model,
    fallback_model: fallbackModel
  });
};

export const fetchTechScan = async (
  fileContent: string,
  language: string,
  model?: string,
  fallbackModel?: string
): Promise<any> => {
  return await api.post<any>(`/ai/tech-scan`, {
    file_content: fileContent,
    language,
    model,
    fallback_model: fallbackModel
  });
};
