import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, Circle, Bot } from 'lucide-react';
import { updateKanbanTicket } from '@/lib/api';
import { KanbanTicket, KanbanTicketUpdate } from '@/types';
import { useTabsStore } from '@/store/tabsStore';
import { useChatStore } from '@/store/chatStore';

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
}

interface TicketDrawerProps {
  ticket: KanbanTicket;
  allSprints: string[];
  allEpics: string[];
  onClose: () => void;
  onUpdate: (ticket: KanbanTicket) => void;
}

export default function TicketDrawer({ ticket, allSprints, allEpics, onClose, onUpdate }: TicketDrawerProps) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [type, setType] = useState(ticket.type);
  const [priority, setPriority] = useState(ticket.priority);
  const [branchName, setBranchName] = useState(ticket.branch_name || '');
  const [epic, setEpic] = useState(ticket.epic || '');
  const [sprint, setSprint] = useState(ticket.sprint || '');
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(ticket.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTitle(ticket.title);
    setDescription(ticket.description);
    setType(ticket.type);
    setPriority(ticket.priority);
    setBranchName(ticket.branch_name || '');
    setEpic(ticket.epic || '');
    setSprint(ticket.sprint || '');
    setSubtasks(ticket.subtasks || []);
  }, [ticket]);

  const addTab = useTabsStore(s => s.addTab);
  const setPendingQuery = useChatStore(s => s.setPendingQuery);

  const handleAIMentorClick = () => {
    const prompt = `Mentor, necesito resolver el ticket ${ticket.type.toUpperCase()}-SL-${ticket.id.substring(0,6).toUpperCase()}: '${ticket.title}'. Por favor, usa tus herramientas para revisar mi estado de flujo actual y analiza el blast radius de los archivos que crees que deberíamos tocar. Dame un plan de ataque paso a paso.`;
    setPendingQuery(prompt);
    
    addTab({ id: 'ai-history', title: 'SprintLogic AI', type: 'ai-history' });
    onClose();
  };

  const handleSaveMain = async () => {
    setIsSaving(true);
    try {
      const updatePayload: KanbanTicketUpdate = {
        title,
        description,
        type,
        priority,
        branch_name: branchName.trim() || null,
        epic: epic.trim() || null,
        sprint: sprint.trim() || null,
        subtasks
      };
      const updatedTicket = await updateKanbanTicket(ticket.id, updatePayload);
      onUpdate(updatedTicket);
    } catch (error) {
      console.error('Failed to save ticket', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    
    const newSubtask: SubtaskItem = {
      id: crypto.randomUUID(),
      title: newSubtaskTitle.trim(),
      completed: false
    };
    const newSubtasks = [...subtasks, newSubtask];
    setSubtasks(newSubtasks);
    setNewSubtaskTitle('');
    
    try {
      const updatedTicket = await updateKanbanTicket(ticket.id, { subtasks: newSubtasks });
      onUpdate(updatedTicket);
    } catch(err) {
      console.error(err);
    }
  };

  const toggleSubtask = async (id: string) => {
    const newSubtasks = subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s);
    setSubtasks(newSubtasks);
    
    try {
      const updatedTicket = await updateKanbanTicket(ticket.id, { subtasks: newSubtasks });
      onUpdate(updatedTicket);
    } catch(err) {
      console.error(err);
    }
  };

  const deleteSubtask = async (id: string) => {
    const newSubtasks = subtasks.filter(s => s.id !== id);
    setSubtasks(newSubtasks);
    
    try {
      const updatedTicket = await updateKanbanTicket(ticket.id, { subtasks: newSubtasks });
      onUpdate(updatedTicket);
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" onClick={onClose} />
      
      <div className="fixed inset-y-0 right-0 w-[500px] bg-[#1a1a1c] border-l border-[#27272a] shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
        
        <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
          <h2 className="text-lg font-semibold text-zinc-100 truncate pr-4">SL-{ticket.id.substring(0,6).toUpperCase()}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAIMentorClick}
              className="flex items-center gap-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors border border-indigo-600/30 whitespace-nowrap"
              title="Analizar con IA Mentor"
            >
              <Bot size={14} />
              <span>Mentor IA</span>
            </button>
            <button 
              onClick={handleSaveMain}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#27272a] rounded-md transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-xl font-bold bg-transparent border-none focus:ring-0 text-zinc-100 p-0 placeholder-zinc-600"
              placeholder="Título del ticket"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Estado</label>
              <div className="text-sm text-zinc-300 bg-[#27272a] px-3 py-1.5 rounded-md capitalize">
                {ticket.status.replace('_', ' ')}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Tipo</label>
              <select 
                value={type}
                onChange={e => setType(e.target.value as any)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="Feature" className="bg-[#18181b] text-zinc-100">Feature</option>
                <option value="Refactor" className="bg-[#18181b] text-zinc-100">Refactor</option>
                <option value="Technical Debt" className="bg-[#18181b] text-zinc-100">Technical Debt</option>
                <option value="Security" className="bg-[#18181b] text-zinc-100">Security</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Prioridad</label>
              <select 
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="High" className="bg-[#18181b] text-zinc-100">High</option>
                <option value="Medium" className="bg-[#18181b] text-zinc-100">Medium</option>
                <option value="Low" className="bg-[#18181b] text-zinc-100">Low</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Rama Git (Branch)</label>
              <input 
                type="text" 
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                placeholder="ej: feat/login"
                className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Sprint</label>
              <input 
                type="text" 
                list="sprints-list"
                value={sprint}
                onChange={e => setSprint(e.target.value)}
                placeholder="Seleccionar o crear..."
                style={{ colorScheme: 'dark' }}
                className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <datalist id="sprints-list">
                {allSprints.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Épica</label>
              <input 
                type="text" 
                list="epics-list"
                value={epic}
                onChange={e => setEpic(e.target.value)}
                placeholder="Seleccionar o crear..."
                style={{ colorScheme: 'dark' }}
                className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <datalist id="epics-list">
                {allEpics.map(e => <option key={e} value={e} />)}
              </datalist>
            </div>
          </div>

          <hr className="border-[#27272a]" />

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-200">Descripción</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Añade una descripción más detallada..."
              rows={4}
              className="w-full bg-[#131315] border border-[#27272a] rounded-md p-3 text-sm text-zinc-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>

          <hr className="border-[#27272a]" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-200">Subtareas</label>
              <div className="text-xs text-zinc-500 font-medium">
                {subtasks.filter(s => s.completed).length} / {subtasks.length}
              </div>
            </div>

            {subtasks.length > 0 && (
              <div className="w-full bg-[#27272a] rounded-full h-1.5 mb-4">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(subtasks.filter(s => s.completed).length / subtasks.length) * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-2">
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-3 group">
                  <button onClick={() => toggleSubtask(st.id)} className="text-zinc-400 hover:text-blue-500 transition-colors shrink-0">
                    {st.completed ? <CheckCircle2 size={18} className="text-blue-500" /> : <Circle size={18} />}
                  </button>
                  <span className={`text-sm flex-1 ${st.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                    {st.title}
                  </span>
                  <button onClick={() => deleteSubtask(st.id)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddSubtask} className="flex items-center gap-2 mt-2">
              <input 
                type="text"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                placeholder="Añadir un ítem..."
                className="flex-1 bg-transparent border-b border-[#27272a] py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:ring-0 focus:outline-none placeholder-zinc-600"
              />
              <button 
                type="submit"
                disabled={!newSubtaskTitle.trim()}
                className="p-1.5 text-zinc-400 hover:text-blue-500 disabled:opacity-50 transition-colors"
              >
                <Plus size={18} />
              </button>
            </form>
          </div>

        </div>
      </div>
    </>
  );
}
