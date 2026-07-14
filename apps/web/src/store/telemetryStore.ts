import { create } from 'zustand';
import { API_BASE_URL } from '@/lib/api';
import { useProjectStore } from './projectStore';

export type Phase = 'THINKING' | 'CODING' | 'TESTING' | 'IDLE';

interface TelemetryState {
  currentPhase: Phase;
  lastTickTime: number;
  lastActivityTime: number;
  buckets: {
    THINKING: number;
    CODING: number;
    TESTING: number;
  };
  windowStartTime: number;
  isIdle: boolean;
  currentContinuousFlowMs: number;
  idleGraceMs: number;
  // Acciones
  setPhase: (phase: Phase) => void;
  tick: () => void;
  recordActivity: () => void;
  syncToServer: (isUnload?: boolean) => Promise<void>;
}

const MAX_DELTA_MS = 60000; // 1 minuto (El Techo Cuántico contra la Suspensión)
const IDLE_THRESHOLD_MS = 60000; // 60 segundos sin ratón/teclado para ser IDLE

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  currentPhase: 'THINKING', 
  lastTickTime: Date.now(),
  lastActivityTime: Date.now(),
  buckets: {
    THINKING: 0,
    CODING: 0,
    TESTING: 0,
  },
  windowStartTime: Date.now(),
  isIdle: false,
  currentContinuousFlowMs: 0,
  idleGraceMs: 0,

  setPhase: (phase: Phase) => {
    // Forzamos un tick antes de cambiar para guardar el tiempo en la fase vieja
    get().tick();
    set({ currentPhase: phase, lastTickTime: Date.now() });
  },

  tick: () => {
    const now = Date.now();
    const state = get();
    const deltaMs = now - state.lastTickTime;
    
    // Regla del Sensei #1: El Techo Cuántico (Sobrevivir a la suspensión de la Laptop)
    // Si pasaron más de 60s de golpe, es una anomalía temporal (sleep/freeze). Descartamos el delta.
    let effectiveDelta = deltaMs;
    if (deltaMs > MAX_DELTA_MS) {
      effectiveDelta = 0; 
    }

    set((currentState) => {
      // Regla del Sensei #2: El Filtro del Baño (Idle Detector)
      // Si el navegador está en background o hay 60s sin input físico, estamos IDLE
      const timeSinceLastActivity = now - currentState.lastActivityTime;
      const isDocumentHidden = document.hidden;
      const currentlyIdle = timeSinceLastActivity > IDLE_THRESHOLD_MS || isDocumentHidden;
      
      const newBuckets = { ...currentState.buckets };
      
      // Si no estamos inactivos, sumamos el delta a la fase actual real.
      // (Si estamos inactivos, el tiempo no suma, logrando telemetría ética y real).
      let newFlowMs = currentState.currentContinuousFlowMs;
      let newGraceMs = currentState.idleGraceMs;

      if (currentlyIdle) {
        newGraceMs += deltaMs;
        if (newGraceMs >= 300000) {
          newFlowMs = 0;
          newGraceMs = 0;
        }
      } else {
        newGraceMs = 0;
        newFlowMs += effectiveDelta;
        if (currentState.currentPhase !== 'IDLE') {
          newBuckets[currentState.currentPhase] += effectiveDelta;
        }
      }

      return {
        buckets: newBuckets,
        lastTickTime: now,
        isIdle: currentlyIdle,
        currentContinuousFlowMs: newFlowMs,
        idleGraceMs: newGraceMs,
      };
    });
  },

  recordActivity: () => {
    set({ lastActivityTime: Date.now() });
  },

  syncToServer: async (isUnload = false) => {
    const currentState = get();
    // 1. La Verdad Arquitectónica: Snapshot exacto de lo que vamos a enviar
    const snapshot = { ...currentState.buckets };
    
    // No disparamos red si no hubo trabajo real en este snapshot
    if (snapshot.THINKING === 0 && snapshot.CODING === 0 && snapshot.TESTING === 0) {
      return;
    }

    const windowEnd = Date.now();
    const windowStart = currentState.windowStartTime;
    const activeProjectId = useProjectStore.getState().projectId;

    const payloadObj = {
      window_start: windowStart,
      window_end: windowEnd,
      thinking_ms: snapshot.THINKING,
      coding_ms: snapshot.CODING,
      testing_ms: snapshot.TESTING,
      project_id: activeProjectId,
    };
    const payload = JSON.stringify(payloadObj);
    
    if (isUnload && navigator.sendBeacon) {
      // Regla del Sensei #3: El Mensajero Inmortal (sendBeacon para beforeunload)
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE_URL}/telemetry/session`, blob);
      // En un unload asumimos éxito para no bloquear, de todas formas la pestaña muere.
      set((state) => ({
        buckets: {
          THINKING: Math.max(0, state.buckets.THINKING - snapshot.THINKING),
          CODING: Math.max(0, state.buckets.CODING - snapshot.CODING),
          TESTING: Math.max(0, state.buckets.TESTING - snapshot.TESTING),
        },
        windowStartTime: windowEnd,
      }));
    } else {
      try {
        // 2. Envío de la foto con keepalive por si el usuario navega fuera
        const res = await fetch(`${API_BASE_URL}/telemetry/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true, 
        });

        if (res.ok) {
          // 3. Resta Atómica: Solo si llegó al banco, restamos los billetes del estado actual
          // que pudo haber seguido acumulando ms durante el vuelo HTTP.
          set((state) => ({
            buckets: {
              THINKING: Math.max(0, state.buckets.THINKING - snapshot.THINKING),
              CODING: Math.max(0, state.buckets.CODING - snapshot.CODING),
              TESTING: Math.max(0, state.buckets.TESTING - snapshot.TESTING),
            },
            windowStartTime: windowEnd,
          }));
        }
      } catch {
        // Ignorar errores en flush
      }
    }
  }
}));

