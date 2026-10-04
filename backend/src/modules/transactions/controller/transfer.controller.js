import pool from '../../../config/database.js';
import { transferOrchestratorService } from "../services/transferOrchestrator.service.js";

export const transferController = {
    async transfer(req, res) {
        try {
            const userId = req.user.userId;
            let {fromAccountId, toAccountId, amount} = req.body;

            // Dynamic routing for benchmarks
            if (req.query.scenario === 'happy-path' && global.benchmarkAccounts) {
                const accs = global.benchmarkAccounts;
                const idx = global.benchmarkIndex % (accs.length - 2);
                global.benchmarkIndex = (global.benchmarkIndex + 2) % (accs.length - 2);
                fromAccountId = accs[idx];
                toAccountId = accs[idx + 1];
            } else if (req.query.scenario === 'deadlock' && global.benchmarkAccounts) {
                const accs = global.benchmarkAccounts;
                fromAccountId = accs[Math.floor(Math.random() * accs.length)];
                toAccountId = accs[Math.floor(Math.random() * accs.length)];
                while(fromAccountId === toAccountId) {
                    toAccountId = accs[Math.floor(Math.random() * accs.length)];
                }
            }

            if (!fromAccountId || !toAccountId || !amount) {
                return res.status(400).json({ success: false, message: "Invalid Request" });
            }
            if (amount <= 0) {
                return res.status(400).json({ success: false, message: "Invalid amount" });
            }
            
            const accounts = await pool.query("SELECT account_id, user_id FROM accounts WHERE account_id = $1 or account_id = $2", [fromAccountId, toAccountId]);

            if (accounts.rows.length < 2) {
                return res.status(404).json({ success: false, message: "Invalid Accounts" });
            }

            const fromAccount = accounts.rows.find(acc => acc.account_id === fromAccountId);

            if (!fromAccount || fromAccount.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Forbidden: You can only transfer from your own accounts' });
            }
            
            const strategyKey = (req.query.strategy || req.headers['x-strategy'] || process.env.CONCURRENCY_STRATEGY || 'serializable').toLowerCase();
            const isBenchmark = req.query.scenario !== undefined;
            
            const result = await transferOrchestratorService.executeTransfer(
                strategyKey,
                fromAccountId,
                toAccountId,
                amount,
                isBenchmark ? [] : accounts.rows.map(account => account.user_id)
            );

            return res.json({
                success: true,
                message: "Transfer Successful",
                data: result
            })
        } catch (error) {
            const isConflict = error.message?.includes("Concurrency Conflict") || error.code === '40001';
            return res.status(isConflict ? 409 : 500).json({
                success: false,
                message: error.message
            })
        }
    }
}