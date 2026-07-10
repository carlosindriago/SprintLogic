"use client";
import React, { useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { toast } from 'sonner';
import { useBackgroundJobsStore } from '../store/backgroundJobsStore';
import { Loader2, Minimize2, Maximize2, XCircle } from 'lucide-react';

interface ScanProgressBarProps {
  projectId: string;
  totalFiles?: number;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({ 
  projectId, 
  totalFiles = 1000 
}) => {
  const [progressText, setProgressText] = useState("Iniciando escaneo...");
  const [currentPercentage, setCurrentPercentage] = useState(0);
  const lastPercentageRef = useRef<number>(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const { activeScans, setScanStatus, requestAbort, toggleMinimize, clearScan } = useBackgroundJobsStore();
  const scanJob = activeScans[projectId];

  // Referencia local para matar el fetch internamente
  const localAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Si no estamos 'scanning', no arrancamos.
    if (scanJob?.status !== 'scanning') return;

    localAbortControllerRef.current = new AbortController();

    const timerId = setTimeout(() => {
      startScanStream();
    }, 50);

    const startScanStream = async () => {
      try {
        await fetchEventSource(`http://localhost:8000/api/v1/projects/${projectId}/scan/stream`, {
          method: 'GET',
          signal: localAbortControllerRef.current!.signal,
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async onmessage(event: any) {
            try {
              const data = JSON.parse(event.data);
              
              if (data.type === 'completed') {
                localAbortControllerRef.current?.abort();
                setProgressText("¡Escaneo completado!");
                if (progressBarRef.current) {
                  progressBarRef.current.style.width = `100%`;
                }
                setScanStatus(projectId, 'completed');
                toast.success("Análisis finalizado");
                
                // Auto-cleanup after 3 seconds
                setTimeout(() => clearScan(projectId), 3000);
                return;
              }

              if (data.type === 'progress') {
                const parsed = data.parsed;
                const percentage = Math.min(100, (parsed / totalFiles) * 100);
                
                if (progressBarRef.current) {
                  progressBarRef.current.style.width = `${percentage}%`;
                }

                const currentIntPercentage = Math.floor(percentage);
                if (currentIntPercentage > lastPercentageRef.current) {
                  lastPercentageRef.current = currentIntPercentage;
                  setCurrentPercentage(currentIntPercentage);
                  setProgressText(`Analizando... ${currentIntPercentage}% (${parsed} archivos)`);
                }
              }
            } catch (err) {
              console.error("Error parseando evento SSE:", err);
            }
          },
          
          onclose() {
            throw new Error("Stream cerrado por el servidor");
          },
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onerror(err: any) {
            console.error("Error en SSE:", err);
            throw err;
          }
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.message !== "Stream cerrado por el servidor" && err.name !== 'AbortError') {
          toast.error("Error de conexión durante el escaneo");
          setScanStatus(projectId, 'failed');
        }
      }
    };

    return () => {
      clearTimeout(timerId);
      localAbortControllerRef.current?.abort();
    };
  }, [projectId, scanJob?.status, setScanStatus, clearScan, totalFiles]); // dependemos de projectID y referencias estables

  // FRANCOTIRADOR DECLARATIVO: Escucha intenciones de aborto externas
  useEffect(() => {
    if (scanJob?.status === 'abort_requested') {
      localAbortControllerRef.current?.abort();
      setScanStatus(projectId, 'aborted');
      toast.info("Escaneo abortado por el usuario");
      // Ocultamos la UI tras 2 segundos
      setTimeout(() => clearScan(projectId), 2000);
    }
  }, [scanJob?.status, projectId, setScanStatus, clearScan]);

  if (!scanJob) return null;

  if (scanJob.isMinimized) {
    return (
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full shadow-lg pointer-events-auto">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        <span className="text-xs font-mono text-slate-300 w-16 truncate text-right">
          {currentPercentage}%
        </span>
        <button onClick={() => toggleMinimize(projectId)} className="ml-2 hover:bg-slate-800 p-1 rounded-full text-slate-400 hover:text-white transition-colors">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => requestAbort(projectId)} className="hover:bg-slate-800 p-1 rounded-full text-red-400 hover:text-red-300 transition-colors">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-2xl pointer-events-auto flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-mono text-slate-300 truncate pr-2">
          {progressText}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => toggleMinimize(projectId)} className="hover:bg-slate-800 p-1.5 rounded text-slate-400 hover:text-white transition-colors" title="Minimizar">
            <Minimize2 className="w-4 h-4" />
          </button>
          <button onClick={() => requestAbort(projectId)} className="hover:bg-slate-800 p-1.5 rounded text-red-400 hover:text-red-300 transition-colors" title="Cancelar escaneo">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div 
          ref={progressBarRef}
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-75 ease-linear"
          style={{ width: '0%' }}
        />
      </div>
    </div>
  );
};
