import pool from '../../../config/database.js';
import { accountCacheKey, redis, refreshAccountListsCache, writeAccountListCache } from '../../../cache/accountCache.js';

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
        const query = `SELECT account_number, account_name, balance, currency
         FROM accounts 
         WHERE user_id = $1 
         ORDER BY created_at DESC`;
        const result = await pool.query(query, [userId]);
        return result.rows;
    },

    async getAccountsByUserIdCache(userId) {
        const cacheKey = accountCacheKey(userId);

        let cachedResult;
        try {
            cachedResult = await redis.get(cacheKey);
        } catch (error) {
            console.error(`Account cache read failed for ${cacheKey}:`, error.message);
        }

        if (cachedResult) {
            console.log(`[CACHE] Hit for ${cacheKey}`);
            return JSON.parse(cachedResult)
        }

        console.log(`[CACHE] Miss for ${cacheKey}`);
        
        const result = await AccountService.getAccountsByUserId(userId)
        if (!result) return null

        await writeAccountListCache(userId, result);
        return result
    }
};
