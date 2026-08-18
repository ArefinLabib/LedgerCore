import { AuthService } from '../services/Auth.service.js';

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export const AuthController = {
    async register(req, res) {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        try {
            const existingUser = await AuthService.findUserByUsername(username);
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }

            const { accessToken, refreshToken } = await AuthService.registerUser(username, password);

            res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

            return res.status(201).json({
                success: true,
                message: 'Signed up successfully',
                accessToken
            });

        } catch (error) {
            console.error('Registration error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    async login(req, res) {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        try {
            const user = await AuthService.findUserByUsername(username);
            if (!user) {
                return res.status(401).json({ success: false, message: 'Wrong credentials' });
            }

            const isMatch = await AuthService.verifyCredentials(user, password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Wrong credentials' });
            }

            const { accessToken, refreshToken } = await AuthService.createSession(user);

            res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

            return res.json({
                success: true,
                message: 'Logged in successfully',
                accessToken
            });

        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    async getUsers(req, res) {
        try {
            const users = await AuthService.getAllUsers();
            return res.json({
                success: true,
                users
            });
        } catch (error) {
            console.error('Get users error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    async getUserProfile(req, res) {
        const targetUserId = req.params.id;

        // Authorization: User can only view their own profile, unless they are an admin
        if (req.user.userId !== targetUserId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own profile' });
        }

        try {
            const profile = await AuthService.getUserProfile(targetUserId);
            if (!profile) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            return res.json({
                success: true,
                profile
            });
        } catch (error) {
            console.error('Get profile error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
};
