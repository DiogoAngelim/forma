import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Check, AlertTriangle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyAiSuggestion, fetchAiStatus, fetchAiSuggestions, hasApiAuthToken } from "@/lib/project-api";
import { toast } from "@/hooks/use-toast";

export default function AISuggestionPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(true);
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: fetchAiStatus,
    enabled: hasApiAuthToken(),
    retry: false,
  });
  const suggestionsQuery = useQuery({
    queryKey: ["ai-suggestions", projectId],
    queryFn: () => fetchAiSuggestions(projectId),
    enabled: hasApiAuthToken() && statusQuery.data?.enabled === true,
    retry: false,
  });
  const [localPrompts, setLocalPrompts] = useState([
    {
      id: 1,
      title: "Tighten the hero",
      prompt: "Make the hero sharper and more conversion-focused while keeping the current layout and visual hierarchy.",
      type: "warning",
      confidence: 91,
      applied: false
    },
    {
      id: 2,
      title: "Improve contrast",
      prompt: "Audit the primary CTA and supporting text for contrast, then adjust colors without changing the brand feel.",
      type: "error",
      confidence: 88,
      applied: false
    },
    {
      id: 3,
      title: "Extract reusable cards",
      prompt: "Turn the repeated feature cards into a reusable block pattern with editable title, body, and icon fields.",
      type: "info",
      confidence: 83,
      applied: false
    },
  ]);
  const prompts = suggestionsQuery.data?.length
    ? suggestionsQuery.data.map((suggestion) => ({
        id: suggestion.id,
        title: suggestion.title,
        prompt: suggestion.rationale ?? "Apply this AI-generated project fix.",
        type: suggestion.priority === "high" ? "error" : suggestion.priority === "medium" ? "warning" : "info",
        confidence: suggestion.autoApplicable || suggestion.auto_applicable ? 91 : 72,
        applied: suggestion.status === "applied",
        real: true,
      }))
    : statusQuery.data?.enabled ? localPrompts : [];

  if (statusQuery.data && !statusQuery.data.enabled) {
    return null;
  }

  if (!open) {
    return (
      <Button 
        size="icon" 
        className="absolute bottom-6 right-6 z-50 rounded-full shadow-2xl bg-primary hover:bg-primary/90 text-white w-12 h-12"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="w-5 h-5" />
      </Button>
    );
  }

  const handleApply = async (id: number | string) => {
    const prompt = prompts.find((item) => item.id === id);
    if (prompt && "real" in prompt && prompt.real && hasApiAuthToken()) {
      try {
        await applyAiSuggestion(projectId, String(id));
        await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
        await queryClient.invalidateQueries({ queryKey: ["ai-suggestions", projectId] });
        toast({ title: "AI fix applied", description: "The generated files and preview were updated." });
      } catch (error) {
        toast({
          title: "AI fix failed",
          description: error instanceof Error ? error.message : "Could not apply this fix.",
          variant: "destructive",
        });
      }
      return;
    }

    setLocalPrompts(prev => prev.map(s => s.id === id ? { ...s, applied: true } : s));
  };

  const activeCount = prompts.filter(s => !s.applied).length;

  if (activeCount === 0) {
    return (
      <Button 
        size="icon" 
        className="absolute bottom-6 right-6 z-50 rounded-full shadow-2xl bg-green-500 hover:bg-green-600 text-white w-12 h-12"
        onClick={() => setOpen(false)}
      >
        <Check className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="absolute bottom-6 right-6 z-50 w-80 bg-background/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl overflow-hidden"
    >
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-primary/10">
        <div className="flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-primary">AI Prompts</span>
          <span className="bg-primary text-white text-[10px] px-1.5 rounded-full">{activeCount}</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
        <AnimatePresence>
          {prompts.filter(s => !s.applied).map(prompt => (
            <motion.div 
              key={prompt.id}
              exit={{ opacity: 0, height: 0, scale: 0.9 }}
              className="p-3 bg-white/5 border border-white/5 rounded-lg text-sm"
            >
              <div className="flex items-start gap-2 mb-2">
                {prompt.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> : 
                 prompt.type === 'warning' ? <div className="w-4 h-4 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0">!</div> :
                 <div className="w-4 h-4 rounded-full bg-blue-400/20 text-blue-400 flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0">i</div>}
                <div className="min-w-0 space-y-1">
                  <p className="font-medium leading-snug">{prompt.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{prompt.prompt}</p>
                </div>
              </div>
              
              <div className="pl-6 mb-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Readiness</span>
                  <span>{prompt.confidence}%</span>
                </div>
                <div className="h-1 w-full bg-black rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${prompt.confidence}%` }} />
                </div>
              </div>
              
              <div className="flex gap-2 pl-6">
                <Button size="sm" className="h-7 text-xs bg-white/10 hover:bg-primary hover:text-white" onClick={() => handleApply(prompt.id)}>Run Prompt</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleApply(prompt.id)}>Dismiss</Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
