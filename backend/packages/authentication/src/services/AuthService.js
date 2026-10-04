import bcrypt from 'bcrypt';
import { JwtService, defaultJwtService } from './JwtService.js';

export class AuthService {
    /**
     * @param {Object} [deps]
     * @param {JwtService} [deps.jwtService]
     * @param {number} [deps.saltRounds]
     */
    constructor(deps = {}) {
        this.jwtService = deps.jwtService || defaultJwtService;
        this.saltRounds = deps.saltRounds || 10;
    }

    async hashPassword(pass) {
        try {
            return await bcrypt.hash(pass, this.saltRounds);
        } catch (error) {
            console.error('Hashing error:', error);
            throw error;
        }
    }

    async verifyPassword(pass, hashedPassword) {
        try {
            return await bcrypt.compare(pass, hashedPassword);
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    }

    async generateTokens(userId, role) {
        const accessToken = await this.jwtService.issueToken(userId, role);
        const refreshToken = await this.jwtService.issueRefreshToken(userId);
        return { accessToken, refreshToken };
    }
}

export const defaultAuthService = new AuthService();
