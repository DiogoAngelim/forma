import { useStore } from "@/store";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Image as ImageIcon, RotateCcw, Type, LayoutGrid, PaintBucket, BoxSelect, Copy, Trash2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { updateProjectOutput, type GeneratedProjectOutput } from "@/lib/project-api";
import { toast } from "@/hooks/use-toast";

type StylePatch = Record<string, string | null | undefined>;

export default function RightInspector({
  projectId,
  state,
  output,
}: {
  projectId: string;
  state: any;
  output?: GeneratedProjectOutput;
}) {
  const { setBuilderState } = useStore();
  const queryClient = useQueryClient();
  const designElement = state.selectedDesignElement as {
    selector?: string;
    tagName?: string;
    text?: string;
    attributes?: Record<string, string>;
    styles?: Record<string, string>;
    asset?: boolean;
  } | null | undefined;
  const selectedColor = state.selectedColorToken as { value: string; original: string; label?: string } | null | undefined;
  const updateColorToken = async (nextColor: string) => {
    if (!output || !selectedColor?.original) return;
    const nextOutput = replaceColorInOutput(output, selectedColor.value, nextColor);
    setBuilderState(projectId, {
      outputUndoStack: [
        ...((state.outputUndoStack ?? []).slice(-19)),
        {
          markup: output.markup ?? "",
          blocks: output.blocks ?? [],
          metadata: output.metadata,
        },
      ],
      outputRedoStack: [],
    }, { history: false });
    await updateProjectOutput(projectId, {
      markup: nextOutput.markup ?? "",
      blocks: nextOutput.blocks ?? [],
      metadata: {
        ...(nextOutput.metadata ?? {}),
        styleTokens: replaceColorInStyleTokens(nextOutput.metadata?.styleTokens, selectedColor.value, nextColor),
        lastColorTokenEdit: { from: selectedColor.value, to: nextColor, updatedAt: new Date().toISOString() },
      },
    });
    setBuilderState(projectId, {
      selectedColorToken: { ...selectedColor, value: nextColor },
      selectedGeneratedPreview: null,
    }, { history: false });
    await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
    toast({ title: "Color replaced", description: `${selectedColor.value} is now ${nextColor}.` });
  };

  if (selectedColor) {
    return <ColorTokenInspector color={selectedColor} onReplace={updateColorToken} onRestore={() => updateColorToken(selectedColor.original)} />;
  }

  if (!state.selectedElement) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
        <BoxSelect className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-medium">No element selected</p>
        <p className="text-xs mt-1 opacity-60">Click on an element in the canvas to edit its properties.</p>
      </div>
    );
  }

  const isText = Boolean(designElement?.tagName && /^h[1-6]$|^p$|^span$|^a$|^li$|^button$/i.test(designElement.tagName)) || state.selectedElement === 'h1';
  const isAsset = Boolean(designElement?.asset || designElement?.tagName === "img" || designElement?.tagName === "picture" || designElement?.tagName === "source");
  const selector = selectorForElement(state.selectedElement);
  const canPatchOutput = Boolean(output?.markup && selector);
  const computedStyles = designElement?.styles ?? {};
  const attributes = designElement?.attributes ?? {};

  const persistProjectWideEdit = async (edit: ProjectWideEdit) => {
    if (!output || !selector) {
      toast({
        title: "Nothing to update",
        description: "Upload and convert the full project before applying project-wide edits.",
        variant: "destructive",
      });
      return;
    }

    const nextOutput = applyProjectWideEdit(output, selector, edit);
    setBuilderState(projectId, {
      outputUndoStack: [
        ...((state.outputUndoStack ?? []).slice(-19)),
        {
          markup: output.markup ?? "",
          blocks: output.blocks ?? [],
          metadata: output.metadata,
        },
      ],
      outputRedoStack: [],
    }, { history: false });
    await updateProjectOutput(projectId, {
      markup: nextOutput.markup ?? "",
      blocks: nextOutput.blocks ?? [],
      metadata: {
        ...nextOutput.metadata,
        lastProjectWideEdit: {
          selector,
          selectedElement: state.selectedElement,
          type: edit.type,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
    if (edit.type === "attribute" && designElement) {
      const nextAttributes = { ...attributes };
      if (edit.value === null || edit.value === "") delete nextAttributes[edit.name];
      else nextAttributes[edit.name] = edit.value;
      const nextSelector = selectorForAttributeEdit(selector, edit.name, edit.value);
      setBuilderState(projectId, {
        selectedElement: nextSelector,
        selectedDesignElement: {
          ...designElement,
          selector: nextSelector,
          attributes: nextAttributes,
        },
        selectedGeneratedPreview: null,
      }, { history: false });
    } else {
      setBuilderState(projectId, { selectedGeneratedPreview: null }, { history: false });
    }
    toast({
      title: "Project updated",
      description: "The change was applied across the generated project, so preview and exports use it.",
    });
  };

  const patchStyle = (styles: StylePatch) => {
    void persistProjectWideEdit({ type: "style", styles });
  };

  const cloneSelected = () => {
    void persistProjectWideEdit({ type: "clone" });
  };

  const deleteSelected = () => {
    void persistProjectWideEdit({ type: "delete" });
  };

  const patchAttribute = (name: string, value: string | null) => {
    void persistProjectWideEdit({ type: "attribute", name, value });
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
          {isAsset ? <ImageIcon className="h-3.5 w-3.5" /> : isText ? 'T' : designElement?.tagName ?? 'div'}
        </div>
        <span className="truncate text-sm font-mono">{designElement?.selector ?? state.selectedElement}</span>
      </div>

      <Tabs defaultValue={isAsset ? "attributes" : "style"} className="flex-1 min-h-0 flex flex-col">
        {!isAsset && (
          <TabsList className="w-full justify-start rounded-none border-b border-white/10 bg-transparent h-12 p-0">
            <TabsTrigger value="style" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4">Style</TabsTrigger>
            <TabsTrigger value="attributes" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4">Attributes</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4">Settings</TabsTrigger>
          </TabsList>
        )}
        
        <TabsContent value="style" className="flex-1 min-h-0 overflow-y-auto p-0 m-0">
          <InspectorNotice />
          {/* Layout Section */}
          <StyleMap styles={computedStyles} />
          <div className="p-4 border-b border-white/5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2"><LayoutGrid className="w-3.5 h-3.5" /> Layout</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1.5 block">Display</Label>
                  <Select value={selectValue(computedStyles.display, isText ? "block" : "flex", ["block", "flex", "grid", "none"])} onValueChange={(value) => patchStyle({ display: value })} disabled={!canPatchOutput}>
                    <SelectTrigger className="h-8 text-xs bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Block</SelectItem>
                      <SelectItem value="flex">Flex</SelectItem>
                      <SelectItem value="grid">Grid</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Direction</Label>
                  <Select value={selectValue(computedStyles.flexDirection, "column", ["row", "column"])} onValueChange={(value) => patchStyle({ flexDirection: value })} disabled={!canPatchOutput}>
                    <SelectTrigger className="h-8 text-xs bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="row">Row</SelectItem>
                      <SelectItem value="column">Column</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1.5 block">Width</Label>
                  <Input key={`width-${computedStyles.width}`} defaultValue={computedStyles.width ?? "100%"} className="h-8 text-xs bg-white/5 font-mono" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ width: event.currentTarget.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Height</Label>
                  <Input key={`height-${computedStyles.height}`} defaultValue={computedStyles.height ?? "auto"} className="h-8 text-xs bg-white/5 font-mono" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ height: event.currentTarget.value })} />
                </div>
              </div>
            </div>
          </div>

          {/* Typography Section */}
          {isText && (
            <div className="p-4 border-b border-white/5 bg-primary/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-1 bg-primary text-[9px] font-bold px-2 rounded-bl">AI</div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 flex items-center gap-2"><Type className="w-3.5 h-3.5" /> Typography</h4>
              <div className="space-y-4 relative z-10">
                <div>
                  <Label className="text-xs mb-1.5 block">Font Family</Label>
                  <Select value={fontFamilySelectValue(computedStyles.fontFamily)} onValueChange={(value) => patchStyle({ fontFamily: fontFamilyValue(value) })} disabled={!canPatchOutput}>
                    <SelectTrigger className="h-8 text-xs bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inter">Inter</SelectItem>
                      <SelectItem value="geist">Geist</SelectItem>
                      <SelectItem value="playfair">Playfair Display</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs mb-1.5 block">Weight</Label>
                    <Select value={selectValue(computedStyles.fontWeight, "400", ["400", "600", "700", "900"])} onValueChange={(value) => patchStyle({ fontWeight: value })} disabled={!canPatchOutput}>
                      <SelectTrigger className="h-8 text-xs bg-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="400">Regular (400)</SelectItem>
                        <SelectItem value="600">SemiBold (600)</SelectItem>
                        <SelectItem value="700">Bold (700)</SelectItem>
                        <SelectItem value="900">Black (900)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Size</Label>
                    <Input key={`fontSize-${computedStyles.fontSize}`} defaultValue={computedStyles.fontSize ?? "16px"} className="h-8 text-xs bg-white/5 font-mono" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ fontSize: event.currentTarget.value })} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Section */}
          <div className="p-4 border-b border-white/5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2"><PaintBucket className="w-3.5 h-3.5" /> Appearance</h4>
            <div className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">Background</Label>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded border border-white/20" style={{ background: computedStyles.backgroundColor || "transparent" }} />
                  <Input key={`background-${computedStyles.backgroundColor}`} defaultValue={computedStyles.backgroundColor || "transparent"} className="h-8 text-xs bg-white/5 font-mono flex-1" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ background: event.currentTarget.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Text color</Label>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded border border-white/20" style={{ background: computedStyles.color || "transparent" }} />
                  <Input key={`color-${computedStyles.color}`} defaultValue={computedStyles.color || ""} className="h-8 text-xs bg-white/5 font-mono flex-1" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ color: event.currentTarget.value })} />
                </div>
              </div>
              <BoxModel styles={computedStyles} onPatch={patchStyle} disabled={!canPatchOutput} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1.5 block">Radius</Label>
                  <Input key={`radius-${computedStyles.borderRadius}`} defaultValue={computedStyles.borderRadius ?? "0px"} className="h-8 bg-white/5 font-mono text-xs" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ borderRadius: event.currentTarget.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Overflow</Label>
                  <Select value={selectValue(computedStyles.overflow, "visible", ["visible", "hidden", "auto", "scroll"])} onValueChange={(value) => patchStyle({ overflow: value })} disabled={!canPatchOutput}>
                    <SelectTrigger className="h-8 text-xs bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visible">Visible</SelectItem>
                      <SelectItem value="hidden">Hidden</SelectItem>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="scroll">Scroll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Shadow</Label>
                <Input key={`shadow-${computedStyles.boxShadow}`} defaultValue={computedStyles.boxShadow ?? "none"} className="h-8 bg-white/5 font-mono text-xs" disabled={!canPatchOutput} onBlur={(event) => patchStyle({ boxShadow: event.currentTarget.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Opacity</Label>
                <div className="flex items-center gap-3">
                  <Slider value={[Math.round(Number(computedStyles.opacity ?? 1) * 100)]} max={100} step={1} className="flex-1" disabled={!canPatchOutput} onValueCommit={(value) => patchStyle({ opacity: String((value[0] ?? 100) / 100) })} />
                  <span className="text-xs font-mono w-8 text-right">{Math.round(Number(computedStyles.opacity ?? 1) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="attributes" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-4">
          {isAsset && <InspectorNotice asset />}
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Element attributes
          </div>
          {Object.keys(attributes).length ? (
            Object.entries(attributes).map(([name, value]) => (
              <div key={name} className="grid grid-cols-[88px_1fr_auto] items-center gap-2">
                <Label className="truncate text-xs" title={name}>{name}</Label>
                <Input
                  key={`${name}-${value}`}
                  defaultValue={value}
                  className="h-8 min-w-0 bg-white/5 font-mono text-xs"
                  disabled={!canPatchOutput}
                  onBlur={(event) => patchAttribute(name, event.currentTarget.value)}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canPatchOutput} onClick={() => patchAttribute(name, null)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No attributes were found on this element.</p>
          )}
          <AddAttributeForm disabled={!canPatchOutput} onAdd={(name, value) => patchAttribute(name, value)} />
        </TabsContent>
        
        <TabsContent value="settings" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-4">
          {isText && (
            <div>
              <Label className="text-xs mb-1.5 block">Text content</Label>
              <textarea
                className="w-full h-28 bg-white/5 border border-white/10 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                key={`text-${designElement?.text ?? ""}`}
                defaultValue={designElement?.text ?? ""}
                placeholder="Replace text for every matching heading in the project"
                disabled={!canPatchOutput}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (value) void persistProjectWideEdit({ type: "text", text: value });
                }}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" disabled={!canPatchOutput} onClick={cloneSelected}>
              <Copy className="h-4 w-4" /> Clone
            </Button>
            <Button variant="destructive" className="gap-2" disabled={!canPatchOutput} onClick={deleteSelected}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ProjectWideEdit =
  | { type: "style"; styles: StylePatch }
  | { type: "text"; text: string }
  | { type: "attribute"; name: string; value: string | null }
  | { type: "delete" }
  | { type: "clone" };

function InspectorNotice({ asset = false }: { asset?: boolean }) {
  return (
    <div className="border-b border-white/5 bg-primary/5 p-4 text-xs leading-5 text-muted-foreground">
      {asset
        ? "Asset changes update the matching generated element attributes, so preview and exports use the same value."
        : "Mapped controls reflect the selected element's computed styles. Changes update generated output used by preview and export."}
    </div>
  );
}

function StyleMap({ styles }: { styles: Record<string, string> }) {
  const items = [
    ["Display", styles.display],
    ["Position", styles.position],
    ["Size", [styles.width, styles.height].filter(Boolean).join(" x ")],
    ["Spacing", compactBox(styles, "margin")],
    ["Padding", compactBox(styles, "padding")],
    ["Color", styles.color],
    ["Background", styles.backgroundColor],
  ].filter(([, value]) => value && value !== "normal" && value !== "none");

  if (!items.length) return null;

  return (
    <div className="border-b border-white/5 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mapped style</h4>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-foreground" title={String(value)}>{String(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function compactBox(styles: Record<string, string>, prefix: "margin" | "padding") {
  const cap = prefix === "margin" ? "Margin" : "Padding";
  const values = [
    styles[`${prefix}Top`] ?? styles[`${cap}Top`],
    styles[`${prefix}Right`] ?? styles[`${cap}Right`],
    styles[`${prefix}Bottom`] ?? styles[`${cap}Bottom`],
    styles[`${prefix}Left`] ?? styles[`${cap}Left`],
  ].filter(Boolean);
  return values.length ? values.join(" ") : "";
}

function selectorForElement(selectedElement: string): string | null {
  if (selectedElement === "h1") return "h1";
  if (selectedElement === "nav") return "nav, header";
  if (selectedElement === "hero") return ".hero, [class*='hero'], main, section";
  if (selectedElement.startsWith("block:")) return "body > *";
  return selectedElement;
}

function selectorForAttributeEdit(currentSelector: string, name: string, value: string | null) {
  if (!value || !["src", "href"].includes(name)) return currentSelector;
  const tag = name === "src" ? "img" : "a";
  return `${tag}[${name}="${cssAttributeValue(value)}"]`;
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function applyProjectWideEdit(output: GeneratedProjectOutput, selector: string, edit: ProjectWideEdit): GeneratedProjectOutput {
  const blocks = (output.blocks ?? []).map((block) => {
    const nextBlock = { ...block };
    for (const key of ["originalHtml", "markup", "html", "content"]) {
      const value = nextBlock[key];
      if (typeof value === "string") {
        nextBlock[key] = applyEditToHtml(value, selector, edit);
      }
    }
    return nextBlock;
  });

  return {
    ...output,
    markup: applyEditToHtml(output.markup ?? "", selector, edit),
    blocks,
    metadata: {
      ...(output.metadata ?? {}),
      editedProjectWide: true,
    },
  };
}

function applyEditToHtml(html: string, selector: string, edit: ProjectWideEdit) {
  if (!html.trim() || typeof DOMParser === "undefined") return html;
  const hasDocument = /<!doctype html|<html[\s>]/i.test(html);
  const documentHtml = hasDocument ? html : `<!doctype html><html><body>${html}</body></html>`;
  const doc = new DOMParser().parseFromString(documentHtml, "text/html");
  const targets = Array.from(doc.body.querySelectorAll(selector));
  if (!targets.length) return html;

  for (const target of targets) {
    if (!(target instanceof HTMLElement)) continue;
    if (edit.type === "style") {
      for (const [name, value] of Object.entries(edit.styles)) {
        if (value === null || value === undefined || value === "") target.style.removeProperty(kebabCase(name));
        else target.style.setProperty(kebabCase(name), value);
      }
    } else if (edit.type === "text") {
      target.textContent = edit.text;
    } else if (edit.type === "attribute") {
      if (edit.value === null || edit.value === "") target.removeAttribute(edit.name);
      else target.setAttribute(edit.name, edit.value);
    } else if (edit.type === "delete") {
      target.remove();
    } else if (edit.type === "clone") {
      target.after(target.cloneNode(true));
    }
  }

  return hasDocument ? `<!doctype html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

function selectValue(value: string | undefined, fallback: string, allowed: string[]) {
  const normalized = value?.trim();
  return normalized && allowed.includes(normalized) ? normalized : fallback;
}

function fontFamilySelectValue(value: string | undefined) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("playfair")) return "playfair";
  if (normalized.includes("geist")) return "geist";
  return "inter";
}

function BoxModel({ styles, onPatch, disabled }: { styles: Record<string, string>; onPatch: (styles: StylePatch) => void; disabled: boolean }) {
  const fields = [
    ["marginTop", "MT"],
    ["marginRight", "MR"],
    ["marginBottom", "MB"],
    ["marginLeft", "ML"],
    ["paddingTop", "PT"],
    ["paddingRight", "PR"],
    ["paddingBottom", "PB"],
    ["paddingLeft", "PL"],
  ] as const;

  return (
    <div className="space-y-2">
      <Label className="text-xs">Spacing</Label>
      <div className="grid grid-cols-4 gap-2">
        {fields.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <span className="text-[10px] text-muted-foreground">{label}</span>
            <Input
              key={`${key}-${styles[key]}`}
              defaultValue={styles[key] ?? "0px"}
              className="h-8 bg-white/5 px-2 font-mono text-[11px]"
              disabled={disabled}
              onBlur={(event) => onPatch({ [key]: event.currentTarget.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AddAttributeForm({ disabled, onAdd }: { disabled: boolean; onAdd: (name: string, value: string) => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Add attribute</div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="name" className="h-8 bg-white/5 text-xs" disabled={disabled} />
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="value" className="h-8 bg-white/5 text-xs" disabled={disabled} />
        <Button
          size="sm"
          disabled={disabled || !name.trim()}
          onClick={() => {
            onAdd(name.trim(), value);
            setName("");
            setValue("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function kebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function fontFamilyValue(value: string) {
  if (value === "geist") return "Geist, Inter, system-ui, sans-serif";
  if (value === "playfair") return "'Playfair Display', Georgia, serif";
  return "Inter, system-ui, sans-serif";
}

function ColorTokenInspector({
  color,
  onReplace,
  onRestore,
}: {
  color: { value: string; original: string; label?: string };
  onReplace: (value: string) => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(color.value);
  const [saving, setSaving] = useState(false);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="border-b border-white/10 bg-white/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color token</div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-10 w-10 rounded border border-white/20" style={{ background: color.value }} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{color.label ?? "Selected color"}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{color.value}</div>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="color-token-value" className="text-xs">Replacement color</Label>
          <div className="flex gap-2">
            <Input
              id="color-token-value"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-9 bg-white/5 font-mono text-xs"
              placeholder="#7c3aed"
            />
            <input
              type="color"
              value={colorInputValue(draft)}
              onChange={(event) => setDraft(event.target.value)}
              className="h-9 w-10 rounded border border-white/10 bg-white/5 p-1"
              aria-label="Choose replacement color"
            />
          </div>
        </div>
        <Button
          className="w-full"
          disabled={!draft.trim() || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onReplace(draft.trim());
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Replacing..." : "Replace color"}
        </Button>
        <Button variant="outline" className="w-full gap-2" disabled={saving || color.value === color.original} onClick={() => void onRestore()}>
          <RotateCcw className="h-4 w-4" /> Restore original
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Replaces matching color values in generated markup, blocks, and saved style tokens.
        </p>
      </div>
    </div>
  );
}

function colorInputValue(value: string) {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return "#7c3aed";
}

function replaceColorInOutput(output: GeneratedProjectOutput, from: string, to: string): GeneratedProjectOutput {
  const blocks = (output.blocks ?? []).map((block) => {
    const nextBlock = { ...block };
    for (const key of ["originalHtml", "markup", "html", "content"]) {
      const value = nextBlock[key];
      if (typeof value === "string") nextBlock[key] = replaceAllLiteral(value, from, to);
    }
    return nextBlock;
  });

  return {
    ...output,
    markup: replaceAllLiteral(output.markup ?? "", from, to),
    blocks,
  };
}

function replaceColorInStyleTokens(styleTokens: unknown, from: string, to: string) {
  if (!styleTokens || typeof styleTokens !== "object") return styleTokens as Record<string, unknown> | undefined;
  return replaceDeep(styleTokens, from, to) as Record<string, unknown>;
}

function replaceDeep(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, replaceDeep(item, from, to)]));
  }
  return value;
}

function replaceAllLiteral(value: string, from: string, to: string) {
  return value.split(from).join(to);
}
