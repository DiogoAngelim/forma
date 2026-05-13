import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyOauth2 from '@fastify/oauth2';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { sql } from 'kysely';
import { AppError, exportRequestSchema } from '@forma/shared';
import { createAiProvider } from '../ai/providers.js';
import { billingPlans, createStripeClient, ensureStripePrice, getBillingPlan, getBillingPlanByLookupKey, publicPlan } from '../billing/stripe.js';
import { KyselySessionStore } from '../db/repositories.js';
import { ProjectEventBroker, serializeSse } from '../events/broker.js';
import { exportProject, applyProjectSuggestion, processProjectBundle } from '../pipeline/orchestrator.js';
import { buildIframePreview } from '../previews/preview.js';
import { assertZipUpload, extractZipBundle } from '../uploads/zip.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
const credentialsSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1).max(160).optional()
});
const projectCreateSchema = z.object({
    name: z.string().min(1).max(120),
    metadata: z.record(z.unknown()).default({})
});
const projectMetadataUpdateSchema = z.object({
    tags: z.array(z.string()).max(24).optional(),
    remoteStyles: z.array(z.string().url()).max(24).optional(),
    remoteScripts: z.array(z.string().url()).max(24).optional()
}).passthrough();
const projectUpdateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    metadata: projectMetadataUpdateSchema.optional()
}).refine((value) => value.name !== undefined || value.metadata !== undefined, {
    message: 'Project update must include a name or metadata'
});
const urlImportSchema = z.object({
    url: z.string().url()
});
const paramsIdSchema = z.object({ id: z.string().uuid() });
const paramsSuggestionSchema = z.object({ id: z.string().uuid(), suggestionId: z.string().uuid() });
const projectBatchDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });
const publicReactionSchema = z.object({ reaction: z.enum(['like', 'dislike']), active: z.boolean().optional() });
const outputUpdateSchema = z.object({
    markup: z.string(),
    blocks: z.array(z.record(z.unknown())),
    metadata: z.record(z.unknown()).optional()
});
const billingCheckoutSchema = z.object({ planId: z.enum(['pro', 'studio']) });
export async function buildApp(deps) {
    const app = Fastify({ logger: { level: deps.env.LOG_LEVEL } }).withTypeProvider();
    const events = deps.events ?? new ProjectEventBroker(deps.db);
    const store = new KyselySessionStore(deps.db);
    const ai = createAiProvider({ openAiKey: deps.env.OPENAI_API_KEY, anthropicKey: deps.env.ANTHROPIC_API_KEY });
    const stripe = createStripeClient(deps.env);
    await ensureBillingSchema(deps.db);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof AppError) {
            return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
        }
        const candidate = error;
        const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500;
        const message = typeof candidate.message === 'string' ? candidate.message : 'Internal server error';
        return reply.status(statusCode).send({ error: { code: 'internal_error', message } });
    });
    await app.register(cors, { origin: deps.env.FRONTEND_URL, credentials: true });
    await app.register(helmet);
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    await app.register(jwt, { secret: deps.env.JWT_SECRET });
    await app.register(multipart, { limits: { fileSize: deps.env.MAX_UPLOAD_BYTES, files: 250 } });
    await app.register(fastifyOauth2, {
        name: 'googleOAuth2',
        scope: ['profile', 'email', 'openid'],
        credentials: {
            client: {
                id: deps.env.GOOGLE_CLIENT_ID,
                secret: deps.env.GOOGLE_CLIENT_SECRET
            },
            auth: fastifyOauth2.GOOGLE_CONFIGURATION
        },
        startRedirectPath: '/auth/google',
        callbackUri: `${deps.env.APP_URL}/auth/google/callback`
    });
    await app.register(swagger, {
        openapi: {
            info: { title: 'Forma Gutenberg Platform API', version: '0.1.0' }
        }
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
    app.decorate('authenticate', async function authenticate(request) {
        await request.jwtVerify();
    });
    app.get('/health', async () => ({ ok: true }));
    app.get('/projects/*', async (request, reply) => {
        const storageKey = request.params['*'];
        const normalizedKey = normalize(`projects/${storageKey}`);
        if (!normalizedKey.startsWith('projects/') || normalizedKey.includes('..')) {
            throw new AppError(400, 'invalid_storage_key', 'Invalid storage key');
        }
        const body = await readFile(join(process.cwd(), 'storage', normalizedKey));
        return reply
            .header('Cross-Origin-Resource-Policy', 'cross-origin')
            .type(contentTypeForPath(normalizedKey))
            .send(body);
    });
    async function handleRegister(request, reply) {
        const { email, password, name } = request.body;
        const existingUser = await deps.db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
        if (existingUser) {
            throw new AppError(409, 'email_already_registered', 'An account with this email already exists');
        }
        const id = randomUUID();
        await deps.db.insertInto('users').values({ id, email, full_name: name ?? null, password_hash: hashPassword(password), provider: null, created_at: new Date().toISOString() }).execute();
        const token = app.jwt.sign({ sub: id, email, name, provider: 'password' });
        return reply.status(201).send({ token, user: { id, email, name: name ?? null, provider: 'password' } });
    }
    async function handleLogin(request, reply) {
        const { email, password } = request.body;
        const user = await deps.db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
        if (!user || !user.password_hash || !verifyPassword(password, user.password_hash))
            throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
        const token = app.jwt.sign({ sub: user.id, email: user.email, name: user.full_name ?? undefined, provider: user.provider ?? 'password' });
        return reply.send({ token, user: { id: user.id, email: user.email, name: user.full_name ?? null, provider: user.provider ?? 'password' } });
    }
    app.post('/auth/register', { schema: { body: credentialsSchema } }, handleRegister);
    app.post('/auth/login', { schema: { body: credentialsSchema } }, handleLogin);
    app.post('/api/auth/register', { schema: { body: credentialsSchema } }, handleRegister);
    app.post('/api/auth/login', { schema: { body: credentialsSchema } }, handleLogin);
    async function handleListProjects(request) {
        const projects = await deps.db.selectFrom('projects').selectAll().where('user_id', '=', request.user.sub).orderBy('created_at', 'desc').execute();
        return Promise.all(projects.map(async (project) => {
            const output = await store.latestOutput(project.id);
            const projectMetadata = parseJson(project.metadata, {});
            const outputMetadata = output?.metadata ?? {};
            const metadata = {
                ...projectMetadata,
                previewImageUrl: firstPreviewImageUrl(outputMetadata) ?? projectMetadata.previewImageUrl ?? null,
                blockCount: Array.isArray(output?.blocks) ? output.blocks.length : 0,
                generatedFileCount: Array.isArray(outputMetadata.generatedFiles) ? outputMetadata.generatedFiles.length : 0
            };
            return {
                ...project,
                metadata,
                createdAt: timestamp(project.created_at),
                updatedAt: timestamp(project.updated_at)
            };
        }));
    }
    async function handleCreateProject(request, reply) {
        const id = randomUUID();
        await deps.db
            .insertInto('projects')
            .values({ id, user_id: request.user.sub, name: request.body.name, status: 'draft', metadata: JSON.stringify(request.body.metadata), created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .execute();
        return reply.status(201).send({ id, name: request.body.name, status: 'draft', metadata: request.body.metadata });
    }
    app.get('/projects', { preHandler: [app.authenticate] }, handleListProjects);
    app.post('/projects', { preHandler: [app.authenticate], schema: { body: projectCreateSchema } }, handleCreateProject);
    app.get('/auth/google/callback', async function (request, reply) {
        const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${token.access_token}`
            }
        });
        const userInfo = await response.json();
        const { email, name, picture } = userInfo;
        let user = await deps.db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
        if (!user) {
            const id = randomUUID();
            await deps.db.insertInto('users').values({ id, email, full_name: name ?? null, password_hash: null, provider: 'google', created_at: new Date().toISOString() }).execute();
            user = { id, email, full_name: name ?? null, password_hash: null, provider: 'google', created_at: new Date() };
        }
        else if (name && !user.full_name) {
            await deps.db.updateTable('users').set({ full_name: name }).where('id', '=', user.id).execute();
            user = { ...user, full_name: name };
        }
        const jwtToken = app.jwt.sign({ sub: user.id, email: user.email, name, picture, provider: 'google' });
        return reply.redirect(`${deps.env.FRONTEND_URL}?token=${jwtToken}`);
    });
    app.get('/public/:slug', { schema: { params: z.object({ slug: z.string() }) } }, async (request) => {
        const project = await deps.db
            .selectFrom('public_projects')
            .innerJoin('projects', 'projects.id', 'public_projects.project_id')
            .innerJoin('users', 'users.id', 'projects.user_id')
            .select([
            'public_projects.id as id',
            'public_projects.project_id as project_id',
            'public_projects.slug as slug',
            'public_projects.title as title',
            'public_projects.before_snapshot as before_snapshot',
            'public_projects.after_snapshot as after_snapshot',
            'public_projects.metadata as metadata',
            'public_projects.created_at as created_at',
            'projects.created_at as project_created_at',
            'users.full_name as author_name',
            'users.email as author_email'
        ])
            .where('public_projects.slug', '=', request.params.slug)
            .where('projects.status', '=', 'published')
            .executeTakeFirst();
        if (!project)
            throw new AppError(404, 'public_project_not_found', 'Public project not found');
        const metadata = parseJson(project.metadata, {});
        return {
            id: project.id,
            projectId: project.project_id,
            slug: project.slug,
            title: project.title,
            beforeSnapshot: parseJson(project.before_snapshot, {}),
            afterSnapshot: parseJson(project.after_snapshot, {}),
            metadata,
            author: publicProjectAuthor(project, metadata),
            createdAt: timestamp(project.created_at),
            projectCreatedAt: timestamp(project.project_created_at)
        };
    });
    await app.register(async (webhookApp) => {
        webhookApp.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
            done(null, body);
        });
        webhookApp.post('/billing/webhook', async (request, reply) => {
            if (!stripe || !deps.env.STRIPE_WEBHOOK_SECRET) {
                throw new AppError(503, 'stripe_not_configured', 'Stripe webhooks are not configured');
            }
            const signature = request.headers['stripe-signature'];
            if (typeof signature !== 'string') {
                throw new AppError(400, 'missing_stripe_signature', 'Missing Stripe signature');
            }
            let event;
            try {
                event = stripe.webhooks.constructEvent(request.body, signature, deps.env.STRIPE_WEBHOOK_SECRET);
            }
            catch {
                throw new AppError(400, 'invalid_stripe_signature', 'Invalid Stripe signature');
            }
            await handleStripeEvent(deps.db, stripe, event);
            return reply.send({ received: true });
        });
    }, { prefix: '/api' });
    // Register all API routes with /api prefix
    await app.register(async (apiApp) => {
        apiApp.get('/me', { preHandler: [app.authenticate] }, async (request) => {
            const user = await deps.db
                .selectFrom('users')
                .select(['id', 'email', 'full_name', 'provider', 'created_at'])
                .where('id', '=', request.user.sub)
                .executeTakeFirst();
            if (!user)
                throw new AppError(404, 'user_not_found', 'User not found');
            return {
                id: user.id,
                email: user.email,
                name: user.full_name ?? (typeof request.user.name === 'string' ? request.user.name : null),
                avatar: typeof request.user.picture === 'string' ? request.user.picture : null,
                provider: user.provider ?? request.user.provider ?? null,
                createdAt: timestamp(user.created_at),
                billing: await billingStatusForUser(deps.db, user.id)
            };
        });
        apiApp.delete('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
            const projects = await deps.db.selectFrom('projects').select('id').where('user_id', '=', request.user.sub).execute();
            await deleteOwnedProjects(deps.db, projects.map((project) => project.id), request.user.sub);
            await deps.db.deleteFrom('users').where('id', '=', request.user.sub).execute();
            return reply.status(204).send();
        });
        apiApp.get('/billing/plans', { preHandler: [app.authenticate] }, async () => ({
            plans: billingPlans.map(publicPlan),
            publishableKey: deps.env.STRIPE_PUBLISHABLE_KEY ?? null,
            stripeConfigured: Boolean(stripe)
        }));
        apiApp.get('/billing/subscription', { preHandler: [app.authenticate] }, async (request) => {
            return billingStatusForUser(deps.db, request.user.sub);
        });
        apiApp.post('/billing/checkout', { preHandler: [app.authenticate], schema: { body: billingCheckoutSchema } }, async (request) => {
            if (!stripe)
                throw new AppError(503, 'stripe_not_configured', 'Stripe is not configured');
            const plan = getBillingPlan(request.body.planId);
            if (!plan)
                throw new AppError(400, 'invalid_plan', 'Unknown billing plan');
            const user = await deps.db
                .selectFrom('users')
                .select(['id', 'email', 'full_name'])
                .where('id', '=', request.user.sub)
                .executeTakeFirst();
            if (!user)
                throw new AppError(404, 'user_not_found', 'User not found');
            const billing = await billingStatusForUser(deps.db, user.id);
            if (billing.stripeCustomerId && ['active', 'trialing', 'past_due'].includes(billing.status)) {
                const portal = await stripe.billingPortal.sessions.create({
                    customer: billing.stripeCustomerId,
                    return_url: `${deps.env.FRONTEND_URL}/profile?tab=billing`
                });
                return { url: portal.url, mode: 'portal' };
            }
            const customerId = await getOrCreateStripeCustomer(deps.db, stripe, user);
            const price = await ensureStripePrice(stripe, plan);
            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                customer: customerId,
                line_items: [{ price: price.id, quantity: 1 }],
                allow_promotion_codes: true,
                client_reference_id: user.id,
                metadata: { userId: user.id, planId: plan.id },
                subscription_data: {
                    trial_period_days: plan.trialDays,
                    metadata: { userId: user.id, planId: plan.id }
                },
                success_url: `${deps.env.FRONTEND_URL}/profile?tab=billing&checkout=success`,
                cancel_url: `${deps.env.FRONTEND_URL}/profile?tab=billing&checkout=cancelled`
            });
            return { url: session.url, mode: 'checkout' };
        });
        apiApp.post('/billing/portal', { preHandler: [app.authenticate] }, async (request) => {
            if (!stripe)
                throw new AppError(503, 'stripe_not_configured', 'Stripe is not configured');
            const billing = await billingStatusForUser(deps.db, request.user.sub);
            if (!billing.stripeCustomerId) {
                throw new AppError(409, 'billing_customer_missing', 'Start a subscription before opening the billing portal');
            }
            const session = await stripe.billingPortal.sessions.create({
                customer: billing.stripeCustomerId,
                return_url: `${deps.env.FRONTEND_URL}/profile?tab=billing`
            });
            return { url: session.url };
        });
        apiApp.get('/projects', { preHandler: [app.authenticate] }, handleListProjects);
        apiApp.post('/projects', { preHandler: [app.authenticate], schema: { body: projectCreateSchema } }, handleCreateProject);
        apiApp.get('/projects/:id', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            const project = await deps.db.selectFrom('projects').selectAll().where('id', '=', request.params.id).where('user_id', '=', request.user.sub).executeTakeFirst();
            if (!project)
                throw new AppError(404, 'project_not_found', 'Project not found');
            return { ...project, metadata: parseJson(project.metadata, {}), createdAt: timestamp(project.created_at), updatedAt: timestamp(project.updated_at) };
        });
        apiApp.patch('/projects/:id', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, body: projectUpdateSchema } }, async (request) => {
            const project = await deps.db
                .selectFrom('projects')
                .select(['id', 'name', 'metadata'])
                .where('id', '=', request.params.id)
                .where('user_id', '=', request.user.sub)
                .executeTakeFirst();
            if (!project)
                throw new AppError(404, 'project_not_found', 'Project not found');
            const now = new Date().toISOString();
            const metadataPatch = normalizeProjectMetadataPatch(request.body.metadata);
            const projectMetadata = metadataPatch
                ? { ...parseJson(project.metadata, {}), ...metadataPatch }
                : null;
            const updateValues = { updated_at: now };
            if (request.body.name !== undefined)
                updateValues.name = request.body.name;
            if (projectMetadata)
                updateValues.metadata = JSON.stringify(projectMetadata);
            await deps.db
                .updateTable('projects')
                .set(updateValues)
                .where('id', '=', request.params.id)
                .execute();
            const publicProject = await deps.db
                .selectFrom('public_projects')
                .select(['id', 'metadata'])
                .where('project_id', '=', request.params.id)
                .executeTakeFirst();
            if (publicProject) {
                const publicValues = {};
                if (request.body.name !== undefined)
                    publicValues.title = request.body.name;
                if (metadataPatch) {
                    publicValues.metadata = JSON.stringify({
                        ...parseJson(publicProject.metadata, {}),
                        ...metadataPatch
                    });
                }
                if (Object.keys(publicValues).length) {
                    await deps.db
                        .updateTable('public_projects')
                        .set(publicValues)
                        .where('id', '=', publicProject.id)
                        .execute();
                }
            }
            return { id: request.params.id, name: request.body.name ?? project.name, metadata: projectMetadata ?? parseJson(project.metadata, {}), updatedAt: now };
        });
        apiApp.delete('/projects', { preHandler: [app.authenticate], schema: { body: projectBatchDeleteSchema } }, async (request, reply) => {
            await deleteOwnedProjects(deps.db, request.body.ids, request.user.sub);
            return reply.status(204).send();
        });
        apiApp.post('/projects/:id/duplicate', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request, reply) => {
            const project = await deps.db.selectFrom('projects').selectAll().where('id', '=', request.params.id).where('user_id', '=', request.user.sub).executeTakeFirst();
            if (!project)
                throw new AppError(404, 'project_not_found', 'Project not found');
            const id = randomUUID();
            const name = `${project.name} Copy`;
            await deps.db
                .insertInto('projects')
                .values({
                id,
                user_id: request.user.sub,
                name,
                status: 'draft',
                metadata: typeof project.metadata === 'string' ? project.metadata : JSON.stringify(project.metadata),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .execute();
            return reply.status(201).send({ id, name, status: 'draft', metadata: parseJson(project.metadata, {}) });
        });
        apiApp.delete('/projects/:id', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request, reply) => {
            await deleteOwnedProjects(deps.db, [request.params.id], request.user.sub, { requireAll: true });
            return reply.status(204).send();
        });
        apiApp.get('/projects/:id/output', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const output = await store.latestOutput(request.params.id);
            if (!output)
                throw new AppError(404, 'output_not_found', 'Upload and convert a project before loading output');
            return output;
        });
        apiApp.patch('/projects/:id/output', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, body: outputUpdateSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const output = await store.latestOutput(request.params.id);
            if (!output)
                throw new AppError(404, 'output_not_found', 'Upload and convert a project before updating output');
            const metadata = {
                ...output.metadata,
                ...(request.body.metadata ?? {}),
                editedAt: new Date().toISOString()
            };
            await deps.db
                .updateTable('generated_outputs')
                .set({
                markup: request.body.markup,
                blocks: JSON.stringify(request.body.blocks),
                metadata: JSON.stringify(metadata)
            })
                .where('id', '=', output.id)
                .execute();
            return {
                ...output,
                markup: request.body.markup,
                blocks: request.body.blocks,
                metadata
            };
        });
        apiApp.get('/projects/:id/source-files', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const upload = await deps.db
                .selectFrom('uploads')
                .select(['id', 'kind', 'manifest', 'created_at'])
                .where('project_id', '=', request.params.id)
                .where('user_id', '=', request.user.sub)
                .orderBy('created_at', 'desc')
                .executeTakeFirst();
            if (!upload) {
                return { files: [] };
            }
            return {
                id: upload.id,
                kind: upload.kind,
                files: parseManifestFiles(upload.manifest),
                createdAt: timestamp(upload.created_at)
            };
        });
        apiApp.get('/projects/:id/source-file', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, querystring: z.object({ path: z.string().min(1) }) } }, async (request, reply) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const upload = await deps.db
                .selectFrom('uploads')
                .select(['manifest'])
                .where('project_id', '=', request.params.id)
                .where('user_id', '=', request.user.sub)
                .orderBy('created_at', 'desc')
                .executeTakeFirst();
            if (!upload)
                throw new AppError(404, 'source_files_not_found', 'No source files found for project');
            const sourceFile = parseManifestFiles(upload.manifest).find((file) => file.path === request.query.path);
            if (!sourceFile?.r2Key)
                throw new AppError(404, 'source_file_not_found', 'Source file not found');
            const normalizedKey = normalize(sourceFile.r2Key);
            if (!normalizedKey.startsWith('projects/') || normalizedKey.includes('..')) {
                throw new AppError(400, 'invalid_storage_key', 'Invalid storage key');
            }
            const body = await readFile(join(process.cwd(), 'storage', normalizedKey));
            return reply.type(sourceFile.mime ?? contentTypeForPath(sourceFile.path)).send(body);
        });
        apiApp.post('/projects/:id/source-files', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const files = (await readMultipartLooseFiles(request)).filter(isSupplementalSourceFile);
            if (!files.length) {
                throw new AppError(422, 'unsupported_source_file', 'Upload CSS, Sass, Less, JavaScript, or TypeScript files');
            }
            const existingUpload = await deps.db
                .selectFrom('uploads')
                .select(['id', 'kind', 'manifest', 'created_at'])
                .where('project_id', '=', request.params.id)
                .where('user_id', '=', request.user.sub)
                .orderBy('created_at', 'desc')
                .executeTakeFirst();
            const uploadId = existingUpload?.id ?? randomUUID();
            const storedFiles = await Promise.all(files.map(async (file) => {
                const stored = await deps.storage.putObject(`projects/${request.params.id}/uploads/${uploadId}/source/${file.path}`, file.content, file.mime);
                return { path: file.path, mime: file.mime, size: file.size, r2Key: stored.key };
            }));
            const existingManifest = parseJson(existingUpload?.manifest, {});
            const mergedFiles = mergeManifestFiles(parseManifestFiles(existingUpload?.manifest), storedFiles);
            const manifest = JSON.stringify({
                ...existingManifest,
                files: mergedFiles,
                order: mergedFiles.map((file) => file.path)
            });
            const now = new Date().toISOString();
            if (existingUpload) {
                await deps.db.updateTable('uploads').set({ manifest }).where('id', '=', existingUpload.id).execute();
            }
            else {
                await deps.db
                    .insertInto('uploads')
                    .values({
                    id: uploadId,
                    project_id: request.params.id,
                    user_id: request.user.sub,
                    kind: 'multi_file',
                    r2_key: `projects/${request.params.id}/uploads/${uploadId}/supplemental-files.json`,
                    manifest,
                    created_at: now
                })
                    .execute();
            }
            return {
                id: uploadId,
                kind: existingUpload?.kind ?? 'multi_file',
                files: mergedFiles,
                createdAt: timestamp(existingUpload?.created_at ?? now)
            };
        });
        apiApp.get('/projects/:id/preview', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request, reply) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const project = await deps.db.selectFrom('projects').select(['metadata']).where('id', '=', request.params.id).executeTakeFirst();
            const output = await store.latestOutput(request.params.id);
            if (!output)
                throw new AppError(404, 'output_not_found', 'Upload and convert a project before previewing');
            const metadata = parseJson(project?.metadata, {});
            const styles = await readGeneratedStyles(output);
            return reply.type('text/html').send(buildIframePreview(output, {
                baseHref: typeof metadata.sourceUrl === 'string' ? metadata.sourceUrl : null,
                styles,
                remoteStyles: normalizeUrlList(metadata.remoteStyles),
                remoteScripts: normalizeUrlList(metadata.remoteScripts)
            }));
        });
        apiApp.post('/projects/:id/upload', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request, reply) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const uploadId = randomUUID();
            const upload = await readMultipartProjectBundle(request, uploadId);
            const files = upload.files;
            const bundleKey = `projects/${request.params.id}/uploads/${uploadId}/${upload.bundleName}`;
            await deps.storage.putObject(bundleKey, upload.originalBody, upload.contentType);
            const sourceFiles = await Promise.all(files.map(async (file) => {
                const stored = await deps.storage.putObject(`projects/${request.params.id}/uploads/${uploadId}/source/${file.path}`, file.content, file.mime);
                return { path: file.path, mime: file.mime, size: file.size, r2Key: stored.key };
            }));
            await deps.db
                .insertInto('uploads')
                .values({
                id: uploadId,
                project_id: request.params.id,
                user_id: request.user.sub,
                kind: upload.kind,
                r2_key: bundleKey,
                manifest: JSON.stringify({ files: sourceFiles, order: sourceFiles.map((file) => file.path) }),
                created_at: new Date().toISOString()
            })
                .execute();
            const result = await processProjectBundle({ store, storage: deps.storage, events, ai }, { projectId: request.params.id, uploadId, files });
            return reply.status(202).send(result);
        });
        apiApp.post('/projects/:id/import/url', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, body: urlImportSchema } }, async (request, reply) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const sourceUrl = new URL(request.body.url);
            if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
                throw new AppError(400, 'unsupported_import_url', 'Only HTTP and HTTPS URLs can be imported');
            }
            const response = await fetch(sourceUrl, {
                headers: {
                    accept: 'text/html,application/xhtml+xml,text/css,*/*;q=0.8',
                    'user-agent': 'FormaImporter/0.1'
                }
            });
            if (!response.ok) {
                throw new AppError(422, 'url_import_failed', `Could not fetch URL: ${response.status}`);
            }
            const html = await response.text();
            if (!html.trim()) {
                throw new AppError(422, 'url_import_empty', 'The imported URL returned an empty response');
            }
            const uploadId = randomUUID();
            const htmlPath = htmlEntryPath(sourceUrl);
            const storedSource = await deps.storage.putObject(`projects/${request.params.id}/uploads/${uploadId}/source/${htmlPath}`, html, 'text/html');
            const files = [
                {
                    path: htmlPath,
                    mime: 'text/html',
                    size: Buffer.byteLength(html),
                    content: Buffer.from(html)
                }
            ];
            await deps.db
                .insertInto('uploads')
                .values({
                id: uploadId,
                project_id: request.params.id,
                user_id: request.user.sub,
                kind: 'url',
                r2_key: sourceUrl.toString(),
                manifest: JSON.stringify({ url: sourceUrl.toString(), files: files.map((file) => ({ path: file.path, mime: file.mime, size: file.size, r2Key: storedSource.key })) }),
                created_at: new Date().toISOString()
            })
                .execute();
            const result = await processProjectBundle({ store, storage: deps.storage, events, ai }, { projectId: request.params.id, uploadId, files });
            return reply.status(202).send(result);
        });
        apiApp.post('/projects/:id/import/github', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            throw new AppError(501, 'github_import_not_configured', 'GitHub repository imports are optional and not enabled in this deployment');
        });
        apiApp.post('/projects/:id/convert', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            throw new AppError(409, 'upload_required', 'Conversion is orchestrated from structured project bundle uploads');
        });
        apiApp.get('/ai/status', { preHandler: [app.authenticate] }, async () => {
            return {
                enabled: Boolean(deps.env.OPENAI_API_KEY),
                provider: deps.env.OPENAI_API_KEY ? 'openai' : null
            };
        });
        apiApp.get('/projects/:id/events', { schema: { params: paramsIdSchema } }, async (request, reply) => {
            reply.raw.writeHead(200, {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                connection: 'keep-alive'
            });
            const unsubscribe = events.subscribe(request.params.id, (event) => reply.raw.write(serializeSse(event)));
            request.raw.on('close', unsubscribe);
        });
        apiApp.get('/projects/:id/suggestions', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            return deps.db.selectFrom('ai_suggestions').selectAll().where('project_id', '=', request.params.id).orderBy('created_at', 'desc').execute();
        });
        apiApp.post('/projects/:id/suggestions/:suggestionId/apply', { preHandler: [app.authenticate], schema: { params: paramsSuggestionSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            return applyProjectSuggestion({ store, storage: deps.storage, events, ai }, { projectId: request.params.id, suggestionId: request.params.suggestionId });
        });
        apiApp.post('/projects/:id/export', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, body: exportRequestSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            return exportProject({ store, storage: deps.storage, events, ai }, { projectId: request.params.id, request: request.body });
        });
        apiApp.post('/projects/:id/publish', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, body: z.object({ slug: z.string().min(3), title: z.string().min(1) }) } }, async (request) => {
            const project = await deps.db
                .selectFrom('projects')
                .selectAll()
                .where('id', '=', request.params.id)
                .where('user_id', '=', request.user.sub)
                .executeTakeFirst();
            if (!project)
                throw new AppError(404, 'project_not_found', 'Project not found');
            const output = await store.latestOutput(request.params.id);
            if (!output)
                throw new AppError(409, 'missing_output', 'Generate Gutenberg output before publishing');
            const existingPublicProject = await deps.db
                .selectFrom('public_projects')
                .selectAll()
                .where('project_id', '=', request.params.id)
                .executeTakeFirst();
            const slug = await uniquePublicSlug(deps.db, slugifyPublicSlug(request.body.slug), existingPublicProject?.id);
            const now = new Date().toISOString();
            const projectMetadata = parseJson(project.metadata, {});
            const existingMetadata = parseJson(existingPublicProject?.metadata, {});
            const metadata = JSON.stringify({
                projectId: project.id,
                source: 'forma',
                tags: normalizeTags(projectMetadata.tags),
                sourceUrl: typeof projectMetadata.sourceUrl === 'string' ? projectMetadata.sourceUrl : null,
                sourceFileCount: output.metadata.sourceFileCount ?? 0,
                generatedFileCount: Array.isArray(output.metadata.generatedFiles) ? output.metadata.generatedFiles.length : 0,
                pluginZipUrl: output.metadata.pluginZipUrl ?? null,
                previewImageUrl: firstPreviewImageUrl(output.metadata) ?? projectMetadata.previewImageUrl ?? existingMetadata.previewImageUrl ?? null,
                remoteStyles: normalizeUrlList(projectMetadata.remoteStyles),
                remoteScripts: normalizeUrlList(projectMetadata.remoteScripts),
                likes: numericMetadataValue(existingMetadata.likes),
                dislikes: numericMetadataValue(existingMetadata.dislikes)
            });
            if (existingPublicProject) {
                await deps.db
                    .updateTable('public_projects')
                    .set({
                    slug,
                    title: request.body.title,
                    after_snapshot: JSON.stringify(output),
                    metadata,
                    created_at: now
                })
                    .where('id', '=', existingPublicProject.id)
                    .execute();
            }
            else {
                await deps.db.insertInto('public_projects').values({
                    id: randomUUID(),
                    project_id: request.params.id,
                    slug,
                    title: request.body.title,
                    before_snapshot: JSON.stringify({}),
                    after_snapshot: JSON.stringify(output),
                    metadata,
                    created_at: now
                }).execute();
            }
            await deps.db.updateTable('projects').set({ status: 'published', updated_at: now }).where('id', '=', request.params.id).execute();
            return { slug, url: `${deps.env.FRONTEND_URL.replace(/\/$/, '')}/project/${slug}` };
        });
        apiApp.post('/projects/:id/unpublish', { preHandler: [app.authenticate], schema: { params: paramsIdSchema } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const now = new Date().toISOString();
            await deps.db.deleteFrom('public_projects').where('project_id', '=', request.params.id).execute();
            await deps.db.updateTable('projects').set({ status: 'draft', updated_at: now }).where('id', '=', request.params.id).execute();
            return { status: 'draft', unpublishedAt: now };
        });
        apiApp.post('/projects/:id/versions', { preHandler: [app.authenticate], schema: { params: paramsIdSchema, body: z.object({ label: z.string().min(1) }) } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const output = await store.latestOutput(request.params.id);
            if (!output)
                throw new AppError(409, 'missing_output', 'Generate Gutenberg output before snapshotting');
            const id = randomUUID();
            await deps.db.insertInto('project_versions').values({ id, project_id: request.params.id, generated_output_id: output.id, label: request.body.label, snapshot: JSON.stringify(output), created_at: new Date().toISOString() }).execute();
            return { id };
        });
        apiApp.post('/projects/:id/versions/:versionId/restore', { preHandler: [app.authenticate], schema: { params: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }) } }, async (request) => {
            await assertProjectOwner(deps.db, request.params.id, request.user.sub);
            const version = await deps.db.selectFrom('project_versions').selectAll().where('id', '=', request.params.versionId).where('project_id', '=', request.params.id).executeTakeFirst();
            if (!version)
                throw new AppError(404, 'version_not_found', 'Project version not found');
            return version.snapshot;
        });
        apiApp.get('/showcase', async () => {
            const rows = await deps.db
                .selectFrom('public_projects')
                .innerJoin('projects', 'projects.id', 'public_projects.project_id')
                .innerJoin('users', 'users.id', 'projects.user_id')
                .select([
                'public_projects.slug as slug',
                'public_projects.title as title',
                'public_projects.metadata as metadata',
                'public_projects.after_snapshot as after_snapshot',
                'public_projects.created_at as created_at',
                'projects.status as status',
                'projects.created_at as project_created_at',
                'users.full_name as author_name',
                'users.email as author_email'
            ])
                .where('projects.status', '=', 'published')
                .orderBy('public_projects.created_at', 'desc')
                .execute();
            return rows.map((row) => {
                const output = parseJson(row.after_snapshot, {});
                const metadata = parseJson(row.metadata, {});
                return {
                    slug: row.slug,
                    title: row.title,
                    status: row.status,
                    metadata,
                    author: publicProjectAuthor(row, metadata),
                    blockCount: Array.isArray(output.blocks) ? output.blocks.length : 0,
                    generatedFileCount: Array.isArray(output.metadata?.generatedFiles) ? output.metadata.generatedFiles.length : 0,
                    likes: numericMetadataValue(metadata.likes),
                    dislikes: numericMetadataValue(metadata.dislikes),
                    previewImageUrl: firstPreviewImageUrl(output.metadata ?? {}) ?? metadata.previewImageUrl ?? null,
                    createdAt: timestamp(row.created_at),
                    projectCreatedAt: timestamp(row.project_created_at)
                };
            });
        });
        apiApp.get('/public/:slug', { schema: { params: z.object({ slug: z.string() }) } }, async (request) => {
            const project = await deps.db
                .selectFrom('public_projects')
                .innerJoin('projects', 'projects.id', 'public_projects.project_id')
                .innerJoin('users', 'users.id', 'projects.user_id')
                .select([
                'public_projects.id as id',
                'public_projects.project_id as project_id',
                'public_projects.slug as slug',
                'public_projects.title as title',
                'public_projects.before_snapshot as before_snapshot',
                'public_projects.after_snapshot as after_snapshot',
                'public_projects.metadata as metadata',
                'public_projects.created_at as created_at',
                'projects.created_at as project_created_at',
                'users.full_name as author_name',
                'users.email as author_email'
            ])
                .where('public_projects.slug', '=', request.params.slug)
                .where('projects.status', '=', 'published')
                .executeTakeFirst();
            if (!project)
                throw new AppError(404, 'public_project_not_found', 'Public project not found');
            const metadata = parseJson(project.metadata, {});
            return {
                id: project.id,
                projectId: project.project_id,
                slug: project.slug,
                title: project.title,
                beforeSnapshot: parseJson(project.before_snapshot, {}),
                afterSnapshot: parseJson(project.after_snapshot, {}),
                metadata,
                author: publicProjectAuthor(project, metadata),
                createdAt: timestamp(project.created_at),
                projectCreatedAt: timestamp(project.project_created_at)
            };
        });
        apiApp.post('/public/:slug/reaction', { schema: { params: z.object({ slug: z.string() }), body: publicReactionSchema } }, async (request) => {
            const project = await deps.db.selectFrom('public_projects').select(['id', 'metadata']).where('slug', '=', request.params.slug).executeTakeFirst();
            if (!project)
                throw new AppError(404, 'public_project_not_found', 'Public project not found');
            const metadata = parseJson(project.metadata, {});
            const key = request.body.reaction === 'like' ? 'likes' : 'dislikes';
            const currentValue = numericMetadataValue(metadata[key]);
            const nextMetadata = {
                ...metadata,
                [key]: request.body.active === false ? Math.max(0, currentValue - 1) : currentValue + 1
            };
            await deps.db.updateTable('public_projects').set({ metadata: JSON.stringify(nextMetadata) }).where('id', '=', project.id).execute();
            return {
                likes: numericMetadataValue(nextMetadata.likes),
                dislikes: numericMetadataValue(nextMetadata.dislikes)
            };
        });
    }, { prefix: '/api' });
    return app;
}
async function readMultipartProjectBundle(request, uploadId) {
    const parts = [];
    for await (const part of request.files()) {
        if (!part || part.type === 'field')
            continue;
        const filename = sanitizeUploadPath(part.filename ?? `file-${parts.length + 1}`);
        const buffer = await part.toBuffer();
        if (!buffer.byteLength)
            continue;
        parts.push({
            filename,
            mimetype: part.mimetype ?? contentTypeForPath(filename),
            buffer
        });
    }
    if (!parts.length) {
        throw new AppError(400, 'missing_file', 'Upload requires a ZIP file or one or more source files');
    }
    const onlyPart = parts[0];
    if (parts.length === 1 && onlyPart && isZipUploadPart(onlyPart)) {
        const part = onlyPart;
        assertZipUpload(part.filename, part.mimetype);
        return {
            kind: 'zip',
            bundleName: part.filename,
            originalBody: part.buffer,
            contentType: part.mimetype || 'application/zip',
            files: await extractZipBundle(part.buffer)
        };
    }
    const files = dedupeProjectBundlePaths(parts.map((part) => ({
        path: part.filename,
        mime: part.mimetype || contentTypeForPath(part.filename),
        size: part.buffer.byteLength,
        content: part.buffer
    })));
    if (!files.some((file) => isHtmlPath(file.path, file.mime))) {
        throw new AppError(422, 'bundle_missing_html', 'Upload must include at least one HTML page');
    }
    return {
        kind: 'multi_file',
        bundleName: 'multi-page-upload.json',
        originalBody: JSON.stringify({
            uploadId,
            files: files.map((file) => ({ path: file.path, mime: file.mime, size: file.size })),
            order: files.map((file) => file.path)
        }, null, 2),
        contentType: 'application/json; charset=utf-8',
        files
    };
}
async function readMultipartLooseFiles(request) {
    const parts = [];
    for await (const part of request.files()) {
        if (!part || part.type === 'field')
            continue;
        const filename = sanitizeUploadPath(part.filename ?? `file-${parts.length + 1}`);
        const buffer = await part.toBuffer();
        if (!buffer.byteLength)
            continue;
        parts.push({
            filename,
            mimetype: part.mimetype ?? contentTypeForPath(filename),
            buffer
        });
    }
    if (!parts.length) {
        throw new AppError(400, 'missing_file', 'Upload requires one or more files');
    }
    return dedupeProjectBundlePaths(parts.map((part) => ({
        path: part.filename,
        mime: part.mimetype || contentTypeForPath(part.filename),
        size: part.buffer.byteLength,
        content: part.buffer
    })));
}
function sanitizeUploadPath(value) {
    const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter((part) => part && part !== '.' && part !== '..');
    return parts.join('/') || 'file';
}
function isZipUploadPart(part) {
    return part.mimetype.includes('zip') || part.filename.toLowerCase().endsWith('.zip');
}
function dedupeProjectBundlePaths(files) {
    const seen = new Map();
    return files.map((file) => {
        const count = seen.get(file.path) ?? 0;
        seen.set(file.path, count + 1);
        if (count === 0)
            return file;
        const extension = extname(file.path);
        const stem = extension ? file.path.slice(0, -extension.length) : file.path;
        return {
            ...file,
            path: `${stem}-${count + 1}${extension}`
        };
    });
}
function isSupplementalSourceFile(file) {
    return /\.(css|scss|sass|less|js|mjs|cjs|ts|tsx)$/i.test(file.path);
}
function isHtmlPath(path, mime = '') {
    return mime.includes('html') || /\.html?$/i.test(path);
}
function publicProjectAuthor(row, metadata) {
    const metadataAuthor = metadata.author && typeof metadata.author === 'object'
        ? metadata.author
        : {};
    const email = typeof row.author_email === 'string' ? row.author_email : '';
    const name = firstString(row.author_name, metadataAuthor.name, email.split('@')[0]) ?? 'Forma creator';
    const avatar = firstString(metadataAuthor.avatar) ?? null;
    return { name, avatar };
}
function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}
function contentTypeForPath(path) {
    const extension = extname(path).toLowerCase();
    if (extension === '.html')
        return 'text/html; charset=utf-8';
    if (extension === '.json')
        return 'application/json; charset=utf-8';
    if (extension === '.js')
        return 'application/javascript; charset=utf-8';
    if (extension === '.css')
        return 'text/css; charset=utf-8';
    if (extension === '.svg')
        return 'image/svg+xml';
    if (extension === '.png')
        return 'image/png';
    if (extension === '.jpg' || extension === '.jpeg')
        return 'image/jpeg';
    if (extension === '.webp')
        return 'image/webp';
    if (extension === '.zip')
        return 'application/zip';
    return 'application/octet-stream';
}
function htmlEntryPath(url) {
    const pathname = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const filename = pathname.split('/').filter(Boolean).pop() || 'index.html';
    return filename.includes('.') ? filename : `${filename}.html`;
}
function parseManifestFiles(manifest) {
    const value = parseJson(manifest, {});
    if (!value || typeof value !== 'object' || !Array.isArray(value.files)) {
        return [];
    }
    const files = [];
    for (const file of value.files) {
        if (!file || typeof file !== 'object')
            continue;
        const row = file;
        if (typeof row.path !== 'string')
            continue;
        const parsedFile = { path: row.path };
        if (typeof row.mime === 'string')
            parsedFile.mime = row.mime;
        if (typeof row.size === 'number')
            parsedFile.size = row.size;
        if (typeof row.r2Key === 'string')
            parsedFile.r2Key = row.r2Key;
        files.push(parsedFile);
    }
    return files;
}
function mergeManifestFiles(existingFiles, addedFiles) {
    const merged = new Map();
    existingFiles.forEach((file) => merged.set(file.path, file));
    addedFiles.forEach((file) => merged.set(file.path, file));
    return [...merged.values()];
}
function timestamp(value) {
    return value instanceof Date ? value.toISOString() : String(value);
}
function parseJson(value, fallback) {
    if (typeof value !== 'string')
        return (value ?? fallback);
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
async function assertProjectOwner(db, projectId, userId) {
    const project = await db
        .selectFrom('projects')
        .select('id')
        .where('id', '=', projectId)
        .where('user_id', '=', userId)
        .executeTakeFirst();
    if (!project)
        throw new AppError(404, 'project_not_found', 'Project not found');
}
async function deleteOwnedProjects(db, projectIds, userId, options = {}) {
    const uniqueIds = [...new Set(projectIds)];
    if (!uniqueIds.length)
        return;
    const ownedProjects = await db
        .selectFrom('projects')
        .select('id')
        .where('id', 'in', uniqueIds)
        .where('user_id', '=', userId)
        .execute();
    const ownedIds = ownedProjects.map((project) => project.id);
    if (options.requireAll && ownedIds.length !== uniqueIds.length) {
        throw new AppError(404, 'project_not_found', 'Project not found');
    }
    if (!ownedIds.length)
        return;
    await db.deleteFrom('public_projects').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('project_versions').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('exports').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('ai_suggestions').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('analysis_results').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('generated_outputs').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('processing_sessions').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('project_events').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('assets').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('uploads').where('project_id', 'in', ownedIds).execute();
    await db.deleteFrom('projects').where('id', 'in', ownedIds).execute();
}
function firstPreviewImageUrl(metadata) {
    const previewImage = metadata.previewImageUrl ?? metadata.previewImage ?? metadata.thumbnailUrl ?? metadata.thumbnail;
    if (typeof previewImage === 'string' && previewImage.trim())
        return previewImage;
    const assets = metadata.assets;
    if (!Array.isArray(assets))
        return null;
    for (const asset of assets) {
        if (!asset || typeof asset !== 'object')
            continue;
        const row = asset;
        if (row.kind === 'image' && typeof row.url === 'string' && /^https?:\/\//i.test(row.url)) {
            return row.url;
        }
    }
    return null;
}
function numericMetadataValue(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.max(0, Math.floor(value));
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    return 0;
}
function normalizeProjectMetadataPatch(value) {
    if (!value || typeof value !== 'object')
        return null;
    const patch = { ...value };
    if ('tags' in patch)
        patch.tags = normalizeTags(patch.tags).slice(0, 24);
    if ('remoteStyles' in patch)
        patch.remoteStyles = normalizeUrlList(patch.remoteStyles);
    if ('remoteScripts' in patch)
        patch.remoteScripts = normalizeUrlList(patch.remoteScripts);
    return patch;
}
function slugifyPublicSlug(value) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return slug.length >= 3 ? slug : `project-${slug || 'published'}`;
}
async function uniquePublicSlug(db, desiredSlug, existingPublicProjectId) {
    const existing = await db
        .selectFrom('public_projects')
        .select(['id'])
        .where('slug', '=', desiredSlug)
        .executeTakeFirst();
    if (!existing || existing.id === existingPublicProjectId) {
        return desiredSlug;
    }
    throw new AppError(409, 'slug_unavailable', 'Slug is already in use');
}
function normalizeTags(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
}
function normalizeUrlList(value) {
    if (!Array.isArray(value))
        return [];
    const urls = [];
    for (const item of value) {
        if (typeof item !== 'string')
            continue;
        const trimmed = item.trim();
        if (!trimmed)
            continue;
        try {
            const url = new URL(trimmed);
            if (!['http:', 'https:'].includes(url.protocol))
                continue;
            urls.push(url.toString());
        }
        catch {
            continue;
        }
    }
    return [...new Set(urls)].slice(0, 24);
}
async function ensureBillingSchema(db) {
    await sql.raw(`
    create table if not exists subscriptions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      stripe_customer_id text not null,
      stripe_subscription_id text,
      stripe_price_id text,
      plan text not null default 'free',
      status text not null default 'free',
      current_period_end datetime,
      trial_end datetime,
      cancel_at_period_end integer not null default 0,
      metadata text not null default '{}',
      created_at datetime not null default current_timestamp,
      updated_at datetime not null default current_timestamp
    )
  `).execute(db);
    await sql.raw('create unique index if not exists subscriptions_user_id_idx on subscriptions(user_id)').execute(db);
    await sql.raw('create unique index if not exists subscriptions_customer_id_idx on subscriptions(stripe_customer_id)').execute(db);
    await sql.raw('create unique index if not exists subscriptions_subscription_id_idx on subscriptions(stripe_subscription_id) where stripe_subscription_id is not null').execute(db);
}
async function billingStatusForUser(db, userId) {
    const subscription = await db
        .selectFrom('subscriptions')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst();
    if (!subscription) {
        return {
            plan: 'free',
            status: 'free',
            stripeCustomerId: null,
            currentPeriodEndsAt: null,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            updatedAt: null
        };
    }
    return {
        plan: subscription.plan,
        status: subscription.status,
        stripeCustomerId: subscription.stripe_customer_id,
        currentPeriodEndsAt: subscription.current_period_end ? timestamp(subscription.current_period_end) : null,
        trialEndsAt: subscription.trial_end ? timestamp(subscription.trial_end) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        updatedAt: timestamp(subscription.updated_at)
    };
}
async function getOrCreateStripeCustomer(db, stripe, user) {
    const existing = await db
        .selectFrom('subscriptions')
        .select(['stripe_customer_id'])
        .where('user_id', '=', user.id)
        .executeTakeFirst();
    if (existing?.stripe_customer_id)
        return existing.stripe_customer_id;
    const customer = await stripe.customers.create({
        email: user.email,
        ...(user.full_name ? { name: user.full_name } : {}),
        metadata: { userId: user.id }
    });
    const now = new Date().toISOString();
    await db
        .insertInto('subscriptions')
        .values({
        id: randomUUID(),
        user_id: user.id,
        stripe_customer_id: customer.id,
        stripe_subscription_id: null,
        stripe_price_id: null,
        plan: 'free',
        status: 'free',
        current_period_end: null,
        trial_end: null,
        cancel_at_period_end: 0,
        metadata: JSON.stringify({}),
        created_at: now,
        updated_at: now
    })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({
        stripe_customer_id: customer.id,
        updated_at: now
    }))
        .execute();
    return customer.id;
}
async function handleStripeEvent(db, stripe, event) {
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const subscriptionId = stripeId(session.subscription);
        if (subscriptionId) {
            await syncStripeSubscription(db, await stripe.subscriptions.retrieve(subscriptionId));
        }
        return;
    }
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        await syncStripeSubscription(db, event.data.object);
        return;
    }
    if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
        const subscriptionId = subscriptionIdFromInvoice(event.data.object);
        if (subscriptionId) {
            await syncStripeSubscription(db, await stripe.subscriptions.retrieve(subscriptionId));
        }
    }
}
async function syncStripeSubscription(db, subscription) {
    const customerId = stripeId(subscription.customer);
    if (!customerId)
        return;
    const existing = await db
        .selectFrom('subscriptions')
        .select(['user_id'])
        .where('stripe_customer_id', '=', customerId)
        .executeTakeFirst();
    const userId = subscription.metadata?.userId || existing?.user_id;
    if (!userId)
        return;
    const price = subscription.items.data[0]?.price;
    const plan = getBillingPlan(subscription.metadata?.planId ?? '') ?? getBillingPlanByLookupKey(price?.lookup_key);
    const now = new Date().toISOString();
    await db
        .insertInto('subscriptions')
        .values({
        id: randomUUID(),
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: price?.id ?? null,
        plan: plan?.id ?? 'free',
        status: subscription.status,
        current_period_end: unixToIso(subscription.current_period_end),
        trial_end: unixToIso(subscription.trial_end),
        cancel_at_period_end: subscription.cancel_at_period_end ? 1 : 0,
        metadata: JSON.stringify({
            stripeSubscriptionId: subscription.id,
            stripePriceLookupKey: price?.lookup_key ?? null
        }),
        created_at: now,
        updated_at: now
    })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: price?.id ?? null,
        plan: plan?.id ?? 'free',
        status: subscription.status,
        current_period_end: unixToIso(subscription.current_period_end),
        trial_end: unixToIso(subscription.trial_end),
        cancel_at_period_end: subscription.cancel_at_period_end ? 1 : 0,
        metadata: JSON.stringify({
            stripeSubscriptionId: subscription.id,
            stripePriceLookupKey: price?.lookup_key ?? null
        }),
        updated_at: now
    }))
        .execute();
}
function stripeId(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value.id === 'string')
        return value.id;
    return null;
}
function subscriptionIdFromInvoice(invoice) {
    const candidate = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
    return stripeId(candidate);
}
function unixToIso(value) {
    return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}
async function readGeneratedStyles(output) {
    const files = output.metadata.generatedFiles;
    if (!Array.isArray(files))
        return [];
    const cssKeys = files
        .filter((file) => Boolean(file && typeof file === 'object'))
        .filter((file) => String(file.contentType ?? '').includes('css') || /\.css$/i.test(String(file.name ?? file.url ?? file.key)))
        .map((file) => (typeof file.key === 'string' ? file.key : null))
        .filter((key) => Boolean(key));
    const styles = [];
    for (const key of cssKeys) {
        const normalizedKey = normalize(key);
        if (!normalizedKey.startsWith('projects/') || normalizedKey.includes('..'))
            continue;
        try {
            styles.push(await readFile(join(process.cwd(), 'storage', normalizedKey), 'utf8'));
        }
        catch {
            // Keep previews usable if an old output references a missing stylesheet.
        }
    }
    return styles;
}
//# sourceMappingURL=app.js.map