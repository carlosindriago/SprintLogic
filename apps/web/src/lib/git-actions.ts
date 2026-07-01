import { API_BASE_URL, fetchWithRetry } from '@/lib/api';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    let message = 'Error desconocido';
    let requires_force = false;
    try {
      const errData = await response.json();
      if (errData.detail) {
        if (typeof errData.detail === 'string') {
          message = errData.detail;
        } else if (errData.detail.message) {
          message = errData.detail.message;
          requires_force = errData.detail.requires_force || false;
        }
      }
    } catch {
      message = await response.text();
    }
    return { ok: false, error: message, requires_force };
  }
  const data = await response.json();
  return { ok: true, data };
}

export async function getBranches(projectId: string) {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/branches`);
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getSyncStatus(projectId: string) {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/sync-status`);
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getRemoteUrl(projectId: string) {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/remote-url`);
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addRemoteUrl(projectId: string, url: string, name: string = 'origin') {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/remotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url }),
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function generateCommitMessage(projectId: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/generate-commit-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createBranch(projectId: string, name: string, startPoint?: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, start_point: startPoint }),
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBranch(projectId: string, name: string, force: boolean = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/branches/${encodeURIComponent(name)}?force=${force}`, {
      method: 'DELETE',
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkoutHead(projectId: string, target: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/head`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resetCommit(projectId: string, hash: string, mode: 'soft' | 'mixed' | 'hard') {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': generateIdempotencyKey(),
      },
      body: JSON.stringify({ mode }),
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revertCommit(projectId: string, hash: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}/revert`, {
      method: 'POST',
      headers: { 'Idempotency-Key': generateIdempotencyKey() },
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cherryPick(projectId: string, hash: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/commits/${hash}/cherry-pick`, {
      method: 'POST',
      headers: { 'Idempotency-Key': generateIdempotencyKey() },
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function mergeInto(projectId: string, sourceBranch: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': generateIdempotencyKey(),
      },
      body: JSON.stringify({ source_branch: sourceBranch }),
    });
    return await handleResponse(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
