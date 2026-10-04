import pool from '../../../config/database.js';
import { defaultAuthService } from 'authentication';

export const AuthService = {
    async findUserByUsername(username) {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0] || null;
    },

    async getAllUsers() {
        const query = 'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC';
        const result = await pool.query(query);
        return result.rows;
    },

    async getUserProfile(userId) {
        // 1. Get user details
        const userQuery = 'SELECT id, username, role, created_at FROM users WHERE id = $1';
        const userResult = await pool.query(userQuery, [userId]);

        if (userResult.rows.length === 0) return null;
        const user = userResult.rows[0];

        // 2. Get user's accounts
        const accountsQuery = 'SELECT account_id, account_name, currency, balance, created_at FROM accounts WHERE user_id = $1 ORDER BY created_at DESC';
        const accountsResult = await pool.query(accountsQuery, [userId]);

        return {
            ...user,
            accounts: accountsResult.rows
        };
    },

    async registerUser(username, password) {
        // Hash password
        const hashedPassword = await defaultAuthService.hashPassword(password);

        // Atomic DB writes
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const insertUserQuery = `
                INSERT INTO users (username, password_hash, role) 
                VALUES ($1, $2, $3) RETURNING *
            `;
            const userResult = await client.query(insertUserQuery, [username, hashedPassword, 'user']);
            const newUser = userResult.rows[0];

            // Generate tokens
            const { accessToken, refreshToken } = await defaultAuthService.generateTokens(newUser.id, newUser.role);

            const insertTokenQuery = `
                INSERT INTO refresh_tokens (user_id, token) 
                VALUES ($1, $2)
            `;
            await client.query(insertTokenQuery, [newUser.id, refreshToken]);

            await client.query('COMMIT');

            return { user: newUser, accessToken, refreshToken };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    async verifyCredentials(user, password) {
        return await defaultAuthService.verifyPassword(password, user.password_hash);
    },

    async createSession(user) {
        const { accessToken, refreshToken } = await defaultAuthService.generateTokens(user.id, user.role);

        const insertTokenQuery = `
            INSERT INTO refresh_tokens (user_id, token) 
            VALUES ($1, $2)
        `;
        await pool.query(insertTokenQuery, [user.id, refreshToken]);

        return { accessToken, refreshToken };
    }
};
