import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "@/store";
import {
  ChevronRight,
  Code2,
  File,
  FileCode2,
  FileImage,
  GripVertical,
  Folder,
  Image as ImageIcon,
  Palette,
  Plus,
  SlidersHorizontal,
  Type,
  Upload,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { updateProject, updateProjectOutput, uploadProjectSourceFiles, type GeneratedProjectOutput, type ProjectSourceFiles } from "@/lib/project-api";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type SourceFile = ProjectSourceFiles["files"][number];
type GeneratedPreview = {
  id: string;
  type: "block" | "style" | "asset";
  label: string;
  html?: string;
  source?: string;
  assetUrl?: string;
};

type MetadataAsset = {
  id?: string;
  kind?: string;
  source?: "local" | "remote";
  path?: string;
  url?: string;
  mime?: string;
  size?: number;
};

type TypographyKind = "family" | "size" | "lineHeight" | "weight" | "generic";
type TypographyGroup = {
  label: string;
  kind: TypographyKind;
  items: Array<{ label: string; value: string; kind: TypographyKind }>;
};

const tabs = [
  { id: "files", icon: File, label: "Blocks & Files" },
  { id: "styles", icon: Palette, label: "Styles" },
  { id: "assets", icon: ImageIcon, label: "Assets" },
] as const;

export default function LeftSidebar({
  projectId,
  state,
  output,
  sourceFiles,
  sourceBaseUrl,
  projectMetadata,
}: {
  projectId: string;
  state: any;
  output?: GeneratedProjectOutput;
  sourceFiles?: ProjectSourceFiles;
  sourceBaseUrl?: string | null;
  projectMetadata?: Record<string, unknown>;
}) {
  const { setBuilderState } = useStore();
  const queryClient = useQueryClient();
  const [draggingBlockPath, setDraggingBlockPath] = useState<string | null>(null);
  const files = useMemo(() => [...(sourceFiles?.files ?? [])], [sourceFiles?.files]);
  const sortedFiles = useMemo(() => [...files].sort((a, b) => a.path.localeCompare(b.path)), [files]);
  const htmlFiles = useMemo(() => orderBlockFiles(files.filter(isHtmlFile), state.blockOrder, output), [files, output, state.blockOrder]);
  const styleFiles = sortedFiles.filter(isStyleFile);
  const assetFiles = sortedFiles.filter(isAssetFile);
  const codeFiles = sortedFiles.filter((file) => isScriptFile(file) || isDataFile(file));
  const styleTokens = output?.metadata?.styleTokens as Record<string, unknown> | undefined;
  const metadataAssets = normalizeMetadataAssets(output?.metadata?.assets);
  const colors = normalizeColors(styleTokens);
  const typography = normalizeTypography(styleTokens);
  const remoteAssets = metadataAssets.filter((asset) => asset.source === "remote");
  const metadataLocalAssetPaths = new Set(metadataAssets.filter((asset) => asset.source === "local").map((asset) => asset.path).filter(Boolean));
  const visibleAssetFiles = assetFiles.length
    ? assetFiles
    : files.filter((file) => metadataLocalAssetPaths.has(file.path));
  const remoteStyles = normalizeUrlList(projectMetadata?.remoteStyles);
  const remoteScripts = normalizeUrlList(projectMetadata?.remoteScripts);

  const selectSourceFile = (path: string) => {
    const shouldScrollToBlock = isHtmlFile({ path }) && outputHasSourceBlock(output, path);
    setBuilderState(projectId, {
      selectedSourceFile: path,
      selectedElement: null,
      selectedGeneratedPreview: null,
      selectedDesignElement: null,
      linkVisit: null,
      ...(shouldScrollToBlock ? { blockScrollTarget: path, blockScrollRequest: Date.now() } : {}),
    }, { history: false });
  };

  const selectGeneratedPreview = (preview: GeneratedPreview) => {
    setBuilderState(projectId, {
      selectedSourceFile: null,
      selectedElement: preview.id,
      selectedGeneratedPreview: preview,
      selectedDesignElement: null,
      selectedColorToken: null,
      linkVisit: null,
    });
  };

  const selectAssetElement = (asset: MetadataAsset) => {
    const rawUrl = asset.url ?? asset.path ?? "";
    const previewUrl = resolveAssetUrl(rawUrl, sourceBaseUrl) ?? rawUrl;
    const selector = assetSelector(rawUrl, previewUrl);
    setBuilderState(projectId, {
      selectedSourceFile: null,
      selectedElement: selector,
      selectedGeneratedPreview: null,
      selectedDesignElement: {
        selector,
        tagName: isVisualAsset(asset, rawUrl) ? "img" : "a",
        text: shortAssetLabel(rawUrl || "Asset"),
        attributes: {
          ...(isVisualAsset(asset, rawUrl) ? { src: rawUrl || previewUrl } : { href: rawUrl || previewUrl }),
          ...(asset.path ? { "data-source-path": asset.path } : {}),
          ...(asset.mime ? { type: asset.mime } : {}),
        },
        styles: {},
        asset: true,
      },
      selectedColorToken: null,
      linkVisit: null,
    }, { history: false });
  };

  const selectColorToken = (color: string, index: number) => {
    setBuilderState(projectId, {
      selectedSourceFile: null,
      selectedElement: `style:color:${index}`,
      selectedGeneratedPreview: null,
      selectedDesignElement: null,
      selectedColorToken: { value: color, original: color, label: `Color ${index + 1}` },
      linkVisit: null,
    }, { history: false });
  };

  const reorderSourceBlocks = async (targetPath: string) => {
    if (!draggingBlockPath || draggingBlockPath === targetPath) {
      setDraggingBlockPath(null);
      return;
    }

    const currentOrder = htmlFiles.map((file) => file.path);
    const fromIndex = currentOrder.indexOf(draggingBlockPath);
    const toIndex = currentOrder.indexOf(targetPath);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingBlockPath(null);
      return;
    }

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    setDraggingBlockPath(null);
    setBuilderState(projectId, { blockOrder: nextOrder }, { history: true });
    if (output?.blocks?.length) {
      const nextOutput = reorderOutputBlocks(output, nextOrder);
      await updateProjectOutput(projectId, {
        markup: nextOutput.markup ?? "",
        blocks: nextOutput.blocks ?? [],
        metadata: {
          ...(nextOutput.metadata ?? {}),
          blockOrder: nextOrder,
          editedAt: new Date().toISOString(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
    }
  };

  return (
    <div className="flex h-full w-full bg-sidebar">
      <div className="w-14 border-r border-white/10 flex flex-col items-center py-4 gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            title={tab.label}
            onClick={() => setBuilderState(projectId, { leftPanelTab: tab.id })}
            className={`p-2.5 rounded-lg transition-colors relative ${state.leftPanelTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
          >
            <tab.icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {state.leftPanelTab === "files" && (
          <PanelSection empty={!sortedFiles.length} emptyText="No original project files have been uploaded yet.">
            <div className="space-y-4">
              <FileGroup
                label="Blocks"
                files={htmlFiles}
                state={state}
                onSelect={selectSourceFile}
                reorderable
                draggingPath={draggingBlockPath}
                onDragStart={setDraggingBlockPath}
                onDrop={(path) => void reorderSourceBlocks(path)}
                description="HTML blocks are merged in this order for preview and export."
              />
              <FileGroup label="Styles" files={styleFiles} state={state} onSelect={selectSourceFile} />
              <FileGroup label="Scripts and Data" files={codeFiles} state={state} onSelect={selectSourceFile} />
              <FileGroup label="Assets" files={assetFiles} state={state} onSelect={selectSourceFile} icon="asset" />
            </div>
          </PanelSection>
        )}

        {state.leftPanelTab === "styles" && (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-3">Original Style Files</h4>
              {styleFiles.length ? (
                <div className="space-y-1">
                  {styleFiles.map(file => (
                    <FileRow key={file.path} file={file} selected={state.selectedSourceFile === file.path} onSelect={selectSourceFile} icon="style" />
                  ))}
                </div>
              ) : null}
              <StyleSourceManager
                projectId={projectId}
                output={output}
                remoteStyles={remoteStyles}
                remoteScripts={remoteScripts}
                onUpdated={() => {
                  queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
                  queryClient.invalidateQueries({ queryKey: ["project-source-files", projectId] });
                  queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
                }}
              />
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-3">Colors</h4>
              <div className="flex flex-wrap gap-2">
                {colors.length ? colors.slice(0, 12).map((color, i) => (
                  <button
                    key={`${color}-${i}`}
                    title={String(color)}
                    className="w-8 h-8 rounded-full cursor-pointer border border-white/20"
                    style={{ background: String(color) }}
                    onClick={() => selectColorToken(String(color), i)}
                  />
                )) : (
                  <p className="text-sm text-muted-foreground">No generated color tokens yet.</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-3">Typography</h4>
              <div className="space-y-5">
                {typography.length ? typography.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group.label}</div>
                      <div className="text-[10px] text-muted-foreground">{group.items.length}</div>
                    </div>
                    {group.items.slice(0, 12).map((item, index) => (
                      <TypographySpecimen
                        key={`${group.label}-${item.value}-${index}`}
                        item={item}
                        selected={state.selectedElement === `style:type:${group.label}:${item.value}`}
                        onClick={() => selectGeneratedPreview({ id: `style:type:${group.label}:${item.value}`, type: "style", label: group.label, source: item.value })}
                      />
                    ))}
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No generated typography tokens yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {state.leftPanelTab === "assets" && (
          <PanelSection empty={!visibleAssetFiles.length && !remoteAssets.length} emptyText="No images, SVGs, fonts, video, or media assets found.">
            <div className="space-y-4">
              {visibleAssetFiles.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Local Assets</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {visibleAssetFiles.map((file) => {
                      const meta: MetadataAsset = { id: file.path, kind: getExtension(file.path), source: 'local', path: file.path, mime: file.mime, size: file.size };
                      return (
                        <RemoteAssetCard
                          key={file.path}
                          asset={meta}
                          sourceBaseUrl={sourceBaseUrl}
                          selected={state.selectedElement === `asset:${file.path}`}
                          onSelect={() => selectAssetElement(meta)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {remoteAssets.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Remote Assets</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {remoteAssets.map((asset) => (
                      <RemoteAssetCard
                        key={asset.id ?? asset.url}
                        asset={asset}
                        sourceBaseUrl={sourceBaseUrl}
                        selected={state.selectedElement === `asset:${asset.url}`}
                        onSelect={() => selectAssetElement(asset)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PanelSection>
        )}
      </div>
    </div>
  );
}

function PanelSection({ empty, emptyText, children }: { empty: boolean; emptyText: string; children: ReactNode }) {
  if (empty) {
    return (
      <div className="text-sm text-muted-foreground p-3 border border-dashed border-white/10 rounded-lg">
        {emptyText}
      </div>
    );
  }

  return <>{children}</>;
}

function StyleSourceManager({
  projectId,
  output,
  remoteStyles,
  remoteScripts,
  onUpdated,
}: {
  projectId: string;
  output?: GeneratedProjectOutput;
  remoteStyles: string[];
  remoteScripts: string[];
  onUpdated: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [styleUrls, setStyleUrls] = useState(remoteStyles);
  const [scriptUrls, setScriptUrls] = useState(remoteScripts);
  const [styleDraft, setStyleDraft] = useState("");
  const [scriptDraft, setScriptDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setStyleUrls(remoteStyles);
    setScriptUrls(remoteScripts);
  }, [remoteStyles, remoteScripts]);

  const saveRemoteSources = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      await updateProject(projectId, {
        metadata: {
          remoteStyles: styleUrls,
          remoteScripts: scriptUrls,
        },
      });
      if (output) {
        await updateProjectOutput(projectId, {
          markup: output.markup ?? "",
          blocks: output.blocks ?? [],
          metadata: {
            ...(output.metadata ?? {}),
            remoteStyles: styleUrls,
            remoteScripts: scriptUrls,
            editedAt: new Date().toISOString(),
          },
        });
      }
      setFeedback("Remote sources saved");
      onUpdated();
    } catch (error) {
      console.error("Failed to save remote sources:", error);
      setFeedback("Could not save sources");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    const fileList = Array.from(files ?? []);
    if (!fileList.length) return;

    setIsSaving(true);
    setFeedback(null);
    try {
      await uploadProjectSourceFiles(projectId, fileList);
      setFeedback("Files uploaded");
      onUpdated();
    } catch (error) {
      console.error("Failed to upload style/script files:", error);
      setFeedback("Could not upload files");
    } finally {
      setIsSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-xs text-foreground transition hover:border-primary/50 hover:bg-primary/5"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block font-medium">Styles and scripts</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {styleUrls.length + scriptUrls.length ? `${styleUrls.length} CSS, ${scriptUrls.length} JS` : "Add CSS, JS, or remote sources"}
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-white/10 bg-sidebar text-foreground">
        <DialogHeader>
          <DialogTitle>Styles and scripts</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm leading-5 text-muted-foreground">
          Attach CSS or JavaScript that should load in the builder and previews.
        </p>
        <div className="space-y-4">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-black/20 px-3 py-3 text-xs text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSaving}
        >
          <Upload className="h-4 w-4" /> Upload CSS or JS files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".css,.scss,.sass,.less,.js,.mjs,.cjs,.ts,.tsx,text/css,application/javascript,text/javascript"
          className="hidden"
          onChange={(event) => void uploadFiles(event.currentTarget.files)}
        />
        <UrlListEditor
          label="Remote CSS"
          placeholder="https://example.com/styles.css"
          value={styleDraft}
          urls={styleUrls}
          onValueChange={setStyleDraft}
          onAdd={(url) => {
            setStyleUrls((urls) => normalizeUrlList([...urls, url]));
            setStyleDraft("");
            setFeedback(null);
          }}
          onRemove={(url) => {
            setStyleUrls((urls) => urls.filter((item) => item !== url));
            setFeedback(null);
          }}
        />
        <UrlListEditor
          label="Remote JS"
          placeholder="https://example.com/script.js"
          value={scriptDraft}
          urls={scriptUrls}
          onValueChange={setScriptDraft}
          onAdd={(url) => {
            setScriptUrls((urls) => normalizeUrlList([...urls, url]));
            setScriptDraft("");
            setFeedback(null);
          }}
          onRemove={(url) => {
            setScriptUrls((urls) => urls.filter((item) => item !== url));
            setFeedback(null);
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <p className="min-h-4 text-[11px] text-primary" aria-live="polite">{feedback ?? " "}</p>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            onClick={() => void saveRemoteSources()}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save sources"}
          </button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UrlListEditor({
  label,
  placeholder,
  value,
  urls,
  onValueChange,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  value: string;
  urls: string[];
  onValueChange: (value: string) => void;
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const normalizedValue = normalizeUrlList([value])[0] ?? "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{urls.length}</span>
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && normalizedValue) {
              event.preventDefault();
              onAdd(normalizedValue);
            }
          }}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded border border-white/10 text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-40"
          onClick={() => normalizedValue && onAdd(normalizedValue)}
          disabled={!normalizedValue}
          aria-label={`Add ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {urls.length > 0 && (
        <div className="space-y-1">
          {urls.map((url) => (
            <div key={url} className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{url}</span>
              <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => onRemove(url)} aria-label={`Remove ${url}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileGroup({
  label,
  files,
  state,
  onSelect,
  reorderable = false,
  draggingPath,
  onDragStart,
  onDrop,
  description,
  icon,
}: {
  label: string;
  files: SourceFile[];
  state: any;
  onSelect: (path: string) => void;
  reorderable?: boolean;
  draggingPath?: string | null;
  onDragStart?: (path: string | null) => void;
  onDrop?: (path: string) => void;
  description?: string;
  icon?: "asset" | "style";
}) {
  if (!files.length) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 p-2 rounded text-sm text-muted-foreground">
        <Folder className="w-4 h-4" /> {label}
        <ChevronRight className="w-3 h-3 ml-auto" />
      </div>
      {description && <p className="px-2 pb-1 text-[11px] text-muted-foreground">{description}</p>}
      <div className="pl-4 space-y-1">
        {files.map(file => (
          <FileRow
            key={file.path}
            file={file}
            selected={state.selectedSourceFile === file.path}
            onSelect={onSelect}
            icon={icon}
            reorderable={reorderable}
            dragging={draggingPath === file.path}
            onDragStart={onDragStart}
            onDrop={onDrop}
          />
        ))}
      </div>
    </div>
  );
}

function FileRow({
  file,
  selected,
  onSelect,
  icon,
  reorderable = false,
  dragging = false,
  onDragStart,
  onDrop,
}: {
  file: SourceFile;
  selected: boolean;
  onSelect: (path: string) => void;
  icon?: "asset" | "style";
  reorderable?: boolean;
  dragging?: boolean;
  onDragStart?: (path: string | null) => void;
  onDrop?: (path: string) => void;
}) {
  const Icon = icon === "asset" ? FileImage : icon === "style" ? Palette : getFileIcon(file);

  return (
    <button
      className={`${itemClass(selected)} ${dragging ? "opacity-50 ring-1 ring-primary/60" : ""}`}
      title={file.path}
      onClick={() => onSelect(file.path)}
      draggable={reorderable}
      onDragStart={(event) => {
        if (!reorderable) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", file.path);
        onDragStart?.(file.path);
      }}
      onDragEnd={() => onDragStart?.(null)}
      onDragOver={(event) => {
        if (!reorderable) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!reorderable) return;
        event.preventDefault();
        onDrop?.(file.path);
      }}
    >
      {reorderable && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{file.path.split("/").pop()}</span>
      <span className="ml-auto text-[10px] uppercase text-muted-foreground">{getExtension(file.path)}</span>
    </button>
  );
}

function RemoteAssetCard({
  asset,
  sourceBaseUrl,
  selected,
  onSelect,
}: {
  asset: MetadataAsset;
  sourceBaseUrl?: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = asset.url ?? asset.path ?? "Remote asset";
  const previewUrl = resolveAssetUrl(asset.url ?? asset.path, sourceBaseUrl);
  const isVisual = isVisualAsset(asset, label);

  return (
    <button
      className={`group overflow-hidden rounded border text-left transition-colors ${selected ? "border-primary/70 bg-primary/10" : "border-white/10 bg-white/5 hover:border-primary/50"}`}
      title={label}
      onClick={onSelect}
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-black/20">
        {isVisual && previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.parentElement?.setAttribute("data-missing-preview", "true");
            }}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : null}
          <div className="hidden h-full w-full items-center justify-center text-muted-foreground [[data-missing-preview=true]_&]:flex">
            <FileImage className="h-5 w-5" />
          </div>
      </div>
      <div className="space-y-1 p-2">
        <div className="truncate text-[11px] text-foreground">{shortAssetLabel(label)}</div>
        <div className="text-[10px] uppercase text-muted-foreground">{asset.kind ?? "asset"}</div>
      </div>
    </button>
  );
}

function itemClass(selected: boolean) {
  return `w-full flex items-center gap-2 p-2 rounded text-sm text-left ${selected ? "bg-primary/10 text-primary" : "hover:bg-white/5 text-muted-foreground"}`;
}

function TypographySpecimen({ item, selected, onClick }: { item: { label: string; value: string; kind: TypographyKind }; selected: boolean; onClick: () => void }) {
  const sampleStyle = typographySampleStyle(item);
  const sampleText = item.kind === "family" ? "Ag" : item.kind === "weight" ? "Bold Aa" : item.kind === "lineHeight" ? "Line one\nLine two" : "Aa";

  return (
    <button
      className={`w-full rounded border p-3 text-left transition-colors ${selected ? "border-primary/70 bg-primary/10 text-primary" : "border-white/10 bg-white/5 text-foreground hover:border-primary/50"}`}
      onClick={onClick}
      title={`${item.label}: ${item.value}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-black/20 text-center text-foreground"
          style={sampleStyle}
        >
          <span className="whitespace-pre leading-[inherit]">{sampleText}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{item.label}</div>
          <div className="mt-1 truncate text-xs text-foreground">{displayTypographyValue(item.value)}</div>
          <div className="mt-2 overflow-hidden rounded bg-black/20 px-2 py-1">
            <p className="truncate text-[11px] text-muted-foreground" style={sampleStyle}>
              The quick brown fox
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function orderBlockFiles(files: SourceFile[], blockOrder: string[] | undefined, output?: GeneratedProjectOutput): SourceFile[] {
  const metadataOrder = sourcePageOrder(output);
  const order = blockOrder?.length ? blockOrder : metadataOrder;
  if (!order.length) return files;

  const orderIndex = new Map(order.map((path, index) => [path, index]));

  return [...files].sort((a, b) => {
    const aIndex = orderIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.path.localeCompare(b.path);
  });
}

function sourcePageOrder(output?: GeneratedProjectOutput): string[] {
  const pages = output?.metadata?.sourcePages;
  if (!Array.isArray(pages)) return [];

  return pages
    .slice()
    .sort((a, b) => readOrder(a) - readOrder(b))
    .map((page) => typeof page?.path === "string" ? page.path : null)
    .filter((path): path is string => Boolean(path));
}

function outputHasSourceBlock(output: GeneratedProjectOutput | undefined, sourcePath: string) {
  return Boolean(output?.blocks?.some((block) => block && typeof block === "object" && firstString(block.sourcePath, block.path) === sourcePath));
}

function reorderOutputBlocks(output: GeneratedProjectOutput, sourceOrder: string[]): GeneratedProjectOutput {
  const orderIndex = new Map(sourceOrder.map((path, index) => [path, index]));
  const blocks = [...(output.blocks ?? [])].sort((a, b) => {
    const aPath = firstString(a.sourcePath, a.path);
    const bPath = firstString(b.sourcePath, b.path);
    const aIndex = aPath ? orderIndex.get(aPath) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const bIndex = bPath ? orderIndex.get(bPath) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return 0;
  });

  return {
    ...output,
    blocks,
    markup: blocks.map((block) => firstString(block.markup, block.originalHtml, block.html, block.content) ?? "").filter(Boolean).join("\n\n") || output.markup,
    metadata: {
      ...(output.metadata ?? {}),
      blocks,
    },
  };
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function readOrder(value: unknown) {
  return typeof (value as { order?: unknown })?.order === "number" ? (value as { order: number }).order : Number.MAX_SAFE_INTEGER;
}

function getBlockLabel(block: Record<string, unknown>, index: number) {
  return firstString(block.title, block.label, block.name, block.id) ?? `Block ${index + 1}`;
}

function getFileIcon(file: SourceFile) {
  if (isImageFile(file)) return FileImage;
  if (isStyleFile(file)) return Palette;
  if (isScriptFile(file) || isDataFile(file)) return Code2;
  if (isHtmlFile(file)) return FileCode2;
  return File;
}

function normalizeColors(styleTokens?: Record<string, unknown>) {
  const tokenColors = styleTokens?.colors;
  if (Array.isArray(tokenColors)) return tokenColors.map(String);
  if (tokenColors && typeof tokenColors === "object") return Object.values(tokenColors).map(String);
  return [];
}

function normalizeTypography(styleTokens?: Record<string, unknown>): TypographyGroup[] {
  const typography = styleTokens?.typography ?? styleTokens?.fonts;
  const groups = new Map<string, { kind: TypographyKind; items: Array<{ label: string; value: string; kind: TypographyKind }> }>();
  const add = (group: string, value: string, index?: number) => {
    const kind = typographyKindForLabel(group);
    const normalizedGroup = typographyLabelForKind(group, kind);
    const items = groups.get(normalizedGroup)?.items ?? [];
    items.push({ label: index === undefined ? normalizedGroup : `${normalizedGroup} ${index + 1}`, value, kind });
    groups.set(normalizedGroup, { kind, items });
  };

  if (typography && typeof typography === "object") {
    Object.entries(typography as Record<string, unknown>).forEach(([label, value]) => {
      const group = typographyGroupLabel(label);
      if (Array.isArray(value)) {
        value.forEach((item, index) => add(group, String(item), index));
      } else if (typeof value === "string") {
        add(group, value);
      }
    });
  }

  for (const [key, label] of [["fontFamilies", "Font family"], ["fontSizes", "Font size"], ["lineHeights", "Line height"], ["fontWeights", "Font weight"]] as const) {
    const values = styleTokens?.[key];
    if (Array.isArray(values)) {
      values.forEach((value, index) => add(label, String(value), index));
    }
  }

  return [...groups.entries()].map(([label, group]) => {
    const seen = new Set<string>();
    return {
      label,
      kind: group.kind,
      items: group.items.filter((item) => {
        if (seen.has(item.value)) return false;
        seen.add(item.value);
        return true;
      }),
    };
  }).filter((group) => group.items.length > 0);
}

function normalizeUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol === "http:" || url.protocol === "https:") {
        urls.push(url.toString());
      }
    } catch {
      continue;
    }
  }
  return [...new Set(urls)];
}

function typographyGroupLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("famil")) return "Font family";
  if (normalized.includes("size")) return "Font size";
  if (normalized.includes("height")) return "Line height";
  if (normalized.includes("weight")) return "Font weight";
  return titleCase(value);
}

function typographyKindForLabel(label: string): TypographyKind {
  const normalized = label.toLowerCase();
  if (normalized.includes("famil")) return "family";
  if (normalized.includes("size")) return "size";
  if (normalized.includes("height")) return "lineHeight";
  if (normalized.includes("weight")) return "weight";
  return "generic";
}

function typographyLabelForKind(label: string, kind: TypographyKind) {
  if (kind === "family") return "Font family";
  if (kind === "size") return "Font size";
  if (kind === "lineHeight") return "Line height";
  if (kind === "weight") return "Font weight";
  return label;
}

function typographySampleStyle(item: { value: string; kind: TypographyKind }): CSSProperties {
  if (item.kind === "family") return { fontFamily: item.value };
  if (item.kind === "size") return { fontSize: previewFontSize(item.value), lineHeight: "1.1" };
  if (item.kind === "lineHeight") return { fontSize: "12px", lineHeight: item.value };
  if (item.kind === "weight") return { fontWeight: item.value };
  return {};
}

function previewFontSize(value: string) {
  const trimmed = value.trim();
  const rem = trimmed.match(/^([\d.]+)rem$/i);
  if (rem) return `${Math.min(Number(rem[1]) * 16, 34)}px`;

  const px = trimmed.match(/^([\d.]+)px$/i);
  if (px) return `${Math.min(Number(px[1]), 34)}px`;

  return trimmed;
}

function displayTypographyValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMetadataAssets(value: unknown): MetadataAsset[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((asset): asset is MetadataAsset => Boolean(asset && typeof asset === "object"))
    .map((asset) => ({
      ...asset,
      id: asset.id ?? asset.path ?? asset.url,
    }));
}

function buildAssetPreview(asset: MetadataAsset, sourceBaseUrl?: string | null): GeneratedPreview {
  const label = asset.url ?? asset.path ?? "Asset";
  const previewUrl = resolveAssetUrl(asset.url ?? asset.path, sourceBaseUrl);
  const isVisual = isVisualAsset(asset, label);

  return {
    id: `asset:${label}`,
    type: "asset",
    label,
    assetUrl: previewUrl ?? asset.url,
    html: isVisual && previewUrl ? `<img src="${escapeHtmlAttribute(previewUrl)}" alt="" style="max-width:100%;height:auto;display:block;margin:auto" />` : undefined,
    source: JSON.stringify(asset, null, 2),
  };
}

function assetSelector(rawUrl: string, previewUrl: string) {
  const candidates = [rawUrl, previewUrl].filter(Boolean);
  const srcSelectors = candidates.map((value) => `img[src="${cssAttributeValue(value)}"]`);
  const hrefSelectors = candidates.map((value) => `a[href="${cssAttributeValue(value)}"]`);
  return [...srcSelectors, ...hrefSelectors].join(", ") || "img";
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function isVisualAsset(asset: MetadataAsset, label: string) {
  return asset.kind === "image" || asset.kind === "svg" || /\.(png|jpe?g|gif|webp|avif|svg|ico)(?:[?#].*)?$/i.test(label);
}

function resolveAssetUrl(url: string | undefined, sourceBaseUrl?: string | null) {
  if (!url) return null;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  if (!sourceBaseUrl) return url;
  return `${sourceBaseUrl}${encodeURIComponent(url)}`;
}

function shortAssetLabel(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean).pop() ?? url.hostname;
  } catch {
    return value.split("/").filter(Boolean).pop() ?? value;
  }
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function isHtmlFile(file: SourceFile) {
  return file.mime?.includes("html") || /\.(html?|xhtml)$/i.test(file.path);
}

function isStyleFile(file: SourceFile) {
  return file.mime?.includes("css") || /\.(css|scss|sass|less|pcss)$/i.test(file.path) || /tailwind\.config\.[cm]?[jt]s$/i.test(file.path);
}

function isScriptFile(file: SourceFile) {
  return file.mime?.includes("javascript") || /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(file.path);
}

function isDataFile(file: SourceFile) {
  return file.mime?.includes("json") || /\.(json|xml|yml|yaml|md|txt)$/i.test(file.path);
}

function isImageFile(file: SourceFile) {
  return file.mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(file.path);
}

function isAssetFile(file: SourceFile) {
  return isImageFile(file) || file.mime?.startsWith("font/") || file.mime?.startsWith("video/") || file.mime?.startsWith("audio/") || /\.(woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|pdf)$/i.test(file.path);
}

function getExtension(path: string) {
  return path.split(".").pop() ?? "file";
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}
