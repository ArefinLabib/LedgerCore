import pool from '../../config/database.js';
import { AuthService } from '../../modules/auth/services/Auth.service.js';

async function seed() {
    try {
        console.log("🌱 Starting seed...");

        // 1. Create two users
        console.log("👤 Creating users Alice and Bob...");
        const alice = await AuthService.registerUser('alice_test', 'password123');
        const bob = await AuthService.registerUser('bob_test', 'password123');

        // 2. Create accounts for them with some initial balance
        console.log("🏦 Creating bank accounts...");
        const aliceAccount = await pool.query(
            "INSERT INTO accounts (account_name, balance, currency, user_id) VALUES ($1, $2, $3, $4) RETURNING *",
            ['Alice Checking', 1000.00, 'USD', alice.user.id]
        );

        const bobAccount = await pool.query(
            "INSERT INTO accounts (account_name, balance, currency, user_id) VALUES ($1, $2, $3, $4) RETURNING *",
            ['Bob Savings', 50.00, 'USD', bob.user.id]
        );

        console.log("✅ Seed complete! Here is your test data:\n");
        console.log("=========================================");
        console.log(`FROM Account (Alice): ${aliceAccount.rows[0].account_id} (Balance: $1000)`);
        console.log(`TO Account (Bob):     ${bobAccount.rows[0].account_id} (Balance: $50)`);
        console.log("=========================================\n");
        console.log("🔑 ALICE'S ACCESS TOKEN (Put this in your Authorization header as 'Bearer <token>'):");
        console.log(alice.accessToken);
        console.log("\n=========================================\n");
        
    } catch (error) {
        console.error("❌ Seed failed:", error);
    } finally {
        // Close DB pool
        await pool.end();
        process.exit();
    }
}

seed();
