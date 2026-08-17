import pool from '../../config/database.js';
import { defaultAuthService } from 'authentication';

export const AuthService = {
    async findUserByUsername(username) {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0] || null;
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
