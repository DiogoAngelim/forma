import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UploadCloud, Link as LinkIcon, FileArchive, CheckCircle2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { createProject, importProjectUrl, uploadProjectBundle, type GeneratedProjectOutput } from "@/lib/project-api";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@/store";
import { importStats, previewImageFromOutput } from "@/lib/project-stats";

export default function UploadModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const addProject = useStore((state) => state.addProject);
  const [stage, setStage] = useState<"upload" | "analyzing" | "results">("upload");
  const [progress, setProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [urlDraft, setUrlDraft] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [output, setOutput] = useState<GeneratedProjectOutput | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [fileSummary, setFileSummary] = useState("");
  
  const steps = [
    "Extracting structure...",
    "Detecting color tokens...",
    "Analyzing typography...",
    "Identifying components...",
    "Generating patterns...",
    "Building asset library..."
  ];

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setStage("upload");
      setProgress(0);
      setAnalysisStep(0);
      setUrlDraft("");
      setCreatedProjectId(null);
      setOutput(null);
      setIsImporting(false);
      setFileSummary("");
    }
  }, [open]);

  const startAnalysis = async (runner: () => Promise<{ projectId: string; output: GeneratedProjectOutput }>) => {
    setStage("analyzing");
    setIsImporting(true);
    let currentProgress = 0;
    let currentStep = 0;
    
    const interval = setInterval(() => {
      currentProgress = Math.min(currentProgress + Math.random() * 6, 92);
      
      setProgress(currentProgress);
      
      const stepIndex = Math.floor((currentProgress / 100) * steps.length);
      if (stepIndex !== currentStep && stepIndex < steps.length) {
        currentStep = stepIndex;
        setAnalysisStep(currentStep);
      }
      
    }, 150);

    try {
      const result = await runner();
      clearInterval(interval);
      setCreatedProjectId(result.projectId);
      setOutput(result.output);
      setProgress(100);
      setAnalysisStep(steps.length - 1);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setTimeout(() => setStage("results"), 350);
    } catch (error) {
      clearInterval(interval);
      setStage("upload");
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import this project.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const importFiles = (files: FileList | null) => {
    const fileList = Array.from(files ?? []);
    if (!fileList.length || isImporting) return;

    const firstName = fileList[0]?.name ?? "Project";
    const projectName = titleFromFileName(firstName);
    setFileSummary(fileList.length === 1 ? firstName : `${fileList.length} files selected`);
    void startAnalysis(async () => {
      const project = await createProject(projectName, { importKind: "upload" });
      const importedOutput = await uploadProjectBundle(project.id, fileList);
      addProject({
        id: project.id,
        name: project.name,
        status: "draft",
        lastModified: "Just now",
        thumbnail: previewImageFromOutput(importedOutput),
        views: 0,
        likes: 0,
        isPublic: false,
        tags: [],
        collaborators: 1,
      });
      return { projectId: project.id, output: importedOutput };
    });
  };

  const importUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed || isImporting) return;

    void startAnalysis(async () => {
      const url = new URL(trimmed);
      const project = await createProject(url.hostname, { importKind: "url", sourceUrl: url.toString() });
      const importedOutput = await importProjectUrl(project.id, url.toString());
      addProject({
        id: project.id,
        name: project.name,
        status: "draft",
        lastModified: "Just now",
        thumbnail: previewImageFromOutput(importedOutput),
        views: 0,
        likes: 0,
        isPublic: false,
        tags: ["url-import"],
        collaborators: 1,
      });
      return { projectId: project.id, output: importedOutput };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 border-white/10 bg-background/95 backdrop-blur-xl overflow-hidden">
        <DialogTitle className="sr-only">Import Project</DialogTitle>
        <DialogDescription className="sr-only">Upload HTML, ZIP, or paste a URL to import a project.</DialogDescription>
        
        <AnimatePresence mode="wait">
          {stage === "upload" && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}
              className="p-8"
            >
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold">Import Project</h2>
                <p className="text-muted-foreground mt-2">Let Forma's AI analyze and convert your design into editable blocks.</p>
              </div>
              
              <div 
                className="border-2 border-dashed border-white/20 rounded-2xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary/50 transition-colors bg-white/5"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  importFiles(event.dataTransfer.files);
                }}
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <UploadCloud className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Drop your files here</h3>
                <p className="text-sm text-muted-foreground mb-6">Supports .html, .css, .zip or complete folders</p>
                <Button className="bg-primary hover:bg-primary/90 text-white">Select Files</Button>
                {fileSummary && <p className="mt-3 text-xs text-primary">{fileSummary}</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".html,.htm,.css,.js,.json,.zip,image/*,font/*"
                className="hidden"
                onChange={(event) => importFiles(event.currentTarget.files)}
              />
              
              <div className="grid grid-cols-1 gap-4 mt-6 md:grid-cols-[1fr_auto]">
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3">
                  <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        importUrl();
                      }
                    }}
                    placeholder="Paste a public URL"
                    className="border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
                <Button variant="outline" className="border-white/10" onClick={importUrl} disabled={!urlDraft.trim() || isImporting}>
                  Import URL
                </Button>
              </div>
              <Button variant="outline" className="mt-4 h-14 w-full border-white/10 flex gap-2 items-center justify-center" onClick={() => fileInputRef.current?.click()}>
                  <FileArchive className="w-5 h-5" />
                  <span className="text-xs">Upload ZIP or folder files</span>
              </Button>
            </motion.div>
          )}

          {stage === "analyzing" && (
            <motion.div 
              key="analyzing"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="p-12 text-center"
            >
              <div className="w-24 h-24 mx-auto mb-8 relative">
                <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle 
                    cx="48" cy="48" r="46" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="4" 
                    className="text-primary transition-all duration-300 ease-out"
                    strokeDasharray="289"
                    strokeDashoffset={289 - (progress / 100) * 289}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold">{Math.round(progress)}%</span>
                </div>
              </div>
              
              <h3 className="text-xl font-bold mb-6">AI Analysis in Progress</h3>
              
              <div className="space-y-3 text-left max-w-sm mx-auto">
                {steps.map((step, i) => (
                  <div key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${i > analysisStep ? 'opacity-20' : i === analysisStep ? 'opacity-100' : 'opacity-60'}`}>
                    {i < analysisStep ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : i === analysisStep ? (
                      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-white/20" />
                    )}
                    <span className={i === analysisStep ? "text-foreground font-medium" : "text-muted-foreground"}>{step}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {stage === "results" && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="p-8"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-bold">Analysis Complete</h2>
                <p className="text-muted-foreground mt-2">Your project is ready to edit in Forma.</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "Components", value: String(importStats(output).components) },
                  { label: "Color Tokens", value: String(importStats(output).colorTokens) },
                  { label: "Font Styles", value: String(importStats(output).fontStyles) },
                  { label: "Assets", value: String(importStats(output).assets) },
                ].map((stat, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-primary mb-1">{stat.value}</p>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
              
              <Button 
                className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white group"
                onClick={() => {
                  const projectId = createdProjectId;
                  if (!projectId) return;
                  onOpenChange(false);
                  setLocation(`/builder/${projectId}`);
                }}
              >
                Open in Builder
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function titleFromFileName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Untitled Project";
}
