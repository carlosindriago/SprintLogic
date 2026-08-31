import React, { useEffect, useCallback } from 'react';
import { Beaker, FileCode, CheckCircle, XCircle, Play, Send, Loader2, GraduationCap, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/projectStore';
import { useTabsStore } from '@/store/tabsStore';
import { usePlanningStore } from '@/store/planningStore';
import { useTestStudioStore } from '@/store/testStudioStore';
import { fetchTestDiscovery, generateTests, auditTests, getFileContent } from '@/lib/api';
import ReactMarkdown from 'react-markdown';

export default function TestStudioTab() {
  const currentProjectId = useProjectStore((state) => state.projectId);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);
  const addTab = useTabsStore((state) => state.addTab);
  const setProjectState = usePlanningStore((state) => state.setProjectState);

  const {
    discovery, loadingDiscovery, selectedFile, generatedTest, isGenerating,
    activeMode, isAuditing, auditReport, existingTestContent,
    setDiscovery, setLoadingDiscovery, setSelectedFile, setGeneratedTest,
    setIsGenerating, setActiveMode, setIsAuditing, setAuditReport, setExistingTestContent
  } = useTestStudioStore();

  const loadDiscovery = useCallback(async () => {
    if (!currentProjectId) return;
    setLoadingDiscovery(true);
    try {
      const result = await fetchTestDiscovery(currentProjectId);
      setDiscovery(result);
      if (result.items.length > 0) {
        setSelectedFile(result.items[0]);
      }
    } catch (err) {
      console.error('Failed to load discovery:', err);
      toast.error((err as Error)?.message || 'Failed to load project tests');
    } finally {
      setLoadingDiscovery(false);
    }
  }, [currentProjectId, setLoadingDiscovery, setDiscovery, setSelectedFile]);

  useEffect(() => {
    if (currentProjectId && !discovery) {
      loadDiscovery();
    }
  }, [currentProjectId, discovery, loadDiscovery]);

  const handleGenerate = async () => {
    if (!currentProjectId || !selectedFile) return;
    setIsGenerating(true);
    setGeneratedTest(null);
    try {
      const res = await generateTests(currentProjectId, selectedFile.file_path);
      setGeneratedTest(res.generated_test);
    } catch (err) {
      console.error('Failed to generate tests:', err);
      toast.error((err as Error)?.message || 'Error communicating with LLM');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAudit = async () => {
    if (!currentProjectId || !selectedFile) return;
    setIsAuditing(true);
    setAuditReport(null);
    setActiveMode('audit');
    try {
      const res = await auditTests(currentProjectId, selectedFile.file_path, selectedFile.test_file_path);
      setAuditReport(res.audit_report);
    } catch (err) {
      console.error('Failed to audit tests:', err);
      toast.error((err as Error)?.message || 'Error communicating with LLM for audit');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleHandoff = () => {
    if (!currentProjectId || !selectedFile) return;
    
    if (activeMode === 'generate' && generatedTest) {
      setProjectState(currentProjectId, {
        messages: [{ role: 'user', content: `## Pruebas Generadas para ${selectedFile.file_path}\n\n${generatedTest}` }],
      });
      setActiveTab('planning');
    } else if (activeMode === 'audit' && auditReport) {
      setProjectState(currentProjectId, {
        messages: [{ role: 'user', content: `## Auditoría QA para ${selectedFile.file_path}\n\n${auditReport}` }],
      });
      setActiveTab('planning');
    }
  };

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-zinc-200 items-center justify-center">
        <p className="text-zinc-500">No hay proyecto seleccionado.</p>
      </div>
    );
  }

  const items = discovery?.items || [];
  const testedCount = items.filter(i => i.has_test).length;
  const coveragePercent = items.length > 0 ? Math.round((testedCount / items.length) * 100) : 0;

  return (
    <div className="flex-1 flex h-full bg-[#0A0A0A] text-zinc-200 overflow-hidden">
      {/* Left Panel: Discovery Table */}
      <div className="w-1/3 flex flex-col border-r border-zinc-800/50 bg-[#0F0F0F]">
        <div className="p-4 border-b border-zinc-800/50 flex flex-col gap-2">
          <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
            <Beaker className="h-5 w-5 text-emerald-400" />
            Test Studio
          </h2>
          {loadingDiscovery ? (
            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Escaneando proyecto...
            </div>
          ) : (
            <div className="flex items-center justify-between mt-2">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500 uppercase font-semibold tracking-wider">Cobertura</span>
                <span className="text-sm font-medium text-zinc-300">{coveragePercent}% ({testedCount}/{items.length})</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-xs text-zinc-500 uppercase font-semibold tracking-wider">Framework</span>
                <span className="text-sm font-medium text-emerald-400/90">{discovery?.framework || 'Detectando...'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {items.map((item, idx) => (
            <div
              key={idx}
              onClick={async () => {
                setSelectedFile(item);
                setGeneratedTest(null);
                setAuditReport(null);
                setExistingTestContent(null);
                setActiveMode('generate');
                if (item.has_test && item.test_file_path && currentProjectId) {
                  try {
                    const data = await getFileContent(currentProjectId, item.test_file_path);
                    setExistingTestContent(data.content);
                  } catch (err) {
                    console.error('Failed to load existing test content:', err);
                    setExistingTestContent(''); // set to empty string so it doesn't get stuck loading
                  }
                }
              }}
              className={`p-3 mb-1 rounded-lg cursor-pointer transition-all border ${
                selectedFile?.file_path === item.file_path
                  ? 'bg-zinc-800/60 border-zinc-700'
                  : 'bg-transparent border-transparent hover:bg-zinc-800/30'
              } flex items-center gap-3`}
            >
              {item.has_test ? (
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500/80 shrink-0" />
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm text-zinc-300 truncate font-mono">{item.file_path}</span>
                {item.has_test && item.test_file_path && (
                  <span className="text-xs text-emerald-500/70 truncate font-mono mt-0.5">
                    ↳ {item.test_file_path}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel: Generator and Preview */}
      <div className="flex-1 flex flex-col bg-[#0A0A0A] relative min-w-0">
        {selectedFile ? (
          <>
            <div className="p-4 border-b border-zinc-800/50 flex flex-col bg-[#121212]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileCode className="h-5 w-5 text-blue-400" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-200">{selectedFile.file_path}</span>
                    <span className="text-xs text-zinc-500">
                      {selectedFile.has_test ? 'Pruebas Detectadas' : 'Vulnerable: Sin Pruebas'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveMode('generate')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeMode === 'generate' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    Generación
                  </button>
                  <button
                    onClick={() => setActiveMode('audit')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeMode === 'audit' ? 'bg-purple-900/50 text-purple-200 border border-purple-700/50' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    Auditoría
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-800/50 pt-3">
                <div className="flex gap-2">
                  {!selectedFile.has_test && activeMode === 'generate' && !generatedTest && !isGenerating && (
                    <button
                      onClick={handleGenerate}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Generar Pruebas
                    </button>
                  )}
                  {activeMode === 'audit' && !auditReport && !isAuditing && (
                    <button
                      onClick={handleAudit}
                      className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      <GraduationCap className="h-3 w-3" aria-hidden="true" />
                      Auditar con QA Mentor
                    </button>
                  )}
                </div>
                {((activeMode === 'generate' && generatedTest) || (activeMode === 'audit' && auditReport)) && (
                  <button
                    onClick={handleHandoff}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <Send className="h-3 w-3" aria-hidden="true" />
                    Llevar al Planning Studio
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 scrollbar-thin min-w-0">
              {activeMode === 'generate' ? (
                isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p>Invocando motor LLM para generar suite de pruebas...</p>
                    <p className="text-xs">Aplicando heurísticas para {discovery?.framework}</p>
                  </div>
                ) : generatedTest ? (
                  <div className="prose prose-invert w-full max-w-none break-all prose-pre:bg-[#151515] prose-pre:border prose-pre:border-zinc-800 prose-pre:overflow-x-auto prose-p:leading-relaxed">
                    <ReactMarkdown>{generatedTest}</ReactMarkdown>
                  </div>
                ) : selectedFile.has_test ? (
                  existingTestContent ? (
                    <div className="prose prose-invert w-full max-w-none break-all prose-pre:bg-[#151515] prose-pre:border prose-pre:border-zinc-800 prose-pre:overflow-x-auto prose-p:leading-relaxed">
                      <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-800/50">
                        <h3 className="text-sm font-medium text-zinc-300 m-0">Pruebas actuales ({selectedFile.test_file_path})</h3>
                        <button
                          onClick={() => {
                            addTab({
                              id: selectedFile.test_file_path || "unnamed",
                              title: (selectedFile.test_file_path || "unnamed").split('/').pop() || (selectedFile.test_file_path || "unnamed"),
                              type: 'editor',
                              data: {
                                node: {
                                  id: selectedFile.test_file_path || "unnamed",
                                  label: "File",
                                  name: (selectedFile.test_file_path || "unnamed").split('/').pop() || (selectedFile.test_file_path || "unnamed"),
                                  file_path: selectedFile.test_file_path || "unnamed",
                                }
                              }
                            });
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          Abrir en Editor
                        </button>
                      </div>
                      <ReactMarkdown>{`\`\`\`\n${existingTestContent}\n\`\`\``}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                      <p>Cargando pruebas existentes...</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                    <FileCode className="h-12 w-12 text-zinc-700" />
                    <p>Selecciona generar pruebas para proponer una suite basada en IA.</p>
                  </div>
                )
              ) : (
                isAuditing ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                    <p className="text-purple-300 font-medium animate-pulse">Analizando casos límite...</p>
                    <p className="text-xs">QA Mentor está auditando el código y redactando lecciones.</p>
                  </div>
                ) : auditReport ? (
                  <div className="prose prose-invert w-full max-w-none break-words prose-pre:bg-[#151515] prose-pre:border prose-pre:border-zinc-800 prose-pre:overflow-x-auto prose-headings:text-purple-300 prose-p:leading-relaxed">
                    <ReactMarkdown>{auditReport}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                    <GraduationCap className="h-12 w-12 text-zinc-700" />
                    <p>El QA Mentor auditará este archivo en busca de casos límite y enseñará patrones de diseño.</p>
                  </div>
                )
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <p>Selecciona un archivo del panel izquierdo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
