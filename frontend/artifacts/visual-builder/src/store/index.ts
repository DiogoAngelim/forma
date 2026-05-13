import { create } from 'zustand';

export type ProjectStatus = "active" | "published" | "draft";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  lastModified: string;
  thumbnail: string | null;
  views: number;
  likes: number;
  isPublic: boolean;
  tags: string[];
  collaborators: number;
}

export interface User {
  name: string;
  email: string;
  avatar: string | null;
  plan: string;
  joinDate: string;
}

export interface BuilderState {
  selectedElement: string | null;
  selectedColorToken?: { value: string; original: string; label?: string } | null;
  selectedSourceFile?: string | null;
  selectedGeneratedPreview?: unknown;
  selectedDesignElement?: unknown;
  linkVisit?: unknown;
  previewScroll?: { x: number; y: number };
  blockScrollTarget?: string;
  blockScrollRequest?: number;
  blockOrder?: string[];
  outputUndoStack?: Array<{ markup: string; blocks: Array<Record<string, unknown>>; metadata?: Record<string, unknown> }>;
  outputRedoStack?: Array<{ markup: string; blocks: Array<Record<string, unknown>>; metadata?: Record<string, unknown> }>;
  canvasZoom: number;
  canvasGrid: boolean;
  viewport: "desktop" | "tablet" | "mobile";
  leftPanelTab: "blocks" | "files" | "styles" | "assets";
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  elements: any[];
  aiSuggestions: any[];
}

interface AppState {
  projects: Project[];
  user: User;
  builderStates: Record<string, BuilderState>;
  builderHistory: Record<string, { past: BuilderState[]; future: BuilderState[] }>;
  setBuilderState: (projectId: string, state: Partial<BuilderState>, options?: { history?: boolean }) => void;
  undoBuilderState: (projectId: string) => void;
  redoBuilderState: (projectId: string) => void;
  setUser: (user: Partial<User>) => void;
  setProjects: (projects: Project[]) => void;
  removeProject: (projectId: string) => void;
  addProject: (project: Project) => void;
}

const initialProjects: Project[] = [
  { id: "p1", name: "Acme Corp Rebrand", status: "active", lastModified: "2h ago", thumbnail: null, views: 2847, likes: 143, isPublic: true, tags: ["branding", "enterprise"], collaborators: 3 },
  { id: "p2", name: "TechFlow Landing", status: "published", lastModified: "1d ago", thumbnail: null, views: 5120, likes: 287, isPublic: true, tags: ["saas", "landing"], collaborators: 1 },
  { id: "p3", name: "Nexus Dashboard", status: "draft", lastModified: "3d ago", thumbnail: null, views: 891, likes: 56, isPublic: false, tags: ["dashboard", "b2b"], collaborators: 2 },
  { id: "p4", name: "Bloom E-commerce", status: "active", lastModified: "5h ago", thumbnail: null, views: 3210, likes: 178, isPublic: true, tags: ["ecommerce", "retail"], collaborators: 4 },
  { id: "p5", name: "DataViz Pro", status: "published", lastModified: "2d ago", thumbnail: null, views: 7854, likes: 412, isPublic: true, tags: ["analytics", "saas"], collaborators: 2 },
  { id: "p6", name: "Studio Portfolio", status: "draft", lastModified: "1w ago", thumbnail: null, views: 445, likes: 29, isPublic: false, tags: ["portfolio", "creative"], collaborators: 1 },
];

const initialBuilderState: BuilderState = {
  selectedElement: null,
  canvasZoom: 100,
  canvasGrid: false,
  viewport: "desktop",
  leftPanelTab: "blocks",
  leftPanelOpen: true,
  rightPanelOpen: true,
  elements: [],
  aiSuggestions: [],
};

export const useStore = create<AppState>((set) => ({
  projects: initialProjects,
  user: { name: "Alex Chen", email: "alex@forma.io", avatar: null, plan: "Pro", joinDate: "Jan 2024" },
  builderStates: {},
  builderHistory: {},
  setUser: (user) => set((prev) => ({ user: { ...prev.user, ...user } })),
  setProjects: (projects) => set({ projects }),
  removeProject: (projectId) => set((prev) => ({ projects: prev.projects.filter((project) => project.id !== projectId) })),
  addProject: (project) => set((prev) => ({ projects: [project, ...prev.projects.filter((item) => item.id !== project.id)] })),
  setBuilderState: (projectId, state, options) => set((prev) => {
    const current = prev.builderStates[projectId] || initialBuilderState;
    const next = { ...current, ...state };
    const history = prev.builderHistory[projectId] ?? { past: [], future: [] };
    const shouldRecord = options?.history !== false;

    return {
      builderStates: {
        ...prev.builderStates,
        [projectId]: next,
      },
      builderHistory: shouldRecord
        ? {
            ...prev.builderHistory,
            [projectId]: {
              past: [...history.past.slice(-49), current],
              future: [],
            },
          }
        : prev.builderHistory,
    };
  }),
  undoBuilderState: (projectId) => set((prev) => {
    const history = prev.builderHistory[projectId] ?? { past: [], future: [] };
    const previous = history.past.at(-1);
    if (!previous) return prev;

    const current = prev.builderStates[projectId] || initialBuilderState;
    return {
      builderStates: { ...prev.builderStates, [projectId]: previous },
      builderHistory: {
        ...prev.builderHistory,
        [projectId]: {
          past: history.past.slice(0, -1),
          future: [current, ...history.future].slice(0, 50),
        },
      },
    };
  }),
  redoBuilderState: (projectId) => set((prev) => {
    const history = prev.builderHistory[projectId] ?? { past: [], future: [] };
    const next = history.future[0];
    if (!next) return prev;

    const current = prev.builderStates[projectId] || initialBuilderState;
    return {
      builderStates: { ...prev.builderStates, [projectId]: next },
      builderHistory: {
        ...prev.builderHistory,
        [projectId]: {
          past: [...history.past, current].slice(-50),
          future: history.future.slice(1),
        },
      },
    };
  }),
}));
