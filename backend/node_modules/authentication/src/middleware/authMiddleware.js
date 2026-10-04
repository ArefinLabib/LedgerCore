import { defaultJwtService } from '../services/JwtService.js';

export function createAuthMiddleware(jwtService = defaultJwtService) {
    return async function authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        let userContext = await jwtService.verifyToken(authHeader);

        if (!userContext && req.cookies) {
            const rawCookieToken = req.cookies.accessToken || req.cookies.token;
            if (rawCookieToken) {
                userContext = jwtService.verifyRawToken(rawCookieToken);
            }
        }

        if (!userContext) {
            return res.status(401).json({ success: false, message: "Unauthorized: Invalid or missing token" });
        }

        req.user = userContext;
        next();
    };
}
