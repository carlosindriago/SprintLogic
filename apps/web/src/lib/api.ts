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
