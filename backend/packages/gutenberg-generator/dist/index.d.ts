import { type GeneratedOutput } from '@forma/shared';
export type ProjectBundleFile = {
    path: string;
    mime: string;
    size: number;
    content: Buffer;
};
export type ArtifactWriter = {
    putObject: (key: string, body: Buffer | string, contentType: string) => Promise<{
        key: string;
        url: string;
    }>;
};
export type HtmlToGutenbergConverter = (html: string, options?: Record<string, unknown>) => Promise<unknown> | unknown;
export type GenerateGutenbergInput = {
    projectId: string;
    sessionId: string;
    uploadId: string;
    files: ProjectBundleFile[];
    artifactWriter: ArtifactWriter;
    converter?: HtmlToGutenbergConverter;
};
export type GutenbergBlock = Record<string, unknown> & {
    id: string;
    name: string;
    originalHtml?: string;
};
type NormalizedConverterOutput = {
    blocks: GutenbergBlock[];
    markup: string;
    generatedFiles?: Record<string, string>;
    warnings?: string[];
};
export declare function selectHtmlEntry(files: ProjectBundleFile[]): ProjectBundleFile;
export declare function selectHtmlEntries(files: ProjectBundleFile[]): ProjectBundleFile[];
export declare function normalizeConverterOutput(raw: unknown, sourceHtml: string, blockIdentity?: {
    title: string;
    slug: string;
    namespace?: string;
}): NormalizedConverterOutput;
export declare function generateGutenberg(input: GenerateGutenbergInput): Promise<GeneratedOutput>;
export declare function generatePluginZipBuffer(input: {
    html: string;
    projectId: string;
    sessionId: string;
    uploadId: string;
    converter?: HtmlToGutenbergConverter;
    assets?: Array<{
        path: string;
        mime: string;
        size: number;
    }>;
}): Promise<Buffer>;
export declare function generateMultiBlockPluginZipBuffer(input: {
    blocks: Array<Record<string, unknown>>;
    projectId: string;
    sessionId: string;
    uploadId: string;
}): Promise<Buffer>;
export declare function generateReactZipBuffer(input: {
    html?: string;
    projectId: string;
    sessionId: string;
    uploadId: string;
    assets?: Array<{
        path: string;
        mime: string;
        size: number;
    }>;
}): Promise<Buffer>;
export declare function generateMultiReactZipBuffer(input: {
    blocks: Array<Record<string, unknown>>;
    projectId: string;
    sessionId: string;
    uploadId: string;
}): Promise<Buffer>;
export {};
//# sourceMappingURL=index.d.ts.map