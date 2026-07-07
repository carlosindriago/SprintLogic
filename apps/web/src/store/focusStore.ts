import { create } from 'zustand';

type FocusTarget = 'editor' | 'explorer';

interface FocusState {
  target: FocusTarget | null;
  version: number;
  triggerFocus: (target: FocusTarget) => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  target: null,
  version: 0,
  triggerFocus: (target) => set({ target, version: Date.now() }),
}));
