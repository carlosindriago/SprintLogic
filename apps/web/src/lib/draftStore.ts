/**
 * Hot Exit — Shadow Draft Store
 *
 * Persists per-file drafts keyed as `draft_{projectId}_{filePath}` in localStorage.
 * Enables recovery after accidental tab/app closure.
 */

const PREFIX = 'draft_';

function buildKey(projectId: string, filePath: string): string {
  return `${PREFIX}${projectId}_${filePath}`;
}

export const draftStore = {
  save(projectId: string, filePath: string, content: string): void {
    try {
      localStorage.setItem(buildKey(projectId, filePath), content);
    } catch {
      // localStorage may be full or unavailable
    }
  },

  load(projectId: string, filePath: string): string | null {
    try {
      return localStorage.getItem(buildKey(projectId, filePath));
    } catch {
      return null;
    }
  },

  clear(projectId: string, filePath: string): void {
    try {
      localStorage.removeItem(buildKey(projectId, filePath));
    } catch {}
  },

  hasDraft(projectId: string, filePath: string): boolean {
    try {
      return localStorage.getItem(buildKey(projectId, filePath)) !== null;
    } catch {
      return false;
    }
  },
};
