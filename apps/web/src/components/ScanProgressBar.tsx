import React, { useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { toast } from 'sonner';

interface ScanProgressBarProps {
  projectId: string;
  totalFiles?: number;
  onComplete?: () => void;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({ 
  projectId, 
  totalFiles = 1000, 
  onComplete 
}) => {
  // Capa Semántica: Estado de React para el texto y UX.
  // Se actualiza de forma controlada (ej. solo cuando el porcentaje cambia un número entero).
  const [progressText, setProgressText] = useState("Iniciando escaneo...");
  const lastPercentageRef = useRef<number>(0);

  // Capa Visual: Bypass a React para el ancho de la barra
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortController = new AbortController();

    // MITIGACIÓN REACT 18 STRICT MODE:
    // Añadimos un pequeño "debounce" temporal (50ms). 
    // Si React desmonta y vuelve a montar inmediatamente, el clearTimeout
    // evitará que el primer 'fetch' se dispare siquiera, protegiendo al backend.
    const timerId = setTimeout(() => {
      startScanStream();
    }, 50);

    const startScanStream = async () => {
      try {
        await fetchEventSource(`http://localhost:8000/api/v1/projects/${projectId}/scan/stream`, {
          method: 'GET',
          signal: abortController.signal,
          
          async onmessage(event) {
            try {
              const data = JSON.parse(event.data);
              
              if (data.type === 'completed') {
                abortController.abort();
                setProgressText("¡Escaneo completado!");
                if (progressBarRef.current) {
                  progressBarRef.current.style.width = `100%`;
                }
                toast.success("Análisis de dependencias finalizado");
                if (onComplete) onComplete();
                return;
              }

              if (data.type === 'progress') {
                const parsed = data.parsed;
                const percentage = Math.min(100, (parsed / totalFiles) * 100);
                
                // 1. ACTUALIZACIÓN VISUAL (BYPASS REACT)
                if (progressBarRef.current) {
                  progressBarRef.current.style.width = `${percentage}%`;
                }

                // 2. ACTUALIZACIÓN SEMÁNTICA (CONTROLADA)
                // Solo actualizamos el estado de React si el porcentaje entero cambió
                const currentIntPercentage = Math.floor(percentage);
                if (currentIntPercentage > lastPercentageRef.current) {
                  lastPercentageRef.current = currentIntPercentage;
                  setProgressText(`Analizando... ${currentIntPercentage}% (${parsed} archivos)`);
                }
              }
            } catch (err) {
              console.error("Error parseando evento SSE:", err);
            }
          },
          
          onclose() {
            // El servidor cerró la conexión. Lanzamos un error para matar al Zombi
            // (evitando que fetchEventSource intente reconectarse ciegamente).
            throw new Error("Stream cerrado por el servidor");
          },
          
          onerror(err) {
            console.error("Error en SSE:", err);
            // Lanzar el error aquí mata el ciclo infinito de reconexiones
            throw err;
          }
        });
      } catch (err: any) {
        // Ignoramos los errores que nosotros mismos lanzamos para matar reconexiones
        // o los provocados por el aborto de la petición.
        if (err.message !== "Stream cerrado por el servidor" && err.name !== 'AbortError') {
          toast.error("Error de conexión durante el escaneo");
        }
      }
    };

    return () => {
      clearTimeout(timerId);
      abortController.abort();
    };
  }, [projectId, totalFiles, onComplete]);

  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-xl mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-mono text-slate-300">
          {progressText}
        </span>
        <span className="text-xs text-blue-400 animate-pulse">SSE ACTIVO</span>
      </div>
      
      {/* Contenedor de la barra de progreso */}
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        {/* Capa Visual atada al ref */}
        <div 
          ref={progressBarRef}
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-75 ease-linear"
          style={{ width: '0%' }}
        />
      </div>
    </div>
  );
};
