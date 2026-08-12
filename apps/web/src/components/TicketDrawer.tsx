import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, Circle, Bot } from 'lucide-react';
import { updateKanbanTicket, deleteKanbanTicket } from '@/lib/api';
import { KanbanTicket, KanbanTicketUpdate, Epic, Sprint } from '@/types';
import { useTabsStore } from '@/store/tabsStore';
import { useChatStore } from '@/store/chatStore';
import { createEpic, createSprint, KanbanColumn } from '@/lib/api';

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
}

interface TicketDrawerProps {
  ticket: KanbanTicket;
  allSprints: Sprint[];
  allEpics: Epic[];
  columns: KanbanColumn[];
  onClose: () => void;
  onUpdate: (ticket: KanbanTicket) => void;
}

function CreatableCombobox({
  items,
  value,
  onChange,
  onCreate,
  placeholder,
  emptyLabel
}: {
  items: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<string>;
  placeholder: string;
  emptyLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedItem = items.find(i => i.id === value);

  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedItem ? selectedItem.name : '');
    }
  }, [isOpen, selectedItem]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const exactMatch = items.find(i => i.name.toLowerCase() === search.trim().toLowerCase());
  const showCreate = search.trim() !== '' && !exactMatch;

  const handleCreate = async () => {
    if (!search.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const newId = await onCreate(search.trim());
      onChange(newId);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        placeholder={placeholder}
        value={isOpen ? search : (selectedItem ? selectedItem.name : '')}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!isOpen) setIsOpen(true);
          if (e.target.value === '') onChange('');
        }}
        onClick={() => setIsOpen(true)}
      />
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#18181b] border border-[#27272a] rounded-md shadow-lg max-h-48 overflow-y-auto">
          {emptyLabel && !search && (
            <div 
              className="px-3 py-2 text-sm text-zinc-400 hover:bg-[#27272a] cursor-pointer"
              onClick={() => { onChange(''); setIsOpen(false); }}
            >
              {emptyLabel}
            </div>
          )}
          {filtered.map(item => (
            <div
              key={item.id}
              className={`px-3 py-2 text-sm cursor-pointer ${value === item.id ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-100 hover:bg-[#27272a]'}`}
              onClick={() => { onChange(item.id); setIsOpen(false); }}
            >
              {item.name}
            </div>
          ))}
          {showCreate && (
            <div
              className="px-3 py-2 text-sm text-blue-400 hover:bg-[#27272a] cursor-pointer font-medium flex items-center gap-2"
              onClick={handleCreate}
            >
              {isCreating ? 'Creando...' : `Crear "${search.trim()}"...`}
            </div>
          )}
          {!showCreate && filtered.length === 0 && search && (
            <div className="px-3 py-2 text-sm text-zinc-500">No hay resultados</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TicketDrawer({ ticket, allSprints, allEpics, columns, onClose, onUpdate }: TicketDrawerProps) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [type, setType] = useState(ticket.type);
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [branchName, setBranchName] = useState(ticket.branch_name || '');
  const [epicId, setEpicId] = useState(ticket.epic_id || '');
  const [sprintId, setSprintId] = useState(ticket.sprint_id || '');
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(ticket.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setTitle(ticket.title);
    setDescription(ticket.description);
    setType(ticket.type);
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setBranchName(ticket.branch_name || '');
    setEpicId(ticket.epic_id || '');
    setSprintId(ticket.sprint_id || '');
    setSubtasks(ticket.subtasks || []);
  }, [ticket]);

  const [localEpics, setLocalEpics] = useState<Epic[]>(allEpics);
  const [localSprints, setLocalSprints] = useState<Sprint[]>(allSprints);

  useEffect(() => { setLocalEpics(allEpics); }, [allEpics]);
  useEffect(() => { setLocalSprints(allSprints); }, [allSprints]);

  const handleCreateEpic = async (name: string) => {
    const newEpic = await createEpic(ticket.project_id, { name, color: 'bg-blue-500' });
    setLocalEpics(prev => [newEpic, ...prev]);
    return newEpic.id;
  };

  const handleCreateSprint = async (name: string) => {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 14);
    
    const newSprint = await createSprint(ticket.project_id, { 
      name, 
      start_date: now.toISOString(), 
      end_date: end.toISOString(),
      goal: ''
    });
    setLocalSprints(prev => [newSprint, ...prev]);
    return newSprint.id;
  };

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
        status: status as any,
        priority,
        branch_name: branchName.trim() || null,
        epic_id: epicId.trim() || null,
        sprint_id: sprintId.trim() || null,
        subtasks
      };
      const updatedTicket = await updateKanbanTicket(ticket.id, updatePayload);
      onUpdate(updatedTicket);
      onClose();
    } catch (error) {
      console.error('Failed to save ticket', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteKanbanTicket(ticket.id);
      onUpdate(ticket); // This triggers fetchTasks
      onClose(); // Explicitly close the drawer
    } catch (error) {
      console.error('Failed to delete ticket', error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
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
              <select 
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-[#131315] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {columns.map(c => (
                  <option key={c.id} value={c.id} className="bg-[#18181b] text-zinc-100">
                    {c.title}
                  </option>
                ))}
              </select>
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
              <CreatableCombobox
                items={localSprints}
                value={sprintId}
                onChange={setSprintId}
                onCreate={handleCreateSprint}
                placeholder="Buscar o crear sprint..."
                emptyLabel="Sin Sprint"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Épica</label>
              <CreatableCombobox
                items={localEpics}
                value={epicId}
                onChange={setEpicId}
                onCreate={handleCreateEpic}
                placeholder="Buscar o crear épica..."
                emptyLabel="Sin Épica"
              />
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

          <div className="pt-6 mt-4">
            {showDeleteConfirm ? (
              <div className="flex items-center justify-between bg-red-950/30 border border-red-900/50 p-3 rounded-md">
                <span className="text-xs text-red-400 font-medium">¿Estás seguro de eliminar este ticket?</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors">Cancelar</button>
                  <button onClick={handleDelete} disabled={isDeleting} className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50">
                    {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors py-2 px-4 rounded-md hover:bg-red-950/30 w-full justify-center border border-transparent hover:border-red-900/50"
              >
                <Trash2 size={16} />
                <span>Eliminar Ticket</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
