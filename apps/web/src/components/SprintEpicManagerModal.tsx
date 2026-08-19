import React, { useState, useEffect } from 'react';
import { Epic, Sprint, EpicCreate, SprintCreate } from '../types';
import * as api from '../lib/api';

interface SprintEpicManagerModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}

const EPIC_COLORS = [
  'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-purple-500',
  'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'
];

export function SprintEpicManagerModal({ projectId, isOpen, onClose, onDataChanged }: SprintEpicManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'sprints' | 'epics'>('sprints');
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Epic Form
  const [epicName, setEpicName] = useState('');
  const [epicDesc, setEpicDesc] = useState('');
  const [epicColor, setEpicColor] = useState(EPIC_COLORS[0]);

  // New Sprint Form
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [sprintStart, setSprintStart] = useState('');
  const [sprintEnd, setSprintEnd] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, projectId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sprintsData, epicsData] = await Promise.all([
        api.fetchSprints(projectId),
        api.fetchEpics(projectId)
      ]);
      setSprints(sprintsData);
      setEpics(epicsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEpic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!epicName.trim()) return;
    try {
      await api.createEpic(projectId, {
        name: epicName,
        description: epicDesc,
        color: epicColor
      });
      setEpicName('');
      setEpicDesc('');
      setEpicColor(EPIC_COLORS[0]);
      onDataChanged();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create epic');
    }
  };

  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sprintName.trim() || !sprintStart || !sprintEnd) return;
    try {
      await api.createSprint(projectId, {
        name: sprintName,
        goal: sprintGoal,
        start_date: new Date(sprintStart).toISOString(),
        end_date: new Date(sprintEnd).toISOString()
      });
      setSprintName('');
      setSprintGoal('');
      setSprintStart('');
      setSprintEnd('');
      onDataChanged();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create sprint');
    }
  };

  const handleArchiveEpic = async (epicId: string) => {
    if (!confirm('Are you sure you want to archive this epic?')) return;
    try {
      await api.archiveEpic(epicId);
      onDataChanged();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to archive epic');
    }
  };

  const handleArchiveSprint = async (sprintId: string) => {
    if (!confirm('Are you sure you want to archive this sprint?')) return;
    try {
      await api.archiveSprint(sprintId);
      onDataChanged();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to archive sprint');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#333] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-200">Manage Sprints & Epics</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#333] rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="Close modal"
          >
            <span className="text-gray-400" aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#333]">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'sprints' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('sprints')}
          >
            Sprints
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'epics' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('epics')}
          >
            Epics
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {activeTab === 'sprints' && (
            <div className="space-y-6">
              {/* Sprint Form */}
              <form onSubmit={handleCreateSprint} className="bg-[#222] p-4 rounded-lg border border-[#333] space-y-4">
                <h3 className="text-sm font-medium text-gray-300">Create New Sprint</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label htmlFor="sprint-name" className="block text-xs text-gray-400 mb-1">Name</label>
                    <input
                      id="sprint-name"
                      type="text"
                      required
                      value={sprintName}
                      onChange={e => setSprintName(e.target.value)}
                      className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                      placeholder="e.g., Sprint 42"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="sprint-goal" className="block text-xs text-gray-400 mb-1">Goal</label>
                    <input
                      id="sprint-goal"
                      type="text"
                      value={sprintGoal}
                      onChange={e => setSprintGoal(e.target.value)}
                      className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                      placeholder="What is the main objective?"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Start Date</label>
                    <input
                      type="datetime-local"
                      required
                      value={sprintStart}
                      onChange={e => setSprintStart(e.target.value)}
                      className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">End Date</label>
                    <input
                      type="datetime-local"
                      required
                      value={sprintEnd}
                      onChange={e => setSprintEnd(e.target.value)}
                      className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                    Create Sprint
                  </button>
                </div>
              </form>

              {/* Sprint List */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-300">Active Sprints</h3>
                {loading ? <div className="text-gray-500 text-sm">Loading...</div> : sprints.length === 0 ? <div className="text-gray-500 text-sm">No active sprints found.</div> : (
                  <ul className="space-y-2">
                    {sprints.map(sprint => (
                      <li key={sprint.id} className="bg-[#111] border border-[#333] p-3 rounded-lg flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200 font-medium text-sm">{sprint.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#222] border border-[#444] text-gray-400">
                              {sprint.status}
                            </span>
                          </div>
                          {sprint.goal && <p className="text-xs text-gray-500 mt-1">{sprint.goal}</p>}
                          <div className="text-xs text-gray-600 mt-2">
                            {new Date(sprint.start_date).toLocaleDateString()} - {new Date(sprint.end_date).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleArchiveSprint(sprint.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Archive
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'epics' && (
            <div className="space-y-6">
              {/* Epic Form */}
              <form onSubmit={handleCreateEpic} className="bg-[#222] p-4 rounded-lg border border-[#333] space-y-4">
                <h3 className="text-sm font-medium text-gray-300">Create New Epic</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input
                      type="text"
                      required
                      value={epicName}
                      onChange={e => setEpicName(e.target.value)}
                      className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                      placeholder="e.g., Authentication Redesign"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={epicDesc}
                      onChange={e => setEpicDesc(e.target.value)}
                      className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                      placeholder="Brief description of the epic"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Color Theme</label>
                    <div className="flex gap-2">
                      {EPIC_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEpicColor(color)}
                          className={`w-6 h-6 rounded-full ${color} ${epicColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#222]' : 'opacity-60 hover:opacity-100'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                    Create Epic
                  </button>
                </div>
              </form>

              {/* Epic List */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-300">Active Epics</h3>
                {loading ? <div className="text-gray-500 text-sm">Loading...</div> : epics.length === 0 ? <div className="text-gray-500 text-sm">No active epics found.</div> : (
                  <ul className="space-y-2">
                    {epics.map(epic => (
                      <li key={epic.id} className="bg-[#111] border border-[#333] p-3 rounded-lg flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${epic.color}`}></span>
                            <span className="text-gray-200 font-medium text-sm">{epic.name}</span>
                          </div>
                          {epic.description && <p className="text-xs text-gray-500 mt-1">{epic.description}</p>}
                        </div>
                        <button
                          onClick={() => handleArchiveEpic(epic.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Archive
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
