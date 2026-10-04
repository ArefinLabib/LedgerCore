import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import {
    defaultAuthService,
    createAuthMiddleware,
    requireRole
} from './src/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Too many authentication attempts, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);

const authenticateToken = createAuthMiddleware();

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

// ==========================================
// MOCK DATABASE (For testing standalone module)
// ==========================================
const mockUsers = [];
const mockRefreshTokens = [];

// ==========================================
// ROUTES
// ==========================================

app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username and password are required" });
        }

        // 1. App checks DB
        const existingUser = mockUsers.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already taken" });
        }

        // 2. App uses Auth Module to hash password
        const hashedPassword = await defaultAuthService.hashPassword(password);
        
        // 3. App saves to DB
        const newUser = {
            id: crypto.randomUUID(),
            username,
            hashedPassword,
            role: 'user'
        };
        mockUsers.push(newUser);

        // 4. App uses Auth module to generate tokens
        const { accessToken, refreshToken } = await defaultAuthService.generateTokens(newUser.id, newUser.role);
        
        // 5. App saves refresh token to DB
        mockRefreshTokens.push({ userId: newUser.id, token: refreshToken, isUsed: false });

        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

        return res.status(201).json({
            success: true,
            message: "Signed up successfully",
            accessToken: accessToken
        });
    } catch (error) {
        console.error("Signup Route Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username and password are required" });
        }

        // 1. App checks DB
        const user = mockUsers.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ success: false, message: "Wrong credentials" });
        }

        // 2. App uses Auth module to verify password
        const isMatch = await defaultAuthService.verifyPassword(password, user.hashedPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Wrong credentials" });
        }

        // 3. App uses Auth module to generate tokens
        const { accessToken, refreshToken } = await defaultAuthService.generateTokens(user.id, user.role);
        
        // 4. App saves refresh token to DB
        mockRefreshTokens.push({ userId: user.id, token: refreshToken, isUsed: false });

        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

        return res.json({
            success: true,
            message: "Logged in successfully",
            accessToken: accessToken
        });
    } catch (error) {
        console.error("Login Route Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!incomingRefreshToken) {
            return res.status(401).json({ success: false, message: "Refresh token missing" });
        }

        // 1. Verify token signature with Auth module
        const payload = defaultAuthService.jwtService.verifyRawToken(incomingRefreshToken);
        if (!payload) {
            res.clearCookie('refreshToken');
            return res.status(403).json({ success: false, message: "Invalid or expired refresh token" });
        }

        // 2. App checks DB for token
        const tokenRecord = mockRefreshTokens.find(t => t.token === incomingRefreshToken);
        if (!tokenRecord) {
            res.clearCookie('refreshToken');
            return res.status(403).json({ success: false, message: "Token not found" });
        }

        const user = mockUsers.find(u => u.id === tokenRecord.userId);
        if (!user) {
            res.clearCookie('refreshToken');
            return res.status(403).json({ success: false, message: "User account no longer exists" });
        }

        // 3. Security Breach Trap!
        if (tokenRecord.isUsed) {
            // Revoke all tokens for this user
            for (let i = 0; i < mockRefreshTokens.length; i++) {
                if (mockRefreshTokens[i].userId === user.id) {
                    mockRefreshTokens[i].isUsed = true;
                }
            }
            res.clearCookie('refreshToken');
            return res.status(403).json({ success: false, message: "Security breach detected. All sessions revoked." });
        }

        // 4. App uses Auth module to generate new tokens
        const { accessToken, refreshToken } = await defaultAuthService.generateTokens(user.id, user.role);

        // 5. Update DB
        tokenRecord.isUsed = true;
        mockRefreshTokens.push({ userId: user.id, token: refreshToken, isUsed: false });

        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

        return res.json({
            success: true,
            message: "Tokens refreshed successfully",
            accessToken: accessToken
        });
    } catch (error) {
        console.error("Refresh Route Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('refreshToken');
    return res.json({ success: true, message: "Logged out successfully" });
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
    return res.json({
        success: true,
        message: "Protected user profile retrieved successfully",
        user: req.user
    });
});

app.get('/api/admin/dashboard', authenticateToken, requireRole('admin'), async (req, res) => {
    return res.json({
        success: true,
        message: "Welcome to the Admin Dashboard!",
        user: req.user
    });
});

app.listen(PORT, () => {
    console.log(`Authentication Standalone Test Server running on http://localhost:${PORT}`);
});
