import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Global LLM configuration store.
 *
 * Holds the active default model (consumed by every LLM-touching component,
 * e.g. SprintLogicChat, future commit-message generator, etc.) so that
 * configuration changes propagate without prop-drilling.
 *
 * API keys NEVER live here. They are stored in the OS keyring via the
 * backend; the frontend only knows whether a key is configured for a
 * provider, never its value.
 */

export const DEFAULT_MODEL = 'gemini/gemini-2.5-flash';

interface LLMConfigState {
  defaultModel: string;
  setDefaultModel: (model: string) => void;
  isLoaded: boolean;
  setLoaded: (loaded: boolean) => void;
  context7ApiKey: string;
  setContext7ApiKey: (key: string) => void;
}

export const useLLMConfigStore = create<LLMConfigState>()(
  persist(
    (set) => ({
      defaultModel: DEFAULT_MODEL,
      setDefaultModel: (model) => set({ defaultModel: model }),
      isLoaded: false,
      setLoaded: (loaded) => set({ isLoaded: loaded }),
      context7ApiKey: '',
      setContext7ApiKey: (key) => set({ context7ApiKey: key }),
    }),
    {
      name: 'sprintlogic-llm-config',
      partialize: (state) => ({
        defaultModel: state.defaultModel,
        context7ApiKey: state.context7ApiKey,
      }),
    },
  ),
);
