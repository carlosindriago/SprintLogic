export const API_BASE_URL = 'http://localhost:8000/api/v1';

export async function scanProject(path: string): Promise<{ project_id: string }> {
  const response = await fetch(`${API_BASE_URL}/projects/scan`, {
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
  const response = await fetch(`${API_BASE_URL}/projects`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch projects: ${error}`);
  }
  
  return response.json();
}

export async function getProjectGraph(projectId: string): Promise<{ nodes: any[], links: any[] }> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/graph`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph fetch failed: ${error}`);
  }
  
  return response.json();
}

export const getProjectFiles = async (projectId: string) => {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/files`);
  if (!res.ok) throw new Error("Failed to fetch project files");
  return res.json();
};

export const getFileContent = async (projectId: string, path: string) => {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/file/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch file content");
  const data = await res.json();
  return data.content;
};

export const saveApiKey = async (provider: string, apiKey: string) => {
  const response = await fetch(`${API_BASE_URL}/api-key/${provider}`, {
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
