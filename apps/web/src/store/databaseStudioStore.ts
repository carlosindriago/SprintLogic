import { create } from 'zustand';
import { SchemaIR, DBAuditResponse, SchemaDraft } from '@/lib/api';
import { Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

interface DatabaseStudioState {
  schema: SchemaIR | null;
  loading: boolean;
  loadingStatus: string;
  hasError: boolean;
  errorMessage: string;
  auditLoading: boolean;
  auditResult: DBAuditResponse | null;
  extractionMode: 'auto' | 'live' | 'static';
  customDbUrl: string;
  livePreviewSql: string;
  showLivePreview: boolean;
  hasUnsavedChanges: boolean;
  isApplying: boolean;
  drafts: SchemaDraft[];
  currentDraftId: string | null;
  isDrafting: boolean;
  migrationPlan: string | null;
  isGeneratingPlan: boolean;
  
  nodes: Node[];
  edges: Edge[];

  setSchema: (schema: SchemaIR | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadingStatus: (status: string) => void;
  setHasError: (hasError: boolean) => void;
  setErrorMessage: (msg: string) => void;
  setAuditLoading: (loading: boolean) => void;
  setAuditResult: (res: DBAuditResponse | null) => void;
  setExtractionMode: (mode: 'auto' | 'live' | 'static') => void;
  setCustomDbUrl: (url: string) => void;
  setLivePreviewSql: (sql: string) => void;
  setShowLivePreview: (show: boolean) => void;
  setHasUnsavedChanges: (has: boolean) => void;
  setIsApplying: (is: boolean) => void;
  setDrafts: (drafts: SchemaDraft[]) => void;
  setCurrentDraftId: (id: string | null) => void;
  setIsDrafting: (is: boolean) => void;
  setMigrationPlan: (plan: string | null) => void;
  setIsGeneratingPlan: (is: boolean) => void;

  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
}

export const useDatabaseStudioStore = create<DatabaseStudioState>((set, get) => ({
  schema: null,
  loading: false,
  loadingStatus: 'Intentando conectar a base de datos viva (Nivel 1)...',
  hasError: false,
  errorMessage: '',
  auditLoading: false,
  auditResult: null,
  extractionMode: 'auto',
  customDbUrl: '',
  livePreviewSql: '',
  showLivePreview: false,
  hasUnsavedChanges: false,
  isApplying: false,
  drafts: [],
  currentDraftId: null,
  isDrafting: false,
  migrationPlan: null,
  isGeneratingPlan: false,

  nodes: [],
  edges: [],

  setSchema: (schema) => set({ schema }),
  setLoading: (loading) => set({ loading }),
  setLoadingStatus: (loadingStatus) => set({ loadingStatus }),
  setHasError: (hasError) => set({ hasError }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setAuditLoading: (auditLoading) => set({ auditLoading }),
  setAuditResult: (auditResult) => set({ auditResult }),
  setExtractionMode: (extractionMode) => set({ extractionMode }),
  setCustomDbUrl: (customDbUrl) => set({ customDbUrl }),
  setLivePreviewSql: (livePreviewSql) => set({ livePreviewSql }),
  setShowLivePreview: (showLivePreview) => set({ showLivePreview }),
  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),
  setIsApplying: (isApplying) => set({ isApplying }),
  setDrafts: (drafts) => set({ drafts }),
  setCurrentDraftId: (currentDraftId) => set({ currentDraftId }),
  setIsDrafting: (isDrafting) => set({ isDrafting }),
  setMigrationPlan: (migrationPlan) => set({ migrationPlan }),
  setIsGeneratingPlan: (isGeneratingPlan) => set({ isGeneratingPlan }),

  setNodes: (nodesUpdater) => {
    set((state) => ({
      nodes: typeof nodesUpdater === 'function' ? nodesUpdater(state.nodes) : nodesUpdater,
    }));
  },
  setEdges: (edgesUpdater) => {
    set((state) => ({
      edges: typeof edgesUpdater === 'function' ? edgesUpdater(state.edges) : edgesUpdater,
    }));
  },
  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
}));
