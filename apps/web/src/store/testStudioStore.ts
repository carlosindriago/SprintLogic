import { create } from 'zustand';
import { TestDiscoveryItem, TestDiscoveryResult } from '@/lib/api';

interface TestStudioState {
  discovery: TestDiscoveryResult | null;
  loadingDiscovery: boolean;
  selectedFile: TestDiscoveryItem | null;
  generatedTest: string | null;
  isGenerating: boolean;
  activeMode: 'generate' | 'audit';
  isAuditing: boolean;
  auditReport: string | null;
  existingTestContent: string | null;

  setDiscovery: (discovery: TestDiscoveryResult | null) => void;
  setLoadingDiscovery: (loading: boolean) => void;
  setSelectedFile: (file: TestDiscoveryItem | null) => void;
  setGeneratedTest: (test: string | null) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setActiveMode: (mode: 'generate' | 'audit') => void;
  setIsAuditing: (isAuditing: boolean) => void;
  setAuditReport: (report: string | null) => void;
  setExistingTestContent: (content: string | null) => void;
}

export const useTestStudioStore = create<TestStudioState>((set) => ({
  discovery: null,
  loadingDiscovery: false,
  selectedFile: null,
  generatedTest: null,
  isGenerating: false,
  activeMode: 'generate',
  isAuditing: false,
  auditReport: null,
  existingTestContent: null,

  setDiscovery: (discovery) => set({ discovery }),
  setLoadingDiscovery: (loading) => set({ loadingDiscovery: loading }),
  setSelectedFile: (file) => set({ selectedFile: file }),
  setGeneratedTest: (test) => set({ generatedTest: test }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setActiveMode: (mode) => set({ activeMode: mode }),
  setIsAuditing: (isAuditing) => set({ isAuditing }),
  setAuditReport: (report) => set({ auditReport: report }),
  setExistingTestContent: (content) => set({ existingTestContent: content }),
}));
