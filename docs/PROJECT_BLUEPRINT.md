# Project Blueprint

## 1. Visión

Construir una plataforma SaaS B2B para equipos de desarrollo que una **gestión visual del trabajo**, **time tracking real**, **Pomodoro por tarea** y **analítica operativa** para convertir la gestión de proyectos en un sistema medible, predecible y reportable.

## 2. Problema que resuelve

Las herramientas actuales suelen resolver solo una parte:

- gestionan tareas, pero no la realidad operativa;
- registran tiempo, pero con fricción y baja calidad de dato;
- generan reporting manual y tardío;
- no ayudan a proyectar atrasos, sobrecargas y costo de interrupciones.

## 3. Tesis de producto

Si el trabajo real se captura en el momento en que ocurre, y ese dato se conecta con tareas, estimaciones, capacidad y resultados, entonces la empresa puede:

- estimar mejor;
- detectar desvíos antes;
- reducir retrabajo;
- reportar automáticamente a liderazgo y clientes;
- mejorar continuamente su sistema de trabajo.

## 4. Usuarios objetivo

### Developer
- Quiere claridad de tareas, foco y mínima fricción.
- Necesita registrar trabajo sin “rellenar horas” después.

### Team Lead / Project Manager
- Quiere visibilidad del sprint, carga, bloqueos y desvíos.
- Necesita reportes automáticos y señales tempranas de riesgo.

### Director / Ejecutivo
- Quiere previsibilidad, costo, capacidad, productividad y fecha probable de entrega.

## 5. Propuesta de valor

### Para el equipo
- foco por tarea;
- menos multitarea invisible;
- claridad de prioridades;
- trazabilidad del trabajo real.

### Para gestión
- tablero vivo;
- capacidad vs demanda;
- estimado vs real;
- alertas de riesgo.

### Para dirección
- reportes ejecutivos de una página;
- predicción de fechas;
- costo del atraso e interrupciones;
- vista portfolio por organización.

## 6. Principios rectores

1. **Dato operativo antes que opinión**.
2. **Menor fricción posible para el developer**.
3. **Multi-tenant desde el día uno**.
4. **MVP con profundidad, no con exceso de módulos**.
5. **Arquitectura modular monolith primero, microservicios después solo si el negocio lo exige**.
6. **Todo KPI debe tener definición única y trazable**.
7. **Toda automatización debe ser explicable al usuario**.

## 7. Alcance MVP

### Incluido

1. Organizaciones, miembros y roles.
2. Proyectos.
3. Tablero Kanban con estados configurables básicos.
4. Tareas con estimación, prioridad, tipo, asignación y bloqueo.
5. Focus Timer por tarea con sesiones, pausas y motivo de interrupción.
6. Time tracking automático derivado de sesiones.
7. Dashboard ejecutivo por proyecto.
8. Reporte semanal automático en web + PDF.
9. Métricas base:
   - throughput;
   - lead time;
   - cycle time;
   - WIP;
   - estimado vs real;
   - horas foco vs horas registradas;
   - costo de interrupciones;
   - predicción simple de finalización.

### Fuera del MVP

- billing y suscripciones;
- integraciones con Jira/GitHub/Slack;
- forecasting avanzado con ML;
- portafolio multi-proyecto avanzado;
- mobile app nativa;
- SSO enterprise;
- automatizaciones no-code.

## 8. Épicas del MVP

1. **Foundation & tenancy**
2. **Work management**
3. **Focus & time intelligence**
4. **Analytics & executive dashboard**
5. **Reporting & notifications**
6. **Security, observability & hardening**

## 9. KPIs de producto

### Adopción
- tiempo hasta crear primer proyecto;
- tiempo hasta completar primera sesión de foco;
- porcentaje de usuarios activos semanales por organización.

### Operación
- porcentaje de tareas con estimación;
- porcentaje de tareas con tiempo real capturado;
- ratio de sesiones completadas vs interrumpidas.

### Valor de negocio
- reducción de desviación estimado/real;
- mejora de predictibilidad por sprint;
- horas ahorradas en reporting manual.

## 10. Requisitos no funcionales

- seguridad por tenant;
- trazabilidad de cambios críticos;
- timestamps en UTC;
- auditoría mínima de eventos operativos;
- reportes reproducibles;
- tiempos de respuesta de UI percibidos < 300 ms en operaciones comunes;
- tolerancia a reconexión en realtime;
- observabilidad desde el inicio.

## 11. Riesgos principales

1. **Fricción de adopción** si el timer interrumpe demasiado el flujo.
2. **Mala calidad de dato** si no existen reglas claras de captura.
3. **Sobrediseño** si se intenta competir con Jira desde el MVP.
4. **Complejidad analítica** si no se define un diccionario único de métricas.

## 12. Decisiones de negocio iniciales

- El producto entra por **equipos pequeños y medianos**.
- El diferencial no es “otro tablero”, sino **operación medible + foco + analítica ejecutiva**.
- El MVP debe demostrar valor en **2 semanas de uso real**.

## 13. Criterios de salida para empezar a codificar

No se debe iniciar desarrollo fuerte hasta que existan:

1. stack base aprobado;
2. arquitectura objetivo aprobada;
3. diccionario inicial de métricas;
4. modelo multi-tenant definido;
5. backlog MVP priorizado;
6. Definition of Ready y Definition of Done vigentes.
