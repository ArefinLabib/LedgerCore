import pool from '../../../config/database.js';

const TRANSIENT_ERRORS = new Set(['40001', '40P01']);
const MAX_RETRIES = 5;

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function executeTransferOnce(fromAccountId, toAccountId, amount) {
	const client = await pool.connect();
	let transactionStarted = false;

	try {
		await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
		transactionStarted = true;

		const accounts = await client.query(
			`SELECT account_id, balance
			 FROM accounts
			 WHERE account_id IN ($1, $2)
			 ORDER BY account_id`,
			[fromAccountId, toAccountId]
		);

		const fromAccount = accounts.rows.find(account => account.account_id === fromAccountId);
		const toAccount = accounts.rows.find(account => account.account_id === toAccountId);

		if (!fromAccount) {
			throw new Error('Source Account Not Found');
		}
		if (!toAccount) {
			throw new Error('Destination Account Not Found');
		}
		if (fromAccountId === toAccountId) {
			throw new Error('Source and destination accounts must differ');
		}
		if (Number(fromAccount.balance) < Number(amount)) {
			throw new Error('Insufficient Balance');
		}

		const debit = await client.query(
			`UPDATE accounts
			 SET balance = balance - $1
			 WHERE account_id = $2
			 RETURNING *`,
			[amount, fromAccountId]
		);
		const credit = await client.query(
			`UPDATE accounts
			 SET balance = balance + $1
			 WHERE account_id = $2
			 RETURNING *`,
			[amount, toAccountId]
		);

		const transaction = await client.query(
			`INSERT INTO transactions (transaction_type, status)
			 VALUES ($1, $2)
			 RETURNING *`,
			['transfer', 'completed']
		);

		await client.query(
			`INSERT INTO ledger_entries (transaction_id, account_id, amount, type, status)
			 VALUES ($1, $2, $3, $4, $5), ($1, $6, $3, $7, $5)`,
			[transaction.rows[0].transaction_id, fromAccountId, amount, 'debit', 'success', toAccountId, 'credit']
		);

		await client.query('COMMIT');
		transactionStarted = false;

		return {
			debit: debit.rows[0],
			credit: credit.rows[0],
			transaction: transaction.rows[0]
		};
	} catch (error) {
		if (transactionStarted) {
			await client.query('ROLLBACK').catch(() => {});
		}
		throw error;
	} finally {
		client.release();
	}
}

export const transferServiceSerializable = {
	async executeTransfer(fromAccountId, toAccountId, amount) {
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
			try {
				return await executeTransferOnce(fromAccountId, toAccountId, amount);
			} catch (error) {
				if (!TRANSIENT_ERRORS.has(error.code) || attempt === MAX_RETRIES) {
					throw error;
				}

				await wait(25 * 2 ** (attempt - 1));
			}
		}
	}
};
