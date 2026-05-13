import { useState } from "react";
import type { CSSProperties } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Heart, Copy, MessageSquare, ChevronLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fetchPublicProject, hasApiAuthToken, reactToPublicProject, type GeneratedProjectOutput } from "@/lib/project-api";
import { toast } from "@/hooks/use-toast";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [sliderPos, setSliderPos] = useState(50);
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [comments, setComments] = useState<Array<{ name: string; text: string; time: string }>>(() => loadComments(id));
  const publicProjectQuery = useQuery({
    queryKey: ["public-project", id],
    queryFn: () => fetchPublicProject(id!),
    enabled: Boolean(id),
    retry: false,
  });
  
  // Mock data based on ID
  const hash = (id || "1").split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 2) % 360;
  const publicProject = publicProjectQuery.data;
  const title = publicProject?.title ?? "Orbit Workspace";
  const authorName = publicProject?.author?.name ?? "Marcus R.";
  const tags = normalizeTags(publicProject?.metadata?.tags);
  const generatedOutput = publicProject?.afterSnapshot;
  const livePreview = buildPublicPreviewDocument(generatedOutput, publicProject?.metadata);
  const originalPreview = buildPublicPreviewDocument(publicProject?.beforeSnapshot as GeneratedProjectOutput | undefined, publicProject?.metadata) ?? livePreview;
  const likeCount = formatCount(publicProject?.metadata?.likes) ?? "0";
  const copyPublicLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    toast({ title: "Link copied", description: "The public project link was copied." });
  };
  const toggleLike = async () => {
    if (!id) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    try {
      await reactToPublicProject(id, nextLiked);
      await queryClient.invalidateQueries({ queryKey: ["public-project", id] });
    } catch (error) {
      setLiked(!nextLiked);
      toast({
        title: "Could not update like",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };
  const addComment = () => {
    const text = commentDraft.trim();
    if (!text || !id) return;
    const nextComments = [{ name: "You", text, time: "Just now" }, ...comments];
    setComments(nextComments);
    setCommentDraft("");
    localStorage.setItem(`forma_project_comments_${id}`, JSON.stringify(nextComments));
  };
  
  return (
    <div className="flex-1 w-full bg-background">
      <div 
        className="w-full h-80 relative flex items-end p-8 md:p-16"
        style={{
          background: `linear-gradient(135deg, hsl(${hue1}, 70%, 20%), hsl(${hue2}, 70%, 5%))`
        }}
      >
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        
        <Button variant="ghost" asChild className="absolute top-6 left-6 text-white hover:bg-white/10">
          <Link href="/showcase"><ChevronLeft className="w-5 h-5 mr-2" /> Back to Gallery</Link>
        </Button>
        
        <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              {(tags.length ? tags : ["forma"]).map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-none">{tag}</Badge>
              ))}
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4">{title}</h1>
            <div className="flex items-center gap-4 text-white/80">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8 border border-white/20">
                  <AvatarFallback className="bg-primary text-white">{initials(authorName)}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-white">{authorName}</span>
              </div>
              <span>{publicProject?.createdAt ? `Published ${new Date(publicProject.createdAt).toLocaleString()}` : "Published recently"}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {hasApiAuthToken() && publicProject?.projectId && (
              <Button size="lg" className="bg-white text-black hover:bg-white/90 font-medium" asChild>
                <Link href={`/builder/${publicProject.projectId}`}>
                  <ExternalLink className="w-4 h-4 mr-2" /> Open Builder
                </Link>
              </Button>
            )}
            <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={toggleLike}>
              <Heart className={`w-4 h-4 mr-2 ${liked ? "fill-current text-primary" : ""}`} /> {likeCount}
            </Button>
            <div className="relative">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={copyPublicLink}>
                <Copy className="w-4 h-4 mr-2" /> Copy Link
              </Button>
              {copied && <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white">Copied</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          {/* Before/After Slider Mock */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">AI Transformation</h2>
            <p className="text-muted-foreground">Drag to compare the original project surface with the generated output.</p>
            
            <div 
              className="relative w-full h-[400px] rounded-xl overflow-hidden border border-white/10 select-none bg-zinc-900"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                setSliderPos((x / rect.width) * 100);
              }}
            >
              {/* After (Generated) */}
              <div className="absolute inset-0 flex items-center justify-center p-8 bg-zinc-900">
                {livePreview ? (
                  <iframe
                    title={`${title} generated preview`}
                    srcDoc={livePreview}
                    className="h-full w-full rounded border border-white/10 bg-white shadow-2xl"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  />
                ) : (
                  <PreviewSkeleton tone="after" />
                )}
              </div>
              
              {/* Before (Raw HTML) - Clipped */}
              <div 
                className="absolute inset-0 flex items-center justify-center p-8 bg-zinc-950 grayscale"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                {originalPreview ? (
                  <iframe
                    title={`${title} original preview`}
                    srcDoc={originalPreview}
                    className="h-full w-full rounded border border-white/10 bg-white shadow-2xl"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  />
                ) : (
                  <PreviewSkeleton tone="before" />
                )}
              </div>
              
              {/* Slider Handle */}
              <div 
                className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                  <div className="flex gap-1">
                    <div className="w-0.5 h-3 bg-black/30" />
                    <div className="w-0.5 h-3 bg-black/30" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Generated Elements */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Generated Elements</h2>
            <Tabs defaultValue="components">
              <TabsList className="bg-white/5 border border-white/10 mb-4">
                <TabsTrigger value="components">Components ({componentNames(generatedOutput).length})</TabsTrigger>
                <TabsTrigger value="colors">Colors ({styleColors(generatedOutput).length})</TabsTrigger>
                <TabsTrigger value="typography">Typography ({typographySpecs(generatedOutput).length})</TabsTrigger>
              </TabsList>
              <TabsContent value="components" className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {componentNames(generatedOutput).map((comp, i) => (
                  <div key={i} className="p-4 border border-white/10 rounded-xl bg-white/5 flex flex-col items-center justify-center gap-3 text-center h-32 hover:border-primary/50 transition-colors">
                    <div className="w-12 h-8 bg-white/10 rounded" />
                    <span className="text-sm font-medium">{comp}</span>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="colors" className="flex flex-wrap gap-4">
                {styleColors(generatedOutput).map((color, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-full border border-white/20 shadow-lg" style={{ backgroundColor: color }} />
                    <span className="text-xs font-mono text-muted-foreground">{color}</span>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="typography" className="space-y-4">
                {typographySpecs(generatedOutput).map((spec) => (
                  <div key={`${spec.label}-${spec.value}`} className="p-6 border border-white/10 rounded-xl bg-white/5">
                    <p className="mb-2" style={spec.style}>The quick brown fox jumps over the lazy dog.</p>
                    <p className="text-sm text-muted-foreground">{spec.label} • {spec.value}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <div className="space-y-8">
          {/* Creator Profile */}
          <div className="p-6 border border-white/10 rounded-xl bg-white/5 backdrop-blur-sm">
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="w-16 h-16 border-2 border-primary/50">
                <AvatarFallback className="bg-primary/20 text-primary text-xl">{initials(authorName)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-bold text-lg">{authorName}</h3>
                <p className="text-sm text-muted-foreground">{publicProject ? "Forma creator" : "Senior Product Designer"}</p>
              </div>
            </div>
            <p className="text-sm mb-6">
              {tags.length ? `Published in ${tags.join(", ")}.` : "Building clean, functional interfaces for complex SaaS applications."}
            </p>
            <Button className="w-full bg-white text-black hover:bg-white/90" onClick={copyPublicLink}>
              <Copy className="mr-2 h-4 w-4" /> Copy Link
            </Button>
          </div>

          {/* Comments */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> Comments ({comments.length})
            </h3>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Add a comment"
                className="min-h-20 w-full resize-none rounded-md border border-white/10 bg-background p-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={addComment} disabled={!commentDraft.trim()}>Post comment</Button>
              </div>
            </div>
            <div className="space-y-6">
              {comments.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-muted-foreground">
                  No comments yet. Start the conversation.
                </div>
              )}
              {comments.map((comment, i) => (
                <div key={i} className="flex gap-3">
                  <Avatar className="w-8 h-8 border border-white/10">
                    <AvatarFallback className="bg-white/10 text-xs">{comment.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-medium text-sm">{comment.name}</span>
                      <span className="text-xs text-muted-foreground">{comment.time}</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewSkeleton({ tone }: { tone: "before" | "after" }) {
  const soft = tone === "after" ? "bg-white/10" : "bg-zinc-800";
  const strong = tone === "after" ? "bg-primary/60" : "bg-zinc-700";

  return (
    <div className="w-full h-full border border-white/10 rounded bg-card shadow-2xl flex flex-col p-4 gap-4 opacity-70">
      <div className="flex justify-between items-center pb-4 border-b border-white/5">
        <div className={`w-24 h-6 rounded ${soft}`} />
        <div className="flex gap-4">
          <div className={`w-16 h-4 rounded ${soft}`} />
          <div className={`w-16 h-4 rounded ${soft}`} />
          <div className={`w-16 h-4 rounded ${soft}`} />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className={`w-64 h-12 rounded mx-auto ${soft}`} />
          <div className={`w-96 max-w-full h-6 rounded mx-auto ${soft}`} />
          <div className={`w-32 h-10 rounded mx-auto mt-8 ${strong}`} />
        </div>
      </div>
    </div>
  );
}

function buildPublicPreviewDocument(output?: GeneratedProjectOutput, metadata?: Record<string, unknown>) {
  const markup = output?.markup?.trim();
  if (!markup) return null;

  const remoteStyles = normalizeStringArray(metadata?.remoteStyles);
  const remoteScripts = normalizeStringArray(metadata?.remoteScripts);
  const head = [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    ...remoteStyles.map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}" />`),
  ].join("");
  const scripts = remoteScripts.map((src) => `<script src="${escapeAttribute(src)}"></script>`).join("");

  if (/<!doctype html|<html[\s>]/i.test(markup)) {
    return markup.replace("</head>", `${head}</head>`).replace("</body>", `${scripts}</body>`);
  }

  return `<!doctype html><html><head>${head}</head><body>${markup}${scripts}</body></html>`;
}

function componentNames(output?: GeneratedProjectOutput) {
  const blocks = Array.isArray(output?.blocks) ? output.blocks : [];
  const names = blocks
    .map((block, index) => {
      const candidate = block.title ?? block.name ?? block.label ?? block.slug;
      return typeof candidate === "string" && candidate.trim() ? candidate : `Block ${index + 1}`;
    })
    .slice(0, 6);

  return names.length ? names : ["Navbar", "Hero Section", "Feature Card", "Pricing Table", "Footer", "Button Group"];
}

function styleColors(output?: GeneratedProjectOutput) {
  const colors = (output?.metadata?.styleTokens as Record<string, unknown> | undefined)?.colors;
  const values = Array.isArray(colors) ? colors : colors && typeof colors === "object" ? Object.values(colors) : [];
  const normalized = values.map(String).filter(Boolean);
  return normalized.length ? normalized : ["#111827", "#2563eb", "#f8fafc"];
}

function typographySpecs(output?: GeneratedProjectOutput) {
  const styleTokens = output?.metadata?.styleTokens as Record<string, unknown> | undefined;
  const typography = styleTokens?.typography ?? styleTokens?.fonts;
  const specs: Array<{ label: string; value: string; style: CSSProperties }> = [];

  if (typography && typeof typography === "object") {
    for (const [label, rawValue] of Object.entries(typography as Record<string, unknown>)) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      values.forEach((value) => {
        if (typeof value !== "string" && typeof value !== "number") return;
        const stringValue = String(value);
        specs.push({ label: titleCase(label), value: stringValue, style: typographyStyle(label, stringValue) });
      });
    }
  }

  return specs.length ? specs.slice(0, 8) : [
    { label: "Font size", value: "32px", style: { fontSize: "32px", fontWeight: 700 } },
    { label: "Font family", value: "Inter", style: { fontFamily: "Inter, system-ui, sans-serif" } },
  ];
}

function typographyStyle(label: string, value: string): CSSProperties {
  const normalized = label.toLowerCase();
  if (normalized.includes("famil")) return { fontFamily: value };
  if (normalized.includes("size")) return { fontSize: value };
  if (normalized.includes("weight")) return { fontWeight: value };
  if (normalized.includes("height")) return { lineHeight: value };
  return {};
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 4) : [];
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function formatCount(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value > 999) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "F";
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function loadComments(slug: string | undefined) {
  if (!slug) return [];
  try {
    const stored = localStorage.getItem(`forma_project_comments_${slug}`);
    return stored ? JSON.parse(stored) as Array<{ name: string; text: string; time: string }> : [];
  } catch {
    return [];
  }
}
