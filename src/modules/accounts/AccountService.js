import pool from '../../config/database.js';

export const AccountService = {
    async createAccount(accountName, currency, userId) {
        const insertAccountQuery = `
            INSERT INTO accounts (account_name, currency, user_id)
            VALUES ($1, $2, $3)
            RETURNING *
        `;

        const result = await pool.query(insertAccountQuery, [accountName, currency, userId]);
        return result.rows[0];
    }
};
