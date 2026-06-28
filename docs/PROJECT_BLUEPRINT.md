# Project Blueprint

## 1. Visión

Construir una plataforma SaaS B2B que sea el **centro de comando integral del ciclo de desarrollo**. Uniendo gestión visual, un motor de **Inteligencia Artificial para planificación y ejecución de Git**, y analítica operativa. SprintLogic no solo mide el trabajo, sino que **asiste activamente al desarrollador** (generando ramas, sugiriendo commits y verificando diffs) para forzar un flujo de trabajo ágil, estandarizado y profesional.

## 2. Problema que resuelve

Las herramientas actuales suelen resolver solo una parte:

- gestionan tareas, pero no la realidad operativa;
- el código (Git) y la tarea viven desconectados, lo que dificulta la trazabilidad;
- los flujos de Git (ramas, commits atómicos) dependen puramente de la disciplina humana y suelen degradarse;
- registran tiempo con fricción y generan reporting manual y tardío.

## 3. Tesis de producto

Si el trabajo real se captura en el momento en que ocurre, y ese dato se conecta con tareas, estimaciones, capacidad y resultados, entonces la empresa puede:

- estandarizar y automatizar la creación de ramas y commits atómicos con IA;
- auditar los cambios reales del código (diffs) contra la tarea planificada;
- detectar desvíos antes y reducir retrabajo;
- reportar automáticamente a liderazgo y mejorar continuamente el sistema de trabajo.

## 4. Usuarios objetivo

### Developer
- Quiere claridad de tareas, foco y mínima fricción.
- Necesita que "hacer lo correcto" (crear ramas bien nombradas, commits semánticos) sea automático gracias a la IA.
- Necesita registrar trabajo sin “rellenar horas” después.

### Team Lead / Project Manager
- Quiere visibilidad del sprint, carga, bloqueos y desvíos.
- Necesita reportes automáticos y señales tempranas de riesgo.

### Director / Ejecutivo
- Quiere previsibilidad, costo, capacidad, productividad y fecha probable de entrega.

## 5. Propuesta de valor

### Para el equipo
- automatización del workflow de Git (ramas y commits semánticos generados por IA);
- foco por tarea y menos multitarea invisible;
- trazabilidad absoluta entre el diff de código y la tarea original.

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
8. **La IA es un Copiloto, no un Bloqueo**: La Inteligencia Artificial actúa como un acelerador para generar ramas, tareas y commits, pero NUNCA bloquea el flujo. El desarrollador siempre tiene la opción de operar de manera 100% manual y retiene el control absoluto de sus acciones.

## 7. Alcance MVP

### Incluido

1. Organizaciones, miembros y roles.
2. Proyectos.
3. Tablero Kanban con estados configurables básicos.
4. Tareas con estimación, prioridad, tipo, asignación y bloqueo.
5. Focus Timer por tarea con sesiones, pausas y motivo de interrupción.
6. Time tracking automático derivado de sesiones.
7. **AI Git Assistant**: generación automática de nombres de ramas y mensajes de commit basados en la tarea activa.
8. **Git Workflow Auditor**: visualización de ramas, commits y diffs directamente desde la tarea para revisión rápida.
9. Dashboard ejecutivo por proyecto y Reporte semanal automático.
10. Métricas base (throughput, lead time, cycle time, WIP).

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
2. **Work management & AI Planning**
3. **AI Git Workflow & Code Traceability**
4. **Focus & time intelligence**
5. **Analytics, executive dashboard & reporting**
6. **Security, observability & hardening**

## 9. KPIs de producto

### Adopción
- tiempo hasta crear primer proyecto;
- tiempo hasta completar primera sesión de foco;
- porcentaje de usuarios activos semanales por organización.

### Operación
- porcentaje de tareas con estimación;
- porcentaje de tareas en las que la IA generó el commit/rama;
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
