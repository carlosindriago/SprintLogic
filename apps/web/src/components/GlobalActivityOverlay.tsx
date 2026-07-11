"use client";
import React from 'react';
import { useBackgroundJobsStore } from '../store/backgroundJobsStore';
import { ScanProgressBar } from './ScanProgressBar';

export const GlobalActivityOverlay: React.FC = () => {
  const activeScans = useBackgroundJobsStore(state => state.activeScans);

  const scanIds = Object.keys(activeScans);
  
  if (scanIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {scanIds.map(projectId => (
        <ScanProgressBar key={projectId} projectId={projectId} />
      ))}
    </div>
  );
};
