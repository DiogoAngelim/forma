import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, Undo2, Redo2, Monitor, Tablet, Smartphone, 
  Play, Copy, Download, Globe, Loader2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { downloadProjectExport, fetchProjectPreviewHtml, publishProject, unpublishProject, updateProject, updateProjectOutput, type ExportType, type GeneratedProjectOutput } from "@/lib/project-api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function TopBar({
  projectId,
  projectName,
  projectStatus,
  state,
  output,
  projectMetadata,
}: {
  projectId: string;
  projectName: string;
  projectStatus?: string;
  state: any;
  output?: GeneratedProjectOutput;
  projectMetadata?: Record<string, unknown>;
}) {
  const { setBuilderState, undoBuilderState, redoBuilderState } = useStore();
  const queryClient = useQueryClient();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [publishSlug, setPublishSlug] = useState(() => slugifyProjectSlug(projectName, projectId));
  const [shareUrl, setShareUrl] = useState("");
  const [nameDraft, setNameDraft] = useState(projectName);
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>(() => normalizeTags(projectMetadata?.tags));
  const isPublished = projectStatus === "published";
  const snapshot = (value: GeneratedProjectOutput) => ({
    markup: value.markup ?? "",
    blocks: value.blocks ?? [],
    metadata: value.metadata,
  });

  useEffect(() => {
    setNameDraft(projectName);
  }, [projectName]);

  useEffect(() => {
    setTags(normalizeTags(projectMetadata?.tags));
  }, [projectMetadata?.tags]);

  const undo = async () => {
    const stack = state.outputUndoStack ?? [];
    const previous = stack.at(-1);
    if (!previous || !output) {
      undoBuilderState(projectId);
      return;
    }

    await updateProjectOutput(projectId, previous);
    setBuilderState(projectId, {
      outputUndoStack: stack.slice(0, -1),
      outputRedoStack: [...(state.outputRedoStack ?? []), snapshot(output)].slice(-20),
      selectedDesignElement: null,
      selectedElement: null,
    }, { history: false });
    await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
  };

  const redo = async () => {
    const stack = state.outputRedoStack ?? [];
    const next = stack.at(-1);
    if (!next || !output) {
      redoBuilderState(projectId);
      return;
    }

    await updateProjectOutput(projectId, next);
    setBuilderState(projectId, {
      outputRedoStack: stack.slice(0, -1),
      outputUndoStack: [...(state.outputUndoStack ?? []), snapshot(output)].slice(-20),
      selectedDesignElement: null,
      selectedElement: null,
    }, { history: false });
    await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
  };

  const openPreview = async () => {
    setBusyAction("preview");
    try {
      const html = await fetchProjectPreviewHtml(projectId);
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      toast({
        title: "Preview failed",
        description: error instanceof Error ? error.message : "Could not open this preview.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const runExport = async (type: ExportType) => {
    setBusyAction(type);
    try {
      const { result, blobUrl } = await downloadProjectExport(projectId, type);
      if (blobUrl) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = result.filename ?? exportFilename(type);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
      toast({
        title: "Export ready",
        description: result.filename ? `${result.filename} was generated.` : "The export artifact was generated.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Could not generate this export.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const runPublish = async () => {
    setBusyAction("publish");
    try {
      const slug = slugifyProjectSlug(publishSlug || projectName, projectId);
      await updateProject(projectId, { metadata: { tags } });
      const result = await publishProject(projectId, projectName, slug);
      setShareUrl(result.url);
      await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({
        title: "Project published",
        description: "It is now visible in the Forma showcase.",
      });
    } catch (error) {
      toast({
        title: "Publish failed",
        description: error instanceof Error ? error.message : "Could not publish this project.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const runUnpublish = async () => {
    setBusyAction("unpublish");
    try {
      await unpublishProject(projectId);
      await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({
        title: "Project unpublished",
        description: "It has been removed from the public showcase.",
      });
    } catch (error) {
      toast({
        title: "Unpublish failed",
        description: error instanceof Error ? error.message : "Could not unpublish this project.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const copyBuilderLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    toast({ title: "Link copied", description: "The builder link was copied to your clipboard." });
  };

  const copyShareLink = async () => {
    const url = shareUrl || window.location.href;
    await navigator.clipboard?.writeText(url);
    toast({ title: "Share link copied", description: "The link was copied to your clipboard." });
  };

  const saveProjectName = async () => {
    const nextName = nameDraft.trim();
    if (!nextName || nextName === projectName) return;

    try {
      await updateProject(projectId, { name: nextName });
      await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project renamed", description: "The builder title was updated." });
    } catch (error) {
      setNameDraft(projectName);
      toast({
        title: "Rename failed",
        description: error instanceof Error ? error.message : "Could not rename this project.",
        variant: "destructive",
      });
    }
  };

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-background/95 backdrop-blur z-50">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/"><ChevronLeft className="w-5 h-5" /></Link>
        </Button>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={saveProjectName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setNameDraft(projectName);
                  event.currentTarget.blur();
                }
              }}
              className="max-w-[220px] truncate rounded border border-transparent bg-transparent px-1 text-sm font-semibold outline-none hover:border-white/10 focus:border-primary focus:bg-white/5"
              aria-label="Project name"
            />
            <div className="w-1.5 h-1.5 rounded-full bg-primary" title="Unsaved changes" />
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Home / Index</span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void undo()}><Undo2 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void redo()}><Redo2 className="w-4 h-4" /></Button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <Button 
          variant="ghost" size="icon" 
          className={`h-7 w-7 ${state.viewport === 'desktop' ? 'bg-white/10 text-primary' : ''}`}
          onClick={() => setBuilderState(projectId, { viewport: 'desktop' })}
        ><Monitor className="w-4 h-4" /></Button>
        <Button 
          variant="ghost" size="icon" 
          className={`h-7 w-7 ${state.viewport === 'tablet' ? 'bg-white/10 text-primary' : ''}`}
          onClick={() => setBuilderState(projectId, { viewport: 'tablet' })}
        ><Tablet className="w-4 h-4" /></Button>
        <Button 
          variant="ghost" size="icon" 
          className={`h-7 w-7 ${state.viewport === 'mobile' ? 'bg-white/10 text-primary' : ''}`}
          onClick={() => setBuilderState(projectId, { viewport: 'mobile' })}
        ><Smartphone className="w-4 h-4" /></Button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <span className="text-xs font-mono w-12 text-center">{state.canvasZoom}%</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground hidden md:block">
          <span className="px-2 py-1 rounded bg-white/5 border border-white/10 mr-2">1200px</span>
        </div>
        <Button variant="ghost" className="gap-2" onClick={openPreview}>
          {busyAction === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Preview
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <Copy className="w-4 h-4" /> Share
            </Button>
          </DialogTrigger>
          <DialogContent className="border-white/10 bg-background sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Share project</DialogTitle>
              <DialogDescription>Share the builder workspace, or publish first to create a public project page.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <ActionButton
                icon={<Copy className="w-4 h-4" />}
                title="Copy builder link"
                description="Share direct access with collaborators who can sign in."
                onClick={copyBuilderLink}
              />
              <ActionButton
                icon={<Globe className="w-4 h-4" />}
                title={isPublished || shareUrl ? "Copy public link" : "Publish public page"}
                description={isPublished || shareUrl ? "Use the public showcase URL." : "Make the project publicly visible first."}
                busy={busyAction === "publish"}
                onClick={isPublished || shareUrl ? copyShareLink : runPublish}
              />
              <ActionButton
                icon={<Download className="w-4 h-4" />}
                title="Download Gutenberg ZIP"
                description="Generate the latest modified Gutenberg files."
                busy={busyAction === "plugin_zip"}
                onClick={() => runExport("plugin_zip")}
              />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 border-white/10">
              <Download className="w-4 h-4" /> Export
            </Button>
          </DialogTrigger>
          <DialogContent className="border-white/10 bg-background sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Export project</DialogTitle>
              <DialogDescription>Generate the latest edited output in the format you need.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <ActionButton
                icon={<Download className="w-4 h-4" />}
                title="Gutenberg plugin"
                description="Download a ready-to-install WordPress plugin ZIP."
                busy={busyAction === "plugin_zip"}
                onClick={() => runExport("plugin_zip")}
              />
              <ActionButton
                icon={<Download className="w-4 h-4" />}
                title="React package"
                description="Generate React JSX using the backend React exporter."
                busy={busyAction === "react"}
                onClick={() => runExport("react")}
              />
              <ActionButton
                icon={<Download className="w-4 h-4" />}
                title="Blocks JSON"
                description="Download structured Gutenberg block data."
                busy={busyAction === "blocks_only"}
                onClick={() => runExport("blocks_only")}
              />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white">{isPublished ? "Unpublish" : "Publish"}</Button>
          </DialogTrigger>
          <DialogContent className="border-white/10 bg-background sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{isPublished ? "Unpublish project" : "Publish project"}</DialogTitle>
              <DialogDescription>
                {isPublished ? "Remove this project from the public showcase." : "Choose a unique public slug before adding this project to the showcase."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              {isPublished ? (
                <ActionButton
                  icon={<Globe className="w-4 h-4" />}
                  title="Unpublish from showcase"
                  description="Remove the public Forma project page."
                  busy={busyAction === "unpublish"}
                  onClick={runUnpublish}
                />
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="project-publish-slug">
                    Public slug
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="project-publish-slug"
                      value={publishSlug}
                      onChange={(event) => setPublishSlug(event.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-foreground outline-none focus:border-primary"
                      placeholder="my-project"
                    />
                    <Button onClick={runPublish} disabled={busyAction === "publish"}>
                      {busyAction === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      Publish
                    </Button>
                  </div>
                  <div className="mt-3">
                    <label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="project-publish-tags">
                      Project tags
                    </label>
                    <TagEditor tags={tags} draft={tagDraft} onDraftChange={setTagDraft} onTagsChange={setTags} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Slugs are checked by the API and made unique automatically if needed.</p>
                </div>
              )}
              <ActionButton
                icon={<Copy className="w-4 h-4" />}
                title="Copy builder link"
                description="Copy this project workspace link without sending email."
                onClick={copyBuilderLink}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}

function TagEditor({
  tags,
  draft,
  onDraftChange,
  onTagsChange,
}: {
  tags: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
}) {
  const suggestions = ["landing", "saas", "dashboard", "portfolio", "ecommerce", "marketing", "wordpress", "agency"];
  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase().replace(/[^a-z0-9- ]+/g, "").replace(/\s+/g, "-");
    if (!tag || tags.includes(tag)) return;
    onTagsChange([...tags, tag].slice(0, 12));
    onDraftChange("");
  };

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button key={tag} type="button" className="rounded bg-primary/15 px-2 py-1 text-xs text-primary" onClick={() => onTagsChange(tags.filter((item) => item !== tag))}>
            {tag} x
          </button>
        ))}
        <input
          id="project-publish-tags"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(draft);
            }
            if (event.key === "Backspace" && !draft && tags.length) {
              onTagsChange(tags.slice(0, -1));
            }
          }}
          className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none"
          placeholder="Search or add tags"
        />
      </div>
      {draft.trim() && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
          {[...suggestions.filter((tag) => tag.includes(draft.toLowerCase()) && !tags.includes(tag)), draft].slice(0, 5).map((tag) => (
            <button key={tag} type="button" className="rounded border border-white/10 px-2 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground" onClick={() => addTag(tag)}>
              {tags.includes(tag) ? tag : `Add ${tag}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeTags(value: unknown) {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).slice(0, 12) : [];
}

function slugifyProjectSlug(value: string, projectId: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `project-${projectId.slice(0, 8)}`;
}

function exportFilename(type: ExportType) {
  if (type === "plugin_zip") return "gutenberg-plugin.zip";
  if (type === "react") return "react-export.zip";
  if (type === "blocks_only") return "blocks.json";
  return `${type}.json`;
}

function ActionButton({
  icon,
  title,
  description,
  busy,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-primary/50 hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-70"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-primary">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
