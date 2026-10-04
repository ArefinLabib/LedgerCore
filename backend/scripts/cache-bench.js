import fs from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import { defaultAuthService } from 'authentication';
import pool from '../src/config/database.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ENDPOINT = `${BASE_URL}/api/accounts`;
const HOT_REQUESTS = Number(process.env.HOT_REQUESTS || 20);
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/cache-bench-results.json');
const CACHE_KEY = 'profile:';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
});

redis.on('error', (error) => {
  console.error(`Redis connection error: ${error.message}`);
});

async function getUserId() {
  const result = await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 1');

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  return '00000000-0000-0000-0000-000000000001';
}

async function getAccessToken(userId) {
  const { accessToken } = await defaultAuthService.generateTokens(userId, 'user');
  return accessToken;
}

async function fetchAccountList(token) {
  const startedAt = process.hrtime.bigint();
  const res = await fetch(ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const body = await res.text();
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  return {
    status: res.status,
    elapsedMs,
    ok: res.ok,
    bodyLength: body.length,
    bodyPreview: body.slice(0, 120)
  };
}

async function measureHotPhase(token, requestCount) {
  const samples = [];

  for (let i = 1; i <= requestCount; i += 1) {
    const sample = await fetchAccountList(token);
    samples.push(sample);
    console.log(`[hot] request ${i}/${requestCount} -> ${sample.elapsedMs.toFixed(2)} ms | status ${sample.status}`);
  }

  const total = samples.reduce((sum, sample) => sum + sample.elapsedMs, 0);
  const average = total / samples.length;
  const min = Math.min(...samples.map((sample) => sample.elapsedMs));
  const max = Math.max(...samples.map((sample) => sample.elapsedMs));

  const summary = {
    label: 'hot',
    requestCount,
    averageMs: Number(average.toFixed(3)),
    minMs: Number(min.toFixed(3)),
    maxMs: Number(max.toFixed(3)),
    samples
  };

  console.log(`\n[hot] summary: avg=${average.toFixed(2)} ms | min=${min.toFixed(2)} ms | max=${max.toFixed(2)} ms`);
  return summary;
}

async function main() {
  console.log('Starting cache latency benchmark...');
  console.log(`Base URL: ${BASE_URL}`);

  const userId = await getUserId();
  const token = await getAccessToken(userId);

  console.log(`Using userId: ${userId}`);

  await redis.del(`${CACHE_KEY}${userId}`);
  console.log(`\n[cold] cache cleared for ${userId}`);

  const coldSample = await fetchAccountList(token);
  console.log(`[cold] single miss -> ${coldSample.elapsedMs.toFixed(2)} ms | status ${coldSample.status}`);

  const hotSummary = await measureHotPhase(token, HOT_REQUESTS);

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    endpoint: ENDPOINT,
    userId,
    coldRequests: 1,
    hotRequests: HOT_REQUESTS,
    cold: {
      label: 'cold',
      requestCount: 1,
      averageMs: Number(coldSample.elapsedMs.toFixed(3)),
      minMs: Number(coldSample.elapsedMs.toFixed(3)),
      maxMs: Number(coldSample.elapsedMs.toFixed(3)),
      samples: [coldSample]
    },
    hot: hotSummary
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  const improvement = ((coldSample.elapsedMs - hotSummary.averageMs) / coldSample.elapsedMs) * 100;
  console.log(`\nSaved benchmark output to: ${OUTPUT_PATH}`);
  console.log(`Estimated warm-cache improvement: ${Number.isFinite(improvement) ? improvement.toFixed(2) : 'n/a'}%`);

  await redis.quit();
  await pool.end();
}

main().catch(async (error) => {
  console.error('Benchmark failed:', error);
  redis.disconnect();
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
