/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
 
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../store/tabsStore';

import { sendPlanningMessage, PlanningMessagePayload, createKanbanTicket } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { WBSPlannerModal } from './WBSPlannerModal'; // We can reuse the tree UI from here but modified, or just extract it.
import { usePlanningStore } from '../store/planningStore';

export default function PlanningStudioTab() {
  const currentProjectId = useTabsStore((s) => s.currentProjectId);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === activeTabId));

  const initialContext = tab?.data?.markdown || ''; // AIReportViewer seeds this
  const activeProjectId = tab?.data?.projectId || currentProjectId;

  const projectState = usePlanningStore((s) => activeProjectId ? s.projectStates[activeProjectId] : null);
  const setProjectState = usePlanningStore((s) => s.setProjectState);

  const initialMessages = projectState?.messages?.length 
    ? projectState.messages 
    : (initialContext ? [{ role: 'user', content: initialContext }] : []);

  const [messages, setMessages] = useState<{ role: string; content: string }[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [wbsData, setWbsData] = useState<any | null>(projectState?.wbsData || null);

  const handleExportToKanban = async () => {
    if (!wbsData || !activeProjectId) return;
    setIsExporting(true);
    try {
      for (const pkg of wbsData.work_packages || []) {
        for (const task of pkg.subtasks || []) {
          await createKanbanTicket(activeProjectId, {
            title: `[${pkg.title}] ${task.title}`,
            type: "Feature",
            priority: "Medium",
            description: task.description || "",
          });
        }
      }
      useTabsStore.getState().addTab({ id: 'kanban', title: 'Kanban Board', type: 'kanban', data: { projectId: activeProjectId } });
    } catch (e) {
      console.error("Failed to export to kanban", e);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (activeProjectId) {
      setProjectState(activeProjectId, { messages, wbsData });
    }
  }, [messages, wbsData, activeProjectId, setProjectState]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (text: string = inputValue, isInitial = false) => {
    if (!text.trim() && !isInitial) return;
    if (!activeProjectId) {
      console.warn("No active project ID found for Planning Studio");
      return;
    }

    const newMsgs = isInitial ? messages : [...messages, { role: 'user', content: text }];
    if (!isInitial) {
      setMessages(newMsgs);
      setInputValue('');
    }
    
    setIsLoading(true);

    try {
      const payload: PlanningMessagePayload = {
        messages: newMsgs,
        project_id: activeProjectId,
      };

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const { text: finalText, toolCalls } = await sendPlanningMessage(
        payload,
        (partialText) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last.role === 'assistant') {
              last.content = partialText;
            }
            return copy;
          });
        },
        (calls) => {
          interface ToolCall {
            function: {
              name: string;
              arguments: string | Record<string, unknown>;
            };
          }
          const wbsCall = (calls as ToolCall[]).find(c => c?.function?.name === 'render_wbs_tree');
          if (wbsCall && wbsCall.function.arguments) {
            try {
              let args = wbsCall.function.arguments;
              if (typeof args === 'string') {
                args = args.replace(/```json/g, '').replace(/```/g, '').trim();
                const data = JSON.parse(args);
                setWbsData(data);
              } else {
                setWbsData(args);
              }
            } catch (e) {
              // Ignore partial JSON parsing errors during streaming
            }
          }
        }
      );
    } catch (e) {
      console.error(e);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Could not reach planning studio.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // If there's initial context, maybe send it immediately
  useEffect(() => {
    if (initialContext && messages.length === 1) {
      handleSend(initialContext, true);
    }
  }, []);

  const handleEstimateChange = (pkgId: string, subtaskId: string, newValue: number) => {
    if (!wbsData) return;
    const newData = JSON.parse(JSON.stringify(wbsData));
    const pkg = newData.work_packages.find((p: any) => p.id === pkgId);
    if (pkg) {
      const task = pkg.subtasks.find((t: any) => t.id === subtaskId);
      if (task) {
        task.estimated_hours = newValue;
      }
    }

    let total = 0;
    newData.work_packages.forEach((p: any) => {
      p.subtasks.forEach((t: any) => {
        total += Number(t.estimated_hours) || 0;
      });
    });
    newData.total_estimated_hours = total;
    setWbsData(newData);
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d0d] text-zinc-300 overflow-hidden">
      {/* Left: Chat */}
      <div className="w-1/3 min-w-[350px] border-r border-[#27272a] flex flex-col bg-[#151515] h-full overflow-hidden">
        <div className="p-4 border-b border-[#27272a] bg-[#111] shrink-0">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Play className="w-4 h-4 text-blue-400" />
            Planning Studio
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Brainstorm and refine the WBS</p>
        </div>

        <ScrollArea className="flex-1 h-0">
          <div className="space-y-4 p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2 rounded-lg max-w-[90%] text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {m.content || (isLoading && i === messages.length - 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : '')}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-[#27272a] bg-[#111] shrink-0">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask for a plan..."
              className="bg-zinc-900 border-zinc-800 focus-visible:ring-blue-500 text-zinc-200"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isLoading || !inputValue.trim()}
              className="bg-blue-600 hover:bg-blue-700 w-10 p-0 shrink-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Right: WBS Tree View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {wbsData ? (
          <>
            <div className="p-4 border-b border-[#27272a] bg-[#111] flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-zinc-100">
                Work Breakdown Structure
              </h3>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                  Total: {wbsData.total_estimated_hours} hrs
                </Badge>
                <Button 
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 h-7 text-xs"
                  onClick={handleExportToKanban}
                  disabled={isExporting}
                >
                  {isExporting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                  Export to Kanban
                </Button>
              </div>
            </div>
            
            <ScrollArea className="flex-1 h-0 p-6">
              <div className="space-y-8 max-w-4xl mx-auto">
                {wbsData.work_packages?.map((pkg: any) => (
                  <div key={pkg.id} className="bg-[#151515] border border-[#27272a] rounded-lg p-4">
                    <div className="mb-4 border-b border-[#27272a] pb-2">
                      <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <span className="text-blue-400">Epic {pkg.id}:</span> {pkg.title}
                      </h3>
                      <p className="text-sm text-zinc-400 mt-1">{pkg.objective}</p>
                    </div>

                    <div className="space-y-3 pl-4 border-l-2 border-[#27272a] ml-2">
                      {pkg.subtasks?.map((task: any) => (
                        <div key={task.id} className="flex justify-between items-start bg-[#1a1a1a] p-3 rounded border border-[#27272a]">
                          <div className="flex-1 mr-4">
                            <div className="font-semibold text-zinc-200">
                              <span className="text-zinc-500 mr-2">{task.id}</span>
                              {task.title}
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">{task.description}</p>
                            {task.dependencies && task.dependencies.length > 0 && (
                              <div className="text-xs mt-2 text-amber-500/80">
                                Dependencies: {task.dependencies.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 w-32 shrink-0">
                            <Input
                              type="number"
                              className="h-8 bg-zinc-900 border-zinc-800 text-right"
                              value={task.estimated_hours || 0}
                              onChange={(e) => handleEstimateChange(pkg.id, task.id, parseFloat(e.target.value) || 0)}
                            />
                            <span className="text-xs text-zinc-500">hrs</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 p-8 text-center flex-col">
            <Play className="w-12 h-12 text-zinc-800 mb-4" />
            <p className="text-lg">No WBS Plan Generated Yet</p>
            <p className="text-sm mt-2 max-w-md">
              Use the chat on the left to ask the AI to generate a plan for your feature or epic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
