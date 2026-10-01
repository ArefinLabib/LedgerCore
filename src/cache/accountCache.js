import Redis from 'ioredis';
import pool from '../config/database.js';

const CACHE_TTL_SECONDS = 3600;

export const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379)
});

redis.on('error', (error) => {
    console.error('Redis account-cache error:', error.message);
});

export const accountCacheKey = (userId) => `profile:${userId}`;

export async function writeAccountListCache(userId, accounts) {
    const cacheKey = accountCacheKey(userId);

    try {
        await redis.set(cacheKey, JSON.stringify(accounts), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
        console.error(`Account cache write failed for ${cacheKey}:`, error.message);

        try {
            await redis.del(cacheKey);
        } catch (deleteError) {
            console.error(`Account cache cleanup failed for ${cacheKey}:`, deleteError.message);
        }
    }
}

export async function refreshAccountListsCache(userIds) {
    for (const userId of new Set(userIds.filter(Boolean))) {
        let accounts;
        try {
            const result = await pool.query(
                `SELECT account_number, account_name, balance, currency
                 FROM accounts
                 WHERE user_id = $1
                 ORDER BY created_at DESC`,
                [userId]
            );
            accounts = result.rows;
        } catch (error) {
            console.error(`Failed to refresh account cache for user ${userId}:`, error.message);
            continue;
        }

        await writeAccountListCache(userId, accounts);
    }
}
