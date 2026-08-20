import pool from '../../../config/database.js';

export const transferService = {
    async debit(client, accountId, amount) {
        const account = await client.query(`SELECT balance FROM accounts 
            WHERE account_id = $1 FOR UPDATE`, [accountId]);
        
        if (account.rows.length === 0) {
            throw new Error("Source Account Not Found");
        }
        if (account.rows[0].balance < amount) {
            throw new Error("Insufficient Balance")
        }

        const result = await client.query(`UPDATE accounts SET balance = balance - $1 
            WHERE account_id = $2 RETURNING *`, [amount, accountId])

        return result.rows[0];
    },

    async credit(client, accountId, amount) {
        const account = await client.query(`SELECT balance FROM accounts 
            WHERE account_id = $1 FOR UPDATE`, [accountId]);
        
        if (account.rows.length === 0) {
            throw new Error("Destination Account Not Found");
        }

        const result = await client.query(`UPDATE accounts SET balance = balance + $1 
            WHERE account_id = $2 RETURNING *`, [amount, accountId])

        return result.rows[0];
    },

    async executeTransfer(fromAccountId, toAccountId, amount) {
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const debit = await this.debit(client, fromAccountId, amount);
            const credit = await this.credit(client, toAccountId, amount);

            const transaction = await client.query(`INSERT INTO transactions (transaction_type, status) 
                VALUES ($1, $2) RETURNING *`, ['transfer', 'completed']);
            
            const from = await client.query(
                `INSERT INTO ledger_entries (transaction_id, account_id, amount, type, status) 
                VALUES ($1, $2, $3, $4, $5)`,
                [transaction.rows[0].transaction_id, fromAccountId, amount, 'debit', 'success']
            );
            
            const to = await client.query(
                `INSERT INTO ledger_entries (transaction_id, account_id, amount, type, status) 
                VALUES ($1, $2, $3, $4, $5)`,
                [transaction.rows[0].transaction_id, toAccountId, amount, 'credit', 'success']
            );

            await client.query("COMMIT");

            return {
                debit,
                credit,
                transaction: transaction.rows[0]
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error; 
        } finally {
            client.release();
        }
    }
}