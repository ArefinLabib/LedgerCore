import crypto from 'node:crypto';
import pool from '../../../config/database.js';
import { accountCacheKey, redis, refreshAccountListsCache, writeAccountListCache } from '../../../cache/accountCache.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const UNLOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
`;

export const AccountService = {
    async createAccount(accountName, currency, userId) {
        const insertAccountQuery = `
            INSERT INTO accounts (account_name, currency, user_id)
            VALUES ($1, $2, $3)
            RETURNING *
        `;

        const result = await pool.query(insertAccountQuery, [accountName, currency, userId]);
        await refreshAccountListsCache([userId]);
        return result.rows[0];
    },

    async getAccountsByUserId(userId) {
        console.log(">>> [POSTGRESQL HIT] Querying database for user:", userId);
        const query = `SELECT account_number, account_name, balance, currency
         FROM accounts 
         WHERE user_id = $1 
         ORDER BY created_at DESC`;
        const result = await pool.query(query, [userId]);
        return result.rows;
    },

    async getAccountsByUserIdCache(userId, maxRetries = 5, retryDelayMs = 50) {
        const cacheKey = accountCacheKey(userId);
        const lockKey = `lock:${cacheKey}`;

        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
            let cachedResult;
            try {
                cachedResult = await redis.get(cacheKey);
            } catch (error) {
                console.error(`Account cache read failed for ${cacheKey}:`, error.message);
            }

            if (cachedResult) {
                console.log(`[CACHE] Hit for ${cacheKey}`);
                return JSON.parse(cachedResult);
            }

            console.log(`[CACHE] Miss for ${cacheKey} (attempt ${attempt})`);

            let acquired = false;
            const lockToken = crypto.randomUUID();

            try {
                // SET key token NX EX ttl: only set if Not eXists, auto-expire in 5s
                const lockResult = await redis.set(lockKey, lockToken, 'NX', 'EX', 5);
                acquired = lockResult === 'OK';
            } catch (error) {
                console.error(`Lock acquisition failed for ${lockKey}:`, error.message);
            }

            if (acquired) {
                try {
                    const result = await AccountService.getAccountsByUserId(userId);
                    if (!result) return null;

                    await writeAccountListCache(userId, result);
                    return result;
                } finally {
                    try {
                        // Atomic check-and-delete: only delete if the lock still holds our unique token
                        await redis.eval(UNLOCK_SCRIPT, 1, lockKey, lockToken);
                    } catch (error) {
                        console.error(`Lock release failed for ${lockKey}:`, error.message);
                    }
                }
            }

            // Another process holds the lock and is repopulating the cache; wait and retry
            await wait(retryDelayMs);
        }

        // Fallback: If lock was held too long and retries exhausted, query DB directly
        return await AccountService.getAccountsByUserId(userId);
    }
};
