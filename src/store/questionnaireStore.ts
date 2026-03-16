import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Purpose = 'gaming' | 'content-creation' | 'office' | 'ml-ai' | 'streaming' | 'coding' | 'student' | 'general';
export type DeviceType = 'pc' | 'laptop';
export type Resolution = '1080p' | '1440p' | '4k';

export interface QuestionnaireAnswers {
  // Step 1, 2, 3 (Preserved)
  deviceType: DeviceType | null;
  purpose: Purpose | null;
  budget: number | null;

  // PC Specific (Steps 4+) — Redesigned
  targetResolution?: '1080p' | '1440p' | '4k' | null;
  cpuBrandPreference?: 'intel' | 'amd' | 'no-preference' | null;
  upgradabilityPriority?: 'future-proof' | 'balanced' | 'budget-tight' | null;
  ramRequirement?: '8gb' | '16gb' | '32gb-plus' | null;
  pcFormFactor?: 'compact' | 'mid-tower' | 'full-tower' | null;
  pcVisualStyle?: 'stealth' | 'white' | 'rgb' | null;

  // Laptop Specific (Steps 4+)
  displayType?: 'standard-ips' | 'vibrant-oled' | 'high-hertz' | null;
  screenSize?: 'compact' | 'standard' | 'large' | null;
  mobility?: 'stationary' | 'balanced' | 'on-the-go' | null;
  buildMaterial?: 'budget-plastic' | 'premium-metal' | 'no-preference' | null;
  storageSize?: 'basic' | 'ample' | 'massive' | 'no-preference' | null;
  laptopBrandPreference?: string[];

  // Legacy/Other (Internal use)
  brandPreference: string[];
  resolution: Resolution | null;
}

interface QuestionnaireState {
  currentStep: number;
  answers: QuestionnaireAnswers;
  isComplete: boolean;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setAnswer: <K extends keyof QuestionnaireAnswers>(key: K, value: QuestionnaireAnswers[K]) => void;
  reset: () => void;
  complete: () => void;
}

const initialAnswers: QuestionnaireAnswers = {
  deviceType: null,
  purpose: null,
  budget: null,
  brandPreference: [],
  resolution: null,
  // PC
  targetResolution: null,
  cpuBrandPreference: null,
  upgradabilityPriority: null,
  ramRequirement: null,
  pcFormFactor: null,
  pcVisualStyle: null,
  // Laptop
  displayType: null,
  screenSize: null,
  mobility: null,
  buildMaterial: null,
  storageSize: null,
  laptopBrandPreference: [],
};

export const useQuestionnaireStore = create<QuestionnaireState>()(
  persist(
    (set) => ({
      currentStep: 0,
      answers: initialAnswers,
      isComplete: false,
      setStep: (step) => set({ currentStep: step }),
      nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
      prevStep: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),
      setAnswer: (key, value) =>
        set((state) => ({
          answers: { ...state.answers, [key]: value },
        })),
      reset: () => set({ currentStep: 0, answers: initialAnswers, isComplete: false }),
      complete: () => set({ isComplete: true }),
    }),
    {
      name: 'chipchart-questionnaire',
      storage: createJSONStorage(() => localStorage),
      // Only persist answers + isComplete, not currentStep
      partialize: (state) => ({ answers: state.answers, isComplete: state.isComplete }),
    }
  )
);
