import type { ExportRequest, GeneratedOutput } from '@forma/shared';
export declare function buildExportArtifact(output: GeneratedOutput, request: ExportRequest): Promise<{
    filename: string;
    contentType: string;
    body: string | Buffer;
}>;
//# sourceMappingURL=builder.d.ts.map