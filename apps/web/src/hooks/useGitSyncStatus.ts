import { useState, useEffect, useCallback } from 'react';
import { getSyncStatus } from '@/lib/git-actions';

export function useGitSyncStatus(projectId: string) {
  const [status, setStatus] = useState<{
    branch: string;
    ahead: number;
    behind: number;
    is_merge_in_progress: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!projectId) return;
    const result = await getSyncStatus(projectId);
    if (result.ok && 'data' in result && result.data) {
      setStatus({
        branch: result.data.branch || 'unknown',
        ahead: result.data.ahead || 0,
        behind: result.data.behind || 0,
        is_merge_in_progress: result.data.is_merge_in_progress || false,
      });
    }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    refresh: fetchStatus,
  };
}
