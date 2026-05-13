import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@/store";
import { Settings } from "lucide-react";
import type { GeneratedProjectOutput } from "@/lib/project-api";
import { fetchProjectPreviewHtml, fetchProjectSourceFile, updateProjectOutput } from "@/lib/project-api";

export default function Canvas({
  projectId,
  state,
  output,
}: {
  projectId: string;
  state: any;
  previewUrl?: string;
  output?: GeneratedProjectOutput;
}) {
  const { setBuilderState } = useStore();
  const queryClient = useQueryClient();

  const width = state.viewport === 'desktop' ? '100%' : state.viewport === 'tablet' ? '768px' : '375px';
  const scale = state.canvasZoom / 100;
  const selectedPreview = state.selectedGeneratedPreview as { html?: string; label?: string } | null | undefined;
  const selectedDesignElement = state.selectedDesignElement as { href?: string; rect?: { left: number; top: number } } | null | undefined;
  const [filePreview, setFilePreview] = useState<{ path: string; html?: string; objectUrl?: string; kind: "html" | "image" | "code" | "asset" } | null>(null);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const [projectPreviewHtml, setProjectPreviewHtml] = useState<string | null>(null);
  const [projectPreviewSettled, setProjectPreviewSettled] = useState(false);
  const generatedHtml = selectedPreview?.html ?? (!state.selectedSourceFile ? projectPreviewHtml ?? (projectPreviewSettled ? output?.markup : undefined) : undefined);
  const inspectableDocument = useMemo(
    () => generatedHtml ? buildInspectableDocument(generatedHtml, state.previewScroll) : "",
    [generatedHtml, state.previewScroll],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "forma-element-selected") return;

      setBuilderState(projectId, {
        selectedElement: data.selector,
        selectedDesignElement: data,
        selectedSourceFile: null,
        selectedGeneratedPreview: null,
        linkVisit: data.href ? { href: data.href, requestedAt: Date.now() } : null,
      }, { history: true });
    };

    const handleContentMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "forma-content-edited" || !output || typeof data.selector !== "string") return;
      const nextOutput = replaceTextInOutput(output, data.selector, String(data.text ?? ""));
      setBuilderState(projectId, {
        previewScroll: normalizeScroll(data.scroll),
      }, { history: false });
      await updateProjectOutput(projectId, {
        markup: nextOutput.markup ?? "",
        blocks: nextOutput.blocks ?? [],
        metadata: {
          ...(nextOutput.metadata ?? {}),
          editedInline: true,
          editedInlineAt: new Date().toISOString(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["project-output", projectId] });
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("message", handleContentMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("message", handleContentMessage);
    };
  }, [output, projectId, queryClient, setBuilderState]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    async function loadSourceFile(path: string) {
      setFilePreviewError(null);
      setFilePreview(null);
      try {
        const { blob, contentType } = await fetchProjectSourceFile(projectId, path);
        if (cancelled) return;

        const mime = contentType ?? blob.type;
        if (isHtml(path, mime)) {
          const html = await blob.text();
          if (!cancelled) setFilePreview({ path, html, kind: "html" });
          return;
        }

        if (isImage(path, mime)) {
          objectUrl = URL.createObjectURL(blob);
          setFilePreview({ path, objectUrl, kind: "image" });
          return;
        }

        if (isCodeLike(path, mime)) {
          const text = await blob.text();
          if (!cancelled) setFilePreview({ path, html: buildCodeDocument(path, text), kind: "code" });
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setFilePreview({ path, objectUrl, kind: "asset" });
      } catch (error) {
        if (!cancelled) setFilePreviewError(error instanceof Error ? error.message : "Could not load this file.");
      }
    }

    if (state.selectedSourceFile) {
      void loadSourceFile(state.selectedSourceFile);
    } else {
      setFilePreview(null);
      setFilePreviewError(null);
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, state.selectedSourceFile]);

  useEffect(() => {
    let cancelled = false;
    if (state.selectedSourceFile || selectedPreview?.html || !output) {
      setProjectPreviewHtml(null);
      setProjectPreviewSettled(Boolean(selectedPreview?.html));
      return;
    }

    setProjectPreviewSettled(false);
    fetchProjectPreviewHtml(projectId)
      .then((html) => {
        if (!cancelled) {
          setProjectPreviewHtml(html);
          setProjectPreviewSettled(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectPreviewHtml(null);
          setProjectPreviewSettled(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [output, projectId, selectedPreview?.html, state.selectedSourceFile]);

  const handleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBuilderState(projectId, { selectedElement: id });
  };

  const isSelected = (id: string) => state.selectedElement === id;
  const handleWheel = (event: React.WheelEvent) => {
    if (!event.metaKey && !event.ctrlKey) return;

    event.preventDefault();
    const direction = event.deltaY > 0 ? -10 : 10;
    setBuilderState(projectId, { canvasZoom: Math.min(200, Math.max(25, state.canvasZoom + direction)) }, { history: false });
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden z-10" onWheel={handleWheel}>
      <motion.div 
        layout
        className="bg-white rounded-lg shadow-2xl overflow-hidden text-black flex flex-col relative transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ 
          width, 
          height: '80%', 
          maxWidth: '1200px',
          scale,
        }}
        onClick={() => setBuilderState(projectId, { selectedElement: null })}
      >
        {filePreview?.kind === "image" && filePreview.objectUrl ? (
          <div className="flex h-full w-full items-center justify-center bg-zinc-100 p-6">
            <img src={filePreview.objectUrl} alt={filePreview.path} className="max-h-full max-w-full object-contain" />
          </div>
        ) : filePreview?.kind === "asset" && filePreview.objectUrl ? (
          <object data={filePreview.objectUrl} title={filePreview.path} className="h-full w-full bg-white" />
        ) : filePreview?.html ? (
          <iframe
            key={`source-${filePreview.path}`}
            title={filePreview.path}
            srcDoc={filePreview.html}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        ) : filePreviewError ? (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-zinc-600">
            {filePreviewError}
          </div>
        ) : state.selectedSourceFile ? (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-zinc-600">
            Loading {state.selectedSourceFile}...
          </div>
        ) : generatedHtml ? (
          <iframe
            key={`${selectedPreview?.label ?? output?.id ?? "generated"}`}
            title={selectedPreview?.label ?? "Generated project preview"}
            srcDoc={inspectableDocument}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        ) : output && !state.selectedSourceFile ? (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-zinc-600">
            Loading styled preview...
          </div>
        ) : (
          <>
        {/* Nav */}
        <div 
          className={`flex items-center justify-between p-4 border-b border-gray-200 relative group cursor-pointer ${isSelected('nav') ? 'ring-2 ring-primary ring-inset' : 'hover:ring-1 hover:ring-blue-400 hover:ring-inset'}`}
          onClick={(e) => handleSelect(e, 'nav')}
        >
          {isSelected('nav') && <div className="absolute -top-6 left-0 bg-primary text-white text-[10px] px-2 py-0.5 rounded-t">Navbar</div>}
          <div className="font-bold text-xl tracking-tighter">ACME</div>
          <div className="hidden md:flex gap-6 text-sm font-medium text-gray-500">
            <span>Product</span>
            <span>Features</span>
            <span>Pricing</span>
          </div>
          <div className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium">Get Started</div>
        </div>

        {/* Hero */}
        <div 
          className={`flex-1 flex flex-col items-center justify-center text-center p-12 bg-gradient-to-b from-gray-50 to-white relative group cursor-pointer ${isSelected('hero') ? 'ring-2 ring-primary ring-inset' : 'hover:ring-1 hover:ring-blue-400 hover:ring-inset'}`}
          onClick={(e) => handleSelect(e, 'hero')}
        >
          {isSelected('hero') && <div className="absolute -top-6 left-0 bg-primary text-white text-[10px] px-2 py-0.5 rounded-t">Hero Section</div>}
          
          <h1 
            className={`text-5xl md:text-7xl font-black tracking-tight max-w-3xl mb-6 relative group/text cursor-text ${isSelected('h1') ? 'ring-2 ring-primary ring-inset' : 'hover:ring-1 hover:ring-blue-400 hover:ring-inset'}`}
            onClick={(e) => handleSelect(e, 'h1')}
          >
            {isSelected('h1') && <div className="absolute -top-5 left-0 bg-primary text-white text-[10px] px-1 rounded-t">H1</div>}
            Build interfaces that feel <span className="text-blue-600">alive.</span>
          </h1>
          
          <p className="text-xl text-gray-500 max-w-2xl mb-10">
            The premium visual builder for teams who want to move fast without sacrificing craft.
          </p>
          
          <div className="flex gap-4">
            <div className="bg-black text-white px-8 py-3 rounded-lg font-medium text-lg shadow-lg">Start Building</div>
            <div className="bg-white text-black px-8 py-3 rounded-lg font-medium text-lg border border-gray-200 shadow-sm">View Demo</div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-12 bg-white">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-6 border border-gray-100 rounded-xl shadow-sm bg-gray-50/50 flex flex-col gap-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                <Settings className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">Visual Editing</h3>
              <p className="text-gray-500 text-sm">Direct manipulation of the DOM with instant visual feedback.</p>
            </div>
          ))}
        </div>
          </>
        )}
      </motion.div>

      {selectedDesignElement?.href && (
        <div className="absolute right-6 top-6 z-50 flex items-center gap-2 rounded-lg border border-white/10 bg-background/95 p-2 text-xs shadow-2xl">
          <span className="max-w-[220px] truncate text-muted-foreground">{selectedDesignElement.href}</span>
          <button
            className="rounded bg-primary px-2 py-1 font-medium text-primary-foreground"
            onClick={() => window.open(selectedDesignElement.href, "_blank", "noopener,noreferrer")}
          >
            Visit
          </button>
          <button
            className="rounded px-2 py-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            onClick={() => setBuilderState(projectId, { linkVisit: null, selectedDesignElement: { ...selectedDesignElement, href: undefined } }, { history: false })}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Floating Canvas Tools */}
      <div className="absolute bottom-6 left-6 bg-background/80 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl p-2 flex gap-2 z-50">
        <button className="p-2 hover:bg-white/10 rounded text-muted-foreground hover:text-foreground" onClick={() => setBuilderState(projectId, { canvasZoom: Math.max(25, state.canvasZoom - 25) })}>-</button>
        <span className="text-sm font-mono flex items-center">{state.canvasZoom}%</span>
        <button className="p-2 hover:bg-white/10 rounded text-muted-foreground hover:text-foreground" onClick={() => setBuilderState(projectId, { canvasZoom: Math.min(200, state.canvasZoom + 25) })}>+</button>
      </div>
    </div>
  );
}

function isHtml(path: string, mime?: string) {
  return mime?.includes("html") || /\.(html?|xhtml)$/i.test(path);
}

function isImage(path: string, mime?: string) {
  return mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(path);
}

function isCodeLike(path: string, mime?: string) {
  return mime?.includes("text") || mime?.includes("javascript") || mime?.includes("json") || /\.(css|scss|sass|less|js|jsx|ts|tsx|mjs|cjs|json|xml|yml|yaml|md|txt|php)$/i.test(path);
}

function buildCodeDocument(path: string, text: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; background: #0b0b0f; color: #e7e7ee; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      header { position: sticky; top: 0; padding: 10px 14px; background: #15151d; border-bottom: 1px solid #282838; color: #a9a9b8; }
      pre { margin: 0; padding: 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <header>${escapeHtml(path)}</header>
    <pre>${escapeHtml(text)}</pre>
  </body>
</html>`;
}

function normalizeScroll(value: unknown) {
  const scroll = value as { x?: unknown; y?: unknown } | null;
  const x = typeof scroll?.x === "number" && Number.isFinite(scroll.x) ? scroll.x : 0;
  const y = typeof scroll?.y === "number" && Number.isFinite(scroll.y) ? scroll.y : 0;
  return { x, y };
}

function buildInspectableDocument(html: string, restoreScroll?: { x: number; y: number }) {
  const scroll = JSON.stringify(restoreScroll ?? { x: 0, y: 0 });
  const script = `<script>
(() => {
  const STYLE_PROPS = ["display","position","top","right","bottom","left","zIndex","boxSizing","width","height","minWidth","maxWidth","minHeight","maxHeight","marginTop","marginRight","marginBottom","marginLeft","paddingTop","paddingRight","paddingBottom","paddingLeft","fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","textAlign","color","backgroundColor","backgroundImage","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth","borderColor","borderRadius","opacity","overflow","gap","rowGap","columnGap","flexDirection","justifyContent","alignItems","gridTemplateColumns","gridTemplateRows","boxShadow","transform"];
  let selected;

  function cssPath(element) {
    if (element.id) return "#" + CSS.escape(element.id);
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.localName;
      if (node.classList.length) part += "." + Array.from(node.classList).slice(0, 2).map((name) => CSS.escape(name)).join(".");
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.localName === node.localName);
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ") || element.localName;
  }

  function attrs(element) {
    return Array.from(element.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {});
  }

  function styles(element) {
    const computed = getComputedStyle(element);
    return STYLE_PROPS.reduce((acc, prop) => {
      acc[prop] = computed[prop] || "";
      return acc;
    }, {});
  }

  function outline(element) {
    if (selected) selected.removeAttribute("data-forma-selected");
    selected = element;
    selected.setAttribute("data-forma-selected", "true");
  }

  function isEditableText(element) {
    return /^(h1|h2|h3|h4|h5|h6|p|span|a|button|li|label|strong|em|small)$/i.test(element.localName);
  }

  function makeEditable(element) {
    if (!isEditableText(element) || element.dataset.formaEditableReady === "true") return;
    element.dataset.formaEditableReady = "true";
    element.setAttribute("contenteditable", "true");
    element.setAttribute("spellcheck", "false");
    element.addEventListener("blur", () => {
      window.parent.postMessage({
        type: "forma-content-edited",
        selector: cssPath(element),
        text: element.textContent || "",
        scroll: { x: window.scrollX, y: window.scrollY }
      }, "*");
    });
  }

  function placeholderSvg(width, height) {
    const w = Math.max(120, Math.round(width || 320));
    const h = Math.max(90, Math.round(height || 200));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><rect width="100%" height="100%" fill="#f1f5f9"/><g fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(' + (w / 2 - 34) + ' ' + (h / 2 - 26) + ')"><path d="M14 16h8l4-6h16l4 6h8a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8z"/><circle cx="34" cy="34" r="10"/></g></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function installImageFallbacks() {
    document.querySelectorAll("img").forEach((image) => {
      if (image.dataset.formaFallbackReady === "true") return;
      image.dataset.formaFallbackReady = "true";
      image.addEventListener("error", () => {
        image.dataset.formaMissingAsset = "true";
        image.src = placeholderSvg(image.clientWidth || image.width, image.clientHeight || image.height);
        image.alt = image.alt || "Missing image placeholder";
      });
    });
  }

  function initialize() {
    document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,a,button,li,label,strong,em,small").forEach(makeEditable);
    installImageFallbacks();
  }

  const style = document.createElement("style");
  style.textContent = "[data-forma-selected='true']{outline:2px solid #7c3aed!important;outline-offset:2px!important;cursor:default!important}[contenteditable='true']{cursor:text!important}[data-forma-missing-asset='true']{object-fit:contain!important;background:#f1f5f9!important}";
  document.head.appendChild(style);
  initialize();
  requestAnimationFrame(() => {
    const scroll = ${scroll};
    window.scrollTo(scroll.x || 0, scroll.y || 0);
    initialize();
  });

  document.addEventListener("click", (event) => {
    const target = event.target && event.target.closest ? event.target.closest("*") : null;
    if (!target || target === document.documentElement || target === document.body) return;
    if (!target.isContentEditable) event.preventDefault();
    event.stopPropagation();
    outline(target);
    makeEditable(target);
    if (isEditableText(target)) target.focus();
    const rect = target.getBoundingClientRect();
    window.parent.postMessage({
      type: "forma-element-selected",
      selector: cssPath(target),
      tagName: target.localName,
      text: (target.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 500),
      attributes: attrs(target),
      styles: styles(target),
      href: target.closest("a") ? target.closest("a").href : null,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }, "*");
  }, true);
})();
</script>`;

  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  return `${html}${script}`;
}

function replaceTextInOutput(output: GeneratedProjectOutput, selector: string, text: string): GeneratedProjectOutput {
  const blocks = (output.blocks ?? []).map((block) => {
    const nextBlock = { ...block };
    for (const key of ["originalHtml", "markup", "html", "content"]) {
      const value = nextBlock[key];
      if (typeof value === "string") nextBlock[key] = replaceTextInHtml(value, selector, text);
    }
    return nextBlock;
  });

  return {
    ...output,
    markup: replaceTextInHtml(output.markup ?? "", selector, text),
    blocks,
  };
}

function replaceTextInHtml(html: string, selector: string, text: string) {
  if (!html.trim() || typeof DOMParser === "undefined") return html;
  const hasDocument = /<!doctype html|<html[\s>]/i.test(html);
  const documentHtml = hasDocument ? html : `<!doctype html><html><body>${html}</body></html>`;
  const doc = new DOMParser().parseFromString(documentHtml, "text/html");
  const target = doc.body.querySelector(selector);
  if (!target) return html;
  target.textContent = text;
  return hasDocument ? `<!doctype html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
