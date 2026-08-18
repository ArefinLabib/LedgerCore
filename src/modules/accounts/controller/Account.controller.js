import { AccountService } from '../services/Account.service.js';

export const AccountController = {
    async createAccount(req, res) {
        const { account_name, currency = 'USD' } = req.body;
        const userId = req.user.userId;

        if (!account_name) {
            return res.status(400).json({ success: false, message: 'account_name is required' });
        }

        try {
            const account = await AccountService.createAccount(account_name, currency, userId);

            return res.status(201).json({
                success: true,
                message: 'Account created successfully',
                account
            });
        } catch (error) {
            console.error('Create account error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    async getMyAccounts(req, res) {
        try {
            const userId = req.user.userId;
            const accounts = await AccountService.getAccountsByUserId(userId);
            
            return res.json({
                success: true,
                accounts
            });
        } catch (error) {
            console.error('Get accounts error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
};
