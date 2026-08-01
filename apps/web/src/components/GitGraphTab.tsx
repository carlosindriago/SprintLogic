'use client';

import GitStudioTab from './git-studio/GitStudioTab';

export default function GitGraphTab({ projectId }: { projectId: string }) {
  return <GitStudioTab projectId={projectId} />;
}