// --- INICIALIZADOR GLOBAL (Llamado en el Root Layout o App mount) ---
export const initializeTelemetry = () => {
  if (typeof window === 'undefined') return () => {};

  // 1. Throttle de actividad (1 actualización por segundo máximo para salvar el CPU)
  let lastActivityCall = 0;
  const handleActivity = () => {
    const now = Date.now();
    if (now - lastActivityCall > 1000) { 
      useTelemetryStore.getState().recordActivity();
      lastActivityCall = now;
    }
  };

  // Eventos pasivos para optimización extrema de rendering
  window.addEventListener('mousemove', handleActivity, { passive: true });
  window.addEventListener('keydown', handleActivity, { passive: true });
  window.addEventListener('click', handleActivity, { passive: true });
  
  // 2. Control de Pestaña Minimizada / Oculta
  const handleVisibility = () => {
    if (!document.hidden) {
      // Al volver, forzamos un tick inmediato y registramos vida. 
      // Si estuvimos suspendidos 4 horas, el Delta Cap absorberá el impacto en el tick().
      useTelemetryStore.getState().recordActivity();
    }
    useTelemetryStore.getState().tick();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // 3. Tick de Tiempo Constante a 1 FPS (Actualiza estado, NO dispara re-renders si la UI usa Transient Updates)
  const tickInterval = setInterval(() => {
    useTelemetryStore.getState().tick();
  }, 1000);

  // 4. Batched Sync: Volcado al Backend cada 5 Minutos
  const syncInterval = setInterval(() => {
    useTelemetryStore.getState().syncToServer();
  }, 5 * 60 * 1000);

  // 5. El Evento del Agujero Negro: beforeunload
  const handleUnload = () => {
    useTelemetryStore.getState().tick();
    useTelemetryStore.getState().syncToServer(true);
  };
  window.addEventListener('beforeunload', handleUnload);

  // Retornamos el Cleanup
  return () => {
    clearInterval(tickInterval);
    clearInterval(syncInterval);
    window.removeEventListener('mousemove', handleActivity);
    window.removeEventListener('keydown', handleActivity);
    window.removeEventListener('click', handleActivity);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handleUnload);
  };
};
