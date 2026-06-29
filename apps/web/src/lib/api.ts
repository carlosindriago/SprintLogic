export const API_BASE_URL = 'http://localhost:8000/api/v1';

export async function scanProject(path: string): Promise<{ project_id: number }> {
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

export async function getProjectGraph(projectId: number): Promise<{ nodes: any[], links: any[] }> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/graph`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph fetch failed: ${error}`);
  }
  
  return response.json();
}

export const getFileContent = async (path: string) => {
  const res = await fetch(`${API_BASE_URL}/projects/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch file content");
  const data = await res.json();
  return data.content;
};
