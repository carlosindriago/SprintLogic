import { useState, useCallback, useRef, useEffect, MutableRefObject } from 'react';
import type { editor as monacoEditor } from 'monaco-editor';
import { useQuery } from '@tanstack/react-query';
import { hashString } from '@/lib/utils';
import { fetchHealthOverview, fetchContextualMentorship, auditCode, generateDocs, UndocumentedExport, CodeCoachOverview, CodeCoachMarker, fetchTechScan } from '@/lib/api';
import { useFimStore } from '@/store/fimStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useLLMConfigStore } from '@/store/llmConfigStore';
import { toast } from 'sonner';

interface UseCodeCoachProps {
  nodePath?: string;
  initialValue: string;
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>;
  monacoRef: MutableRefObject<typeof import('monaco-editor') | null>;
  isDirtyRef: MutableRefObject<boolean>;
  setIsDirty: (dirty: boolean) => void;
  isConflictMode: boolean;
  isEditorReady: boolean;
}

export function useCodeCoach({
  nodePath,
  initialValue,
  editorRef,
  monacoRef,
  isDirtyRef,
  setIsDirty,
  isConflictMode,
  isEditorReady,
}: UseCodeCoachProps) {
  const [coachOverview, setCoachOverview] = useState<CodeCoachOverview | null>(null);
  const [allMentorshipAdvice, setAllMentorshipAdvice] = useState<CodeCoachMarker[]>([]);
  const [availableAdviceLines, setAvailableAdviceLines] = useState<number[]>([]);
  const [undocumentedExports, setUndocumentedExports] = useState<UndocumentedExport[]>([]);
  const [isGeneratingDocFor, setIsGeneratingDocFor] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isCoachEnabled = useSettingsStore((s) => s.isFimEnabled);
  const fimDefaultModel = useLLMConfigStore((s) => s.fimDefaultModel);
  const fimFallbackModel = useLLMConfigStore((s) => s.fimFallbackModel);
  const setIsLoading = useFimStore((s) => s.setIsLoading);
  
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  
  const fimDefaultModelRef = useRef(fimDefaultModel);
  const fimFallbackModelRef = useRef(fimFallbackModel);
  const setIsLoadingRef = useRef(setIsLoading);
  const isCoachEnabledRef = useRef(isCoachEnabled);

  useEffect(() => {
    aiAbortControllerRef.current = new AbortController();
    return () => {
      aiAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    fimDefaultModelRef.current = fimDefaultModel;
    fimFallbackModelRef.current = fimFallbackModel;
    setIsLoadingRef.current = setIsLoading;
    isCoachEnabledRef.current = isCoachEnabled;
  }, [fimDefaultModel, fimFallbackModel, setIsLoading, isCoachEnabled]);

  const { data: techData, isFetching: isScanningTech, refetch: handleRescan, isError: isTechError } = useQuery({
    queryKey: ['tech-scan', nodePath],
    queryFn: () => {
      const content = editorRef.current?.getValue() || initialValue;
      const lang = nodePath?.split('.').pop() || 'typescript';
      return fetchTechScan(content, lang, fimDefaultModel, fimFallbackModel);
    },
    staleTime: Infinity,
    retry: 2,
    retryDelay: 2000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled: !!nodePath && isCoachEnabled && !!initialValue && initialValue.length > 5,
  });

  const runHealthAnalysis = useCallback(async (model: monacoEditor.ITextModel, skipCache = false) => {
    if (model.isDisposed()) return;
    const content = model.getValue();
    const currentHash = hashString(content);
    
    if (!skipCache) {
      const cachedHealth = localStorage.getItem(`coach_health_${currentHash}`);
      if (cachedHealth) {
        try {
          setCoachOverview(JSON.parse(cachedHealth));
          return;
        } catch {}
      }
    }
    
    setIsLoadingRef.current(true);
    setIsAnalyzing(true);
    try {
      const language = nodePath?.split('.').pop() || '';
      const healthResponse = await fetchHealthOverview(
        content,
        language,
        fimDefaultModelRef.current,
        fimFallbackModelRef.current,
        aiAbortControllerRef.current?.signal
      );
      if (model.isDisposed()) return;
      setCoachOverview(healthResponse);
      if (!healthResponse.is_degraded) {
        localStorage.setItem(`coach_health_${currentHash}`, JSON.stringify(healthResponse));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('[Code Coach Health] Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setCoachOverview({
        structure: "Error de red o conexión fallida al analizar el código.",
        critical_security: "N/A",
        clean_code_score: 0,
        is_degraded: true,
        error_detail: errorMessage,
      });
    } finally {
      setIsLoadingRef.current(false);
      setIsAnalyzing(false);
      setIsDirty(false);
      isDirtyRef.current = false;
    }
  }, [nodePath, setIsDirty, isDirtyRef]);

  const sanitizeMarkers = (mentorshipArray: CodeCoachMarker[]) => {
    if (!Array.isArray(mentorshipArray)) return [];
    const hasError = mentorshipArray.some((m) => {
      if (m.is_degraded) return true;
      const msg = String(m.message || '').toLowerCase();
      return msg.includes('fallo del proveedor ia') || 
             msg.includes('error 429') || 
             msg.includes('error 400') || 
             msg.includes('error 500') || 
             msg.includes('all model attempts failed');
    });
    if (hasError) return [];
    return mentorshipArray.filter((m) => m.line && m.line > 0);
  };

  const runCoachAnalysis = useCallback(async (model: monacoEditor.ITextModel, editor: monacoEditor.IStandaloneCodeEditor) => {
    if (model.isDisposed()) return;
    const content = model.getValue();
    const currentHash = hashString(content);
    
    const cachedMentorship = localStorage.getItem(`coach_mentorship_${currentHash}`);
    if (cachedMentorship) {
      try {
        const rawMentorship = JSON.parse(cachedMentorship);
        const parsedMentorship = sanitizeMarkers(rawMentorship);
        const monaco = monacoRef.current!;
        const monacoMarkers = parsedMentorship.map((m) => ({
          severity: m.severity === 'error' ? monaco.MarkerSeverity.Error : 
                    m.severity === 'warning' ? monaco.MarkerSeverity.Warning : 
                    monaco.MarkerSeverity.Hint,
          message: m.message,
          startLineNumber: m.line,
          startColumn: 1,
          endLineNumber: m.line,
          endColumn: model.getLineMaxColumn(m.line),
          explanation: m.explanation
        }));
        monaco.editor.setModelMarkers(model, 'ai-coach', monacoMarkers as monacoEditor.IMarkerData[]);
        setAvailableAdviceLines(parsedMentorship.map((m) => m.line));
        setAllMentorshipAdvice(rawMentorship);
        
        setIsDirty(false);
        isDirtyRef.current = false;
        return;
      } catch {}
    }
    
    setIsLoadingRef.current(true);
    setIsAnalyzing(true);
    try {
      const language = nodePath?.split('.').pop() || '';
      const position = editor.getPosition();
      const activeLine = position?.lineNumber || 1;
      const monaco = monacoRef.current!;
      
      const allMarkers = monaco.editor.getModelMarkers({ resource: model.uri });
      const nativeErrors = allMarkers
        .filter(m => m.owner !== 'ai-coach' && Math.abs(m.startLineNumber - activeLine) <= 5)
        .map(m => `[Error nativo en línea ${m.startLineNumber}]: "${m.message}"`);

      const mentorshipResponse = await fetchContextualMentorship(
        content,
        language,
        activeLine,
        nativeErrors,
        fimDefaultModelRef.current,
        fimFallbackModelRef.current,
        aiAbortControllerRef.current?.signal
      );
      if (model.isDisposed()) return;
      const validMentorshipResponse = sanitizeMarkers(mentorshipResponse);
      localStorage.setItem(`coach_mentorship_${currentHash}`, JSON.stringify(mentorshipResponse));
      const monacoMarkers = validMentorshipResponse.map((m) => ({
        severity: m.severity === 'error' ? monaco.MarkerSeverity.Error : 
                  m.severity === 'warning' ? monaco.MarkerSeverity.Warning : 
                  monaco.MarkerSeverity.Hint,
        message: m.message,
        startLineNumber: m.line,
        startColumn: 1,
        endLineNumber: m.line,
        endColumn: model.getLineMaxColumn(m.line),
        explanation: m.explanation
      }));
      monaco.editor.setModelMarkers(model, 'ai-coach', monacoMarkers as monacoEditor.IMarkerData[]);
      setAvailableAdviceLines(validMentorshipResponse.map((m) => m.line));
      setAllMentorshipAdvice(mentorshipResponse);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('[Code Coach Mentorship] Error:', error);
      setAvailableAdviceLines([]);
    } finally {
      setIsLoadingRef.current(false);
      setIsAnalyzing(false);
      setIsDirty(false);
      isDirtyRef.current = false;
    }
  }, [nodePath, setIsDirty, isDirtyRef, monacoRef]);

  const runAstAudit = useCallback(async (model: monacoEditor.ITextModel) => {
    if (model.isDisposed()) return;
    const content = model.getValue();
    const language = nodePath?.split('.').pop() || 'typescript';
    if (['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript'].includes(language)) {
      try {
        const exports = await auditCode(content, language);
        if (!model.isDisposed()) {
          setUndocumentedExports(exports);
          const monaco = monacoRef.current;
          if (monaco) {
            const markers = exports.map(exp => ({
              severity: monaco.MarkerSeverity.Warning,
              message: 'Generar JSDoc con SprintLogic IA',
              startLineNumber: exp.start_line,
              startColumn: exp.start_column,
              endLineNumber: exp.end_line,
              endColumn: exp.end_column
            }));
            monaco.editor.setModelMarkers(model, 'ast-auditor', markers);
          }
        }
      } catch (err) {
        console.error("Error in AST Audit:", err);
      }
    }
  }, [nodePath, monacoRef]);

  const forceSenseiAnalysis = useCallback(() => {
    isDirtyRef.current = true;
    setIsDirty(true);
    const model = editorRef.current?.getModel();
    if (model && !model.isDisposed()) {
      runHealthAnalysis(model, true);
      runCoachAnalysis(model, editorRef.current as monacoEditor.IStandaloneCodeEditor);
      runAstAudit(model);
    }
  }, [runCoachAnalysis, runHealthAnalysis, runAstAudit, editorRef, isDirtyRef, setIsDirty]);

  useEffect(() => {
    const handler = () => forceSenseiAnalysis();
    window.addEventListener("trigger-sensei", handler);
    return () => window.removeEventListener("trigger-sensei", handler as EventListener);
  }, [forceSenseiAnalysis]);

  async function handleGenerateDoc(exp: UndocumentedExport) {
    setIsGeneratingDocFor(exp.name);
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    
    if (!editor || !monaco) {
      setIsGeneratingDocFor(null);
      return;
    }
    
    const model = editor.getModel();
    if (!model) {
      setIsGeneratingDocFor(null);
      return;
    }

    const decorationId = model.deltaDecorations([], [{
      range: new monaco.Range(exp.start_line, 1, exp.start_line, 1),
      options: { isWholeLine: true }
    }]);

    try {
      const { jsdoc } = await generateDocs(exp.signature);
      
      const updatedRange = model.getDecorationRange(decorationId[0]);
      const targetLine = updatedRange ? updatedRange.startLineNumber : exp.start_line;
      
      editor.executeEdits("ai-coach", [{
        range: new monaco.Range(targetLine, 1, targetLine, 1),
        text: jsdoc + '\n',
        forceMoveMarkers: true
      }]);
      
      runAstAudit(model);
      toast.success("Docstring inyectado correctamente.");
    } catch (err) {
      toast.error("Error al generar documentación.");
      console.error(err);
    } finally {
      model.deltaDecorations(decorationId, []);
      setIsGeneratingDocFor(null);
    }
  }

  // Load initial initial analysis
  useEffect(() => {
    if (isConflictMode) return;
    if (isEditorReady && isCoachEnabled && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model && !model.isDisposed()) {
        runHealthAnalysis(model, false);
        runAstAudit(model);
        
        const timeout = setTimeout(() => {
          if (editorRef.current && !model.isDisposed() && model.getValue().length > 5) {
            runCoachAnalysis(model, editorRef.current);
          }
        }, 3500);
        return () => clearTimeout(timeout);
      }
    }
  }, [isEditorReady, isCoachEnabled, nodePath, runHealthAnalysis, runAstAudit, runCoachAnalysis, isConflictMode, editorRef]);

  return {
    techData,
    isScanningTech,
    handleRescan,
    isTechError,
    coachOverview,
    allMentorshipAdvice,
    availableAdviceLines,
    undocumentedExports,
    isAnalyzing,
    isGeneratingDocFor,
    runHealthAnalysis,
    runCoachAnalysis,
    runAstAudit,
    forceSenseiAnalysis,
    handleGenerateDoc,
  };
}
