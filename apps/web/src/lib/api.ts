export const API_BASE_URL = 'http://localhost:8000/api/v1';

/**
 * Retry wrapper: retries on network errors (e.g. backend not yet ready)
 * Does NOT retry on HTTP 4xx/5xx — those are real errors.
 */
async function fetchWithRetry(
  input: RequestInfo,
  init?: RequestInit,
  maxRetries = 15,
  delayMs = 1000
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
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

export async function getProjects(): Promise<{ projects: any[] }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch projects: ${error}`);
  }
  
  return response.json();
}

export async function getProjectGraph(projectId: string): Promise<{ nodes: any[], links: any[] }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/graph`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph fetch failed: ${error}`);
  }
  
  return response.json();
}

export const getProjectFiles = async (projectId: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/files`);
  if (!res.ok) throw new Error("Failed to fetch project files");
  return res.json();
};

export const getFileContent = async (projectId: string, path: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch file content");
  const data = await res.json();
  return data.content;
};

export const getCommitDetails = async (projectId: string, hash: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}`);
  if (!res.ok) throw new Error("Failed to fetch commit details");
  return res.json();
};

export const getCommitFileDiff = async (projectId: string, hash: string, path: string) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}/diff?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch file diff");
  return res.json();
};

export const saveApiKey = async (provider: string, apiKey: string) => {
  const response = await fetchWithRetry(`${API_BASE_URL}/api-key/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ api_key: apiKey }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save API key for ${provider}: ${error}`);
  }
  
  return response.json();
};
