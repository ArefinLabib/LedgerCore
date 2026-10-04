import pool from '../../../config/database.js';

export const transferServiceOptimistic = {
    async debitOptimistic(client, accountId, amount) {
        const fromResult = await client.query(`
            SELECT balance, version FROM accounts
            WHERE account_id = $1`, [accountId])

        if (fromResult.rows.length == 0) throw new Error("Invalid Query");

        const account = fromResult.rows[0];
        const currentBalance = Number(account.balance);
        if (currentBalance < amount) {
            throw new Error("Insufficient Balance");
        }

        const result = await client.query(`
            UPDATE accounts SET balance = balance - $1, version = version + 1
            WHERE account_id = $2 AND version = $3 RETURNING *`, [amount, accountId, account.version])
            
        if (result.rows.length === 0) {
            throw new Error("Concurrency Conflict: Account was updated by another transaction");
        }
        return result.rows[0]
    },

    async creditOptimistic(client, accountId, amount) {
        const toResult = await client.query(`
            SELECT balance, version FROM accounts
            WHERE account_id = $1`, [accountId])

        if (toResult.rows.length == 0) throw new Error("Invalid Query");

        const account = toResult.rows[0];

        const result = await client.query(`
            UPDATE accounts SET balance = balance + $1, version = version + 1
            WHERE account_id = $2 AND version = $3 RETURNING *`, [amount, accountId, account.version])
            
        if (result.rows.length === 0) {
            throw new Error("Concurrency Conflict: Account was updated by another transaction");
        }
        return result.rows[0]
    },

    async executeTransferOptimistic(fromAccountId, toAccountId, amount) {
        const client = await pool.connect();

        try {
            await client.query("BEGIN")

            const debit = await this.debitOptimistic(client, fromAccountId, amount);
            const credit = await this.creditOptimistic(client, toAccountId, amount);

            const transaction = await client.query(`
                INSERT INTO transactions (transaction_type, status) 
                VALUES ($1, $2) RETURNING * 
                `, ['transfer', 'completed']);
            
            const fromLedger = await client.query(`
                INSERT INTO ledger_entries (transaction_id, account_id, amount, type, status) 
                VALUES ($1, $2, $3, $4, $5)
                `, [transaction.rows[0].transaction_id, fromAccountId, amount, 'debit', 'success']);
            
            const toLedger = await client.query(`
                INSERT INTO ledger_entries (transaction_id, account_id, amount, type, status) 
                VALUES ($1, $2, $3, $4, $5)
                `, [transaction.rows[0].transaction_id, toAccountId, amount, 'credit', 'success']);
            
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
    },

    async executeTransferWithRetry(fromAccountId, toAccountId, amount, maxRetries = 3, baseDelayMs = 50) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.executeTransferOptimistic(fromAccountId, toAccountId, amount);
            } catch (error) {
                const isConcurrencyConflict = error.message?.includes("Concurrency Conflict");
                
                if (isConcurrencyConflict && attempt < maxRetries) {
                    // Exponential backoff delay (50ms, 100ms, 200ms...)
                    const delay = baseDelayMs * Math.pow(2, attempt - 1);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                
                throw error;
            }
        }
    }
}