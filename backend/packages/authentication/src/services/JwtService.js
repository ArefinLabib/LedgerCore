import 'dotenv/config';
import jwt from 'jsonwebtoken';

export class JwtService {
    /**
     * @param {Object} [config]
     * @param {string} [config.secret]
     * @param {string} [config.accessTokenExpiresIn]
     * @param {string} [config.refreshTokenExpiresIn]
     * @param {string} [config.algorithm]
     */
    constructor(config = {}) {
        this.secret = config.secret || process.env.JWT_SECRET || 'default_fallback_secret_key_change_me';
        this.accessTokenExpiresIn = config.accessTokenExpiresIn || '15m';
        this.refreshTokenExpiresIn = config.refreshTokenExpiresIn || '7d';
        this.algorithm = config.algorithm || 'HS256';
    }

    async issueToken(userId, role) {
        return jwt.sign({ userId, role }, this.secret, {
            expiresIn: this.accessTokenExpiresIn,
            algorithm: this.algorithm
        });
    }

    async issueRefreshToken(userId) {
        return jwt.sign({ userId }, this.secret, {
            expiresIn: this.refreshTokenExpiresIn,
            algorithm: this.algorithm
        });
    }

    verifyRawToken(tokenString) {
        try {
            return jwt.verify(tokenString, this.secret);
        } catch (error) {
            return null;
        }
    }

    async verifyToken(header) {
        if (!header || !header.startsWith("Bearer ")) return null;
        const token = header.split(" ")[1];
        return this.verifyRawToken(token);
    }
}

export const defaultJwtService = new JwtService();
