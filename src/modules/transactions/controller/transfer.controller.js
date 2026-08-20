import pool from '../../../config/database.js';
import { transferService } from "../services/transfer.service.js";

export const transferController = {
    async transfer(req, res) {
        try {
            const userId = req.user.userId;
            const {fromAccountId, toAccountId, amount} = req.body;

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
            
            const result = await transferService.executeTransfer(fromAccountId, toAccountId, amount)

            return res.json({
                success: true,
                message: "Transfer Successful",
                data: result
            })
        } catch (error) {
            console.error("Transfer Error:", error);
            return res.status(500).json({
                success: false,
                message: error.message
            })
        }
    }
}