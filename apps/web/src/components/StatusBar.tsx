"use client";

import React, { useEffect, useRef } from 'react';
import { useTelemetryStore, initializeTelemetry } from '../store/telemetryStore';

export const StatusBar: React.FC = () => {
  // Referencia directa al DOM para inyectar texto saltándonos el Virtual DOM (Transient Update)
  const timeRef = useRef<HTMLDivElement>(null);
  
  // Suscripción transitoria (Transient Update) para evitar re-renders masivos
  useEffect(() => {
    // Inicializar listeners globales de telemetría y batch sync
    const cleanupTelemetry = initializeTelemetry();

    const formatTime = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const s = (totalSeconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };

    const updateUI = () => {
      if (!timeRef.current) return;
      
      // Accedemos al estado de Zustand de forma imperativa
      const { buckets, currentPhase, isIdle, currentContinuousFlowMs } = useTelemetryStore.getState();
      
      const thinking = formatTime(buckets.THINKING);
      const coding = formatTime(buckets.CODING);
      const testing = formatTime(buckets.TESTING);
      
      // Indicador de estado actual
      let phaseIndicator = '🧠 PENSANDO';
      if (currentPhase === 'CODING') phaseIndicator = '🔴 CODIFICANDO';
      if (currentPhase === 'TESTING') phaseIndicator = '🟢 TESTEANDO';
      
      const isFlowing = currentContinuousFlowMs >= 1200000; // 20 min
      if (isFlowing) {
        phaseIndicator = '🔥 FLOW STATE';
      }

      if (isIdle) {
        phaseIndicator = isFlowing ? '💤 AUSENTE (GRACIA)' : '💤 AUSENTE (IDLE)';
      }
      
      // Inyección directa en el nodo del DOM
      timeRef.current.textContent = `${phaseIndicator}  |  🧠 ${thinking}  |  🔴 ${coding}  |  🟢 ${testing}`;
    };

    // Actualizamos al montar el componente
    updateUI();

    // Nos suscribimos a Zustand (el listener se dispara en cada state mutation)
    const unsubscribe = useTelemetryStore.subscribe(updateUI);

    // Regla del Sensei: Limpiar la suscripción y los listeners al desmontar el componente
    return () => {
      unsubscribe();
      cleanupTelemetry();
    };
  }, []);

  // Handler para cambiar de fase (solo para desarrollo/pruebas por ahora)
  const setPhase = useTelemetryStore(state => state.setPhase);

  return (
    <div style={{
      width: '100%',
      height: '32px',
      flexShrink: 0,
      backgroundColor: '#18181b', // Tailwind zinc-900
      color: '#a1a1aa',       // Tailwind zinc-400
      padding: '0 16px',
      fontSize: '12px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: '1px solid #27272a',
      zIndex: 50,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <span style={{ fontWeight: '600', color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
          SprintLogic IDE
        </span>
        
        {/* Controles rápidos para probar la telemetría */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setPhase('THINKING')} style={btnStyle} title="Fase de Pensamiento/Lectura">🧠</button>
          <button onClick={() => setPhase('CODING')} style={btnStyle} title="Fase de Codificación">🔴</button>
          <button onClick={() => setPhase('TESTING')} style={btnStyle} title="Fase de Pruebas">🟢</button>
        </div>
      </div>
      
      {/* El Contenedor del Reloj Cuántico (Actualizado imperativamente a 1 FPS) */}
      <div 
        ref={timeRef} 
        title="Tiempo de Flujo Acumulado (Pensando | Codificando | Testeando)"
        style={{ 
          fontWeight: '600', 
          color: '#38bdf8', // Tailwind sky-400
          letterSpacing: '0.5px' 
        }}
      >
        {/* El texto inicial será sobreescrito casi de inmediato por el useEffect */}
        🧠 PENSANDO  |  🧠 00:00  |  🔴 00:00  |  🟢 00:00
      </div>
    </div>
  );
};

// Estilos en línea simples para los botones de prueba
const btnStyle = {
  background: '#27272a',
  border: '1px solid #3f3f46',
  borderRadius: '4px',
  cursor: 'pointer',
  padding: '2px 6px',
  fontSize: '10px'
};
