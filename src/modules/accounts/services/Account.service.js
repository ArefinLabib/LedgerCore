import Redis from 'ioredis'

import pool from '../../../config/database.js';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379)
});

export const AccountService = {
    async createAccount(accountName, currency, userId) {
        const insertAccountQuery = `
            INSERT INTO accounts (account_name, currency, user_id)
            VALUES ($1, $2, $3)
            RETURNING *
        `;

        const result = await pool.query(insertAccountQuery, [accountName, currency, userId]);
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
        const cacheKey = `profile:${userId}`

        const cachedResult = await redis.get(cacheKey)

        if (cachedResult) {
            console.log(`[CACHE] Hit for ${cacheKey}`);
            return JSON.parse(cachedResult)
        }

        console.log(`[CACHE] Miss for ${cacheKey}`);
        
        const result = await AccountService.getAccountsByUserId(userId)
        if (!result) return null

        await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600)
        return result
    }
};
