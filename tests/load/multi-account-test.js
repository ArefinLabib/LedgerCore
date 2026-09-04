import autocannon from "autocannon";
import { defaultAuthService } from "authentication";
import pool from "../../src/config/database.js";
import { seedAccounts } from "./seed-multi-accounts.js";

const ALICE_USER_ID = "fd328661-f47d-4fa5-a71d-abf3daa02c1b";

// 1. Re-seed accounts so we start from a clean state
const pairs = await seedAccounts();

// 2. Generate token for Alice
const tokens = await defaultAuthService.generateTokens(ALICE_USER_ID, "user");
const token = tokens.accessToken;

// 3. Check pre-test balances
const preRes = await pool.query(
    "SELECT SUM(balance)::numeric as total_balance, COUNT(*) as total_accounts FROM accounts WHERE account_name LIKE 'Alice_LoadTest_%' OR account_name LIKE 'Bob_LoadTest_%'"
);
const initialTotal = parseFloat(preRes.rows[0].total_balance);
console.log(`\n=== PRE-TEST STATUS ===`);
console.log(`  Total Accounts: ${preRes.rows[0].total_accounts}`);
console.log(`  Combined Balance: $${initialTotal.toFixed(2)}`);

// 4. Build round-robin requests array for autocannon
const requests = pairs.map(p => ({
    method: "POST",
    path: "/api/transactions/transfer",
    headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
        fromAccountId: p.fromAccountId,
        toAccountId: p.toAccountId,
        amount: 1
    })
}));

const statusCounts = {};

console.log(`\nStarting Multi-Account Load Test (50 connections, 10 seconds, 25 distributed account pairs)...`);

const instance = autocannon({
    url: "http://localhost:3000",
    connections: 50,
    duration: 10,
    pipelining: 1,
    requests: requests,
    setupClient(client) {
        client.on("response", (statusCode) => {
            statusCounts[statusCode] = (statusCounts[statusCode] || 0) + 1;
        });
    }
});

instance.on("done", async (result) => {
    console.log("\n" + autocannon.printResult(result));

    console.log("\n=== STATUS CODE BREAKDOWN ===");
    for (const [code, count] of Object.entries(statusCounts).sort()) {
        console.log(`  HTTP ${code}: ${count} responses`);
    }

    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const success = statusCounts[200] || 0;
    const failed = total - success;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(2) : 0;
    console.log(`\n  Total Requests: ${total}`);
    console.log(`  Successful (200): ${success} (${successRate}%)`);
    console.log(`  Failed: ${failed}`);

    // 5. Check post-test balances
    const postRes = await pool.query(
        "SELECT SUM(balance)::numeric as total_balance, COUNT(*) as total_accounts FROM accounts WHERE account_name LIKE 'Alice_LoadTest_%' OR account_name LIKE 'Bob_LoadTest_%'"
    );
    const postTotal = parseFloat(postRes.rows[0].total_balance);
    console.log(`\n=== POST-TEST STATUS ===`);
    console.log(`  Combined Balance: $${postTotal.toFixed(2)}`);
    console.log(`  Invariant Held: ${initialTotal.toFixed(2) === postTotal.toFixed(2) ? "PASS" : "FAIL"}`);

    // Check version distribution
    const versionRes = await pool.query(
        "SELECT MIN(version) as min_version, MAX(version) as max_version, AVG(version)::numeric(10,1) as avg_version FROM accounts WHERE account_name LIKE 'Alice_LoadTest_%'"
    );
    console.log(`  Account Version stats: Min = ${versionRes.rows[0].min_version}, Max = ${versionRes.rows[0].max_version}, Avg = ${versionRes.rows[0].avg_version}`);

    await pool.end();
    process.exit(0);
});
