import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb } from '../src/db/client.js';
import { loadEnv } from '../src/config/env.js';
import { createR2Storage } from '../src/storage/r2.js';
import { buildApp } from '../src/http/app.js';
import { randomUUID } from 'node:crypto';
const env = loadEnv();
const db = createDb(env);
const storage = createR2Storage(env);
describe('API Integration Tests', () => {
    let app;
    let server;
    beforeAll(async () => {
        app = await buildApp({ env, db, storage });
        await app.ready();
    });
    afterAll(async () => {
        await app.close();
        await db.destroy();
    });
    it('should return health check', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/health'
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('ok', true);
    });
    it('should register a user', async () => {
        const email = `test${randomUUID()}@example.com`;
        const response = await app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
                email,
                password: 'password123'
            }
        });
        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('token');
        expect(body).toHaveProperty('user');
        expect(body.user.email).toBe(email);
    });
    it('should login a user', async () => {
        const email = `test${randomUUID()}@example.com`;
        // Register first
        await app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
                email,
                password: 'password123'
            }
        });
        // Then login
        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
                email,
                password: 'password123'
            }
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('token');
        expect(body).toHaveProperty('user');
    });
    it('should create and get projects', async () => {
        const email = `test${randomUUID()}@example.com`;
        // Register
        const registerRes = await app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
                email,
                password: 'password123'
            }
        });
        const { token } = JSON.parse(registerRes.body);
        // Create project
        const createRes = await app.inject({
            method: 'POST',
            url: '/projects',
            headers: {
                authorization: `Bearer ${token}`
            },
            payload: {
                name: 'Test Project'
            }
        });
        expect(createRes.statusCode).toBe(201);
        const project = JSON.parse(createRes.body);
        expect(project).toHaveProperty('id');
        expect(project.name).toBe('Test Project');
        // Get projects
        const getRes = await app.inject({
            method: 'GET',
            url: '/projects',
            headers: {
                authorization: `Bearer ${token}`
            }
        });
        expect(getRes.statusCode).toBe(200);
        const projects = JSON.parse(getRes.body);
        expect(projects).toHaveLength(1);
        expect(projects[0].name).toBe('Test Project');
    });
});
//# sourceMappingURL=integration.test.js.map