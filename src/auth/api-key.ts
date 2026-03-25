// TODO: API key authentication and management
// - Generate API keys
// - Hash API keys with bcrypt
// - Verify API keys
// - Manage API key lifecycle (creation, rotation, revocation)

import crypto from 'crypto';

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  role: 'read' | 'write' | 'admin';
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
}

export function generateApiKey(): string {
  // Generate a secure random API key
  return crypto.randomBytes(32).toString('base64url');
}

export async function hashApiKey(apiKey: string): Promise<string> {
  // TODO: Use bcrypt with appropriate cost factor
  // const bcrypt = require('bcrypt');
  // return bcrypt.hash(apiKey, 12);
  throw new Error('Not implemented');
}

export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  // TODO: Use bcrypt.compare
  throw new Error('Not implemented');
}
