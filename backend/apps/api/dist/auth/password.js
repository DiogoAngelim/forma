import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
export function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
    return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash)
        return false;
    const candidate = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
    const expected = Buffer.from(hash, 'hex');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
//# sourceMappingURL=password.js.map