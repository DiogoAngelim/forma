import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useStore } from "@/store";
import TopBar from "@/components/builder/TopBar";
import LeftSidebar from "@/components/builder/LeftSidebar";
import Canvas from "@/components/builder/Canvas";
import RightInspector from "@/components/builder/RightInspector";
import AISuggestionPanel from "@/components/builder/AISuggestionPanel";
import {
  fetchProject,
  fetchProjectOutput,
  fetchProjectSourceFiles,
  hasApiAuthToken,
  projectPreviewUrl,
  projectSourceBaseUrl,
} from "@/lib/project-api";

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const { builderStates, setBuilderState, undoBuilderState, redoBuilderState, projects } = useStore();
  
  // Initialize state for this project if it doesn't exist
  useEffect(() => {
    if (id && !builderStates[id]) {
      setBuilderState(id, {});
    }
  }, [id, builderStates, setBuilderState]);

  useEffect(() => {
    if (!id) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        setBuilderState(id, { selectedElement: null, selectedSourceFile: null, selectedGeneratedPreview: null, selectedDesignElement: null, selectedColorToken: null }, { history: false });
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }

      if (isEditing) return;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoBuilderState(id);
        else undoBuilderState(id);
        return;
      }

      if (meta && event.key.toLowerCase() === "r") {
        event.preventDefault();
        redoBuilderState(id);
        return;
      }

      if (meta && ["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === "-" ? -10 : 10;
        const current = builderStates[id]?.canvasZoom ?? 100;
        setBuilderState(id, { canvasZoom: Math.min(200, Math.max(25, current + direction)) }, { history: false });
        return;
      }

      if (meta && event.key === "0") {
        event.preventDefault();
        setBuilderState(id, { canvasZoom: 100 }, { history: false });
        return;
      }

      if (event.shiftKey && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        const viewport = event.key === "1" ? "desktop" : event.key === "2" ? "tablet" : "mobile";
        setBuilderState(id, { viewport }, { history: false });
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setBuilderState(id, { leftPanelOpen: !(builderStates[id]?.leftPanelOpen ?? true) }, { history: false });
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setBuilderState(id, { rightPanelOpen: !(builderStates[id]?.rightPanelOpen ?? true) }, { history: false });
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        setBuilderState(id, { selectedElement: null, selectedGeneratedPreview: null, selectedDesignElement: null, selectedColorToken: null }, { history: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [builderStates, id, redoBuilderState, setBuilderState, undoBuilderState]);

  const state = builderStates[id] || {
    selectedElement: null,
    canvasZoom: 100,
    canvasGrid: false,
    viewport: "desktop",
    leftPanelTab: "files",
    leftPanelOpen: true,
    rightPanelOpen: true,
    elements: [],
    aiSuggestions: [],
  };
  const canUseApi = Boolean(id && hasApiAuthToken());
  const projectQuery = useQuery({
    queryKey: [`/api/projects/${id}`],
    queryFn: () => fetchProject(id!),
    enabled: canUseApi,
    retry: false,
  });
  const outputQuery = useQuery({
    queryKey: ["project-output", id],
    queryFn: () => fetchProjectOutput(id!),
    enabled: canUseApi,
    retry: false,
  });
  const sourceFilesQuery = useQuery({
    queryKey: ["project-source-files", id],
    queryFn: () => fetchProjectSourceFiles(id!),
    enabled: canUseApi,
    retry: false,
  });
  const mockProject = projects.find(p => p.id === id);
  const project = projectQuery.data ?? mockProject ?? { name: "Untitled Project", metadata: {} };
  const projectMetadata = "metadata" in project && project.metadata ? project.metadata : {};
  const projectStatus = "status" in project ? project.status : undefined;
  const previewUrl = canUseApi && outputQuery.data ? projectPreviewUrl(id!) : undefined;

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <TopBar projectId={id!} projectName={project.name} projectStatus={projectStatus} state={state} output={outputQuery.data} projectMetadata={projectMetadata} />
      
      <div className="flex-1 flex overflow-hidden relative">
        <ResizablePanelGroup direction="horizontal">
          
          {state.leftPanelOpen && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="border-r border-white/10 bg-sidebar flex">
                <LeftSidebar
                  projectId={id!}
                  state={state}
                  output={outputQuery.data}
                  sourceFiles={sourceFilesQuery.data}
                  sourceBaseUrl={canUseApi ? projectSourceBaseUrl(id!) : null}
                  projectMetadata={projectMetadata}
                />
              </ResizablePanel>
              <ResizableHandle className="w-1 bg-transparent hover:bg-primary/50 transition-colors" />
            </>
          )}
          
          <ResizablePanel defaultSize={60} className="relative bg-zinc-950 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at center, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
            <Canvas projectId={id!} state={state} previewUrl={previewUrl} output={outputQuery.data} />
            <AISuggestionPanel projectId={id!} />
          </ResizablePanel>
          
          {state.rightPanelOpen && (
            <>
              <ResizableHandle className="w-1 bg-transparent hover:bg-primary/50 transition-colors" />
              <ResizablePanel defaultSize={20} minSize={20} maxSize={30} className="border-l border-white/10 bg-sidebar overflow-y-auto">
                <RightInspector projectId={id!} state={state} output={outputQuery.data} />
              </ResizablePanel>
            </>
          )}
          
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
