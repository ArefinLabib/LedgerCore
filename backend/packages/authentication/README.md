# Modular Authentication & JWT Rotation Engine

A framework-agnostic, database-decoupled Authentication Engine and Express API Server built in Node.js (ESM). Designed with Dependency Injection, the Repository Pattern, JWT Access/Refresh Token Rotation, Role-Based Access Control (RBAC), express-rate-limit protection, and an automatic Security Breach Trap.

---

## Key Architectural Features

- Live Express API Entry Point: Complete production-ready HTTP server (`index.js`) featuring rate limiting (`express-rate-limit`), httpOnly cookie management, and structured REST API routes.
- Repository Pattern (Database Agnostic): Decouples storage logic from authentication services. Ships with zero-config InMemory repositories for dev/testing, but allows plugging in PostgreSQL, MongoDB, Prisma, or SQL without touching core business logic.
- JWT Refresh Token Rotation: Implements short-lived Access Tokens (15m) alongside rotating Refresh Tokens (7d).
- Role-Based Access Control (RBAC): Middleware generator (`requireRole`) for fine-grained, per-route authorization (user, admin).
- Breach Trap System: If a malicious actor attempts to replay an already-used Refresh Token, the engine detects the breach and force-revokes all active sessions for that user.
- httpOnly Cookie Security: Refresh Tokens are managed automatically via httpOnly, SameSite cookies to protect against XSS attacks.

---

## Repository Structure

```text
Authentication/
├── index.js                     # Live Express API Server entry point
└── src/
    ├── index.js                 # Barrel exports for external projects
    ├── middleware/
    │   ├── authMiddleware.js    # HTTP bearer/cookie auth middleware
    │   └── authorizeRole.js     # RBAC role authorization middleware
    ├── repositories/
    │   ├── BaseRepository.js   # DB contract interfaces (UserRepository, RefreshTokenRepository)
    │   ├── InMemoryUserRepository.js
    │   └── InMemoryRefreshTokenRepository.js
    └── services/
        ├── AuthService.js       # Core authentication & breach trap engine
        └── JwtService.js        # Configurable JWT signing & verification
```

---

## API Endpoints Summary

| Method | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Rate Limited (10/15m) | Registers new user and sets httpOnly refresh cookie |
| `POST` | `/api/auth/login` | Rate Limited (10/15m) | Authenticates user and sets httpOnly refresh cookie |
| `POST` | `/api/auth/refresh` | Public | Rotates refresh token and issues new access token |
| `POST` | `/api/auth/logout` | Public | Clears httpOnly refresh token cookie |
| `GET` | `/api/user/profile` | Authenticated | Protected route for logged-in users |
| `GET` | `/api/admin/dashboard` | RBAC (`admin`) | Restricted route for admin users only |

---

## Quick Start

### 1. Installation

```bash
git clone https://github.com/ArefinLabib/modular-auth-engine.git
cd Authentication
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
JWT_SECRET=your_super_secret_production_key_here
PORT=3000
```

### 3. Start the Express API Server

```bash
node index.js
```

The server will start at `http://localhost:3000`.
