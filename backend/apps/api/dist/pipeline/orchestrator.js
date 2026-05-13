import { analyzeGeneratedOutput, applySuggestionToOutput } from '@forma/analysis-engine';
import { generateGutenberg } from '@forma/gutenberg-generator';
import { randomUUID } from 'node:crypto';
import { buildExportArtifact } from '../exports/builder.js';
import { buildIframePreview } from '../previews/preview.js';
export async function processProjectBundle(deps, input) {
    const sessionId = await deps.store.createSession(input.projectId);
    await stage(deps, sessionId, input.projectId, 'uploaded', 10, 'upload.progress');
    await stage(deps, sessionId, input.projectId, 'converting_gutenberg', 30, 'conversion.progress');
    const output = await generateGutenberg({
        projectId: input.projectId,
        sessionId,
        uploadId: input.uploadId,
        files: input.files,
        artifactWriter: deps.storage
    });
    await deps.store.saveGeneratedOutput(output);
    await stage(deps, sessionId, input.projectId, 'analyzing_output', 55, 'analysis.progress');
    const analysis = analyzeGeneratedOutput({
        generated: output,
        assets: input.files.map(toBundleAsset)
    });
    await deps.store.saveAnalysis(input.projectId, output.id, analysis);
    await stage(deps, sessionId, input.projectId, 'generating_ai_suggestions', 75, 'suggestions.generated');
    const suggestions = await deps.ai.suggest({ projectId: input.projectId, output, analysis });
    await deps.store.saveSuggestions(output.id, suggestions);
    await deps.events.publish(input.projectId, 'suggestions.generated', { suggestions });
    await stage(deps, sessionId, input.projectId, 'building_export', 88, 'export.ready');
    const exportArtifact = await buildExportArtifact(output, { type: 'blocks_only' });
    const storedExport = await deps.storage.putObject(`projects/${input.projectId}/sessions/${sessionId}/exports/${exportArtifact.filename}`, exportArtifact.body, exportArtifact.contentType);
    await deps.store.saveExport(input.projectId, output.id, 'blocks_only', storedExport.key, { url: storedExport.url });
    await stage(deps, sessionId, input.projectId, 'storing_artifacts', 95, 'preview.updated');
    const preview = buildIframePreview(output);
    const storedPreview = await deps.storage.putObject(`projects/${input.projectId}/sessions/${sessionId}/preview/index.html`, preview, 'text/html');
    await deps.events.publish(input.projectId, 'preview.updated', { url: storedPreview.url });
    await deps.store.updateSession(sessionId, 'completed', 100);
    return { sessionId, output, suggestions };
}
export async function applyProjectSuggestion(deps, input) {
    const [output, suggestion] = await Promise.all([
        deps.store.latestOutput(input.projectId),
        deps.store.getSuggestion(input.projectId, input.suggestionId)
    ]);
    if (!output || !suggestion) {
        throw new Error('Output or suggestion not found');
    }
    const transformed = {
        ...applySuggestionToOutput(output, suggestion),
        id: randomUUID(),
        createdAt: new Date().toISOString()
    };
    await deps.store.saveGeneratedOutput(transformed);
    await deps.store.markSuggestionApplied(input.suggestionId);
    const preview = buildIframePreview(transformed);
    const storedPreview = await deps.storage.putObject(`projects/${input.projectId}/outputs/${transformed.id}/preview/index.html`, preview, 'text/html');
    await deps.events.publish(input.projectId, 'preview.updated', { url: storedPreview.url, suggestionId: input.suggestionId });
    return transformed;
}
export async function exportProject(deps, input) {
    const output = await deps.store.latestOutput(input.projectId);
    if (!output)
        throw new Error('No generated output available for export');
    const artifact = await buildExportArtifact(output, input.request);
    const stored = await deps.storage.putObject(`projects/${input.projectId}/outputs/${output.id}/exports/${artifact.filename}`, artifact.body, artifact.contentType);
    await deps.store.saveExport(input.projectId, output.id, input.request.type, stored.key, { url: stored.url });
    await deps.events.publish(input.projectId, 'export.ready', { type: input.request.type, url: stored.url });
    return stored;
}
async function stage(deps, sessionId, projectId, currentStage, progress, event) {
    await deps.store.updateSession(sessionId, currentStage, progress);
    await deps.events.publish(projectId, event, { currentStage, progress, sessionId });
}
function toBundleAsset(file) {
    return {
        path: file.path,
        mime: file.mime,
        content: file.content.toString('utf8')
    };
}
//# sourceMappingURL=orchestrator.js.map