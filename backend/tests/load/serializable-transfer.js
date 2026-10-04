import autocannon from "autocannon";
import { defaultAuthService } from "authentication";
import pool from "../../src/config/database.js";

const ALICE_USER_ID = "fd328661-f47d-4fa5-a71d-abf3daa02c1b";
const FROM_ACCOUNT_ID = "9a1a6eef-7413-4ccc-af18-f6c9c3926110";
const TO_ACCOUNT_ID = "182a6ae2-23ae-4441-bc8e-35f3c92e5c48";

// Generate token for Alice
let token = process.env.TEST_TOKEN;
if (!token) {
    const tokens = await defaultAuthService.generateTokens(ALICE_USER_ID, "user");
    token = tokens.accessToken;
}

// Pre-test balance and transaction counts
const preRes = await pool.query(
    "SELECT account_name, balance FROM accounts WHERE account_id = $1 OR account_id = $2 ORDER BY account_name",
    [FROM_ACCOUNT_ID, TO_ACCOUNT_ID]
);
const preTx = await pool.query("SELECT COUNT(*) as count FROM transactions");
const initialTxCount = parseInt(preTx.rows[0].count, 10);

console.log("\n=== PRE-TEST ACCOUNT STATUS ===");
let initialSum = 0;
for (const acc of preRes.rows) {
    console.log(`  ${acc.account_name}: $${acc.balance}`);
    initialSum += parseFloat(acc.balance);
}
console.log(`  Total Sum: $${initialSum.toFixed(2)}`);
console.log(`  Initial Transactions Count: ${initialTxCount}`);

const statusCounts = {};

console.log("\nStarting Autocannon Load Test (50 connections, 10s, Serializable Isolation)...");

const instance = autocannon({
    url: "http://localhost:3000/api/transactions/transfer",
    connections: 50,
    duration: 10,
    method: "POST",
    headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
        fromAccountId: FROM_ACCOUNT_ID,
        toAccountId: TO_ACCOUNT_ID,
        amount: 1
    }),
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

    // Post-test balances
    const postRes = await pool.query(
        "SELECT account_name, balance FROM accounts WHERE account_id = $1 OR account_id = $2 ORDER BY account_name",
        [FROM_ACCOUNT_ID, TO_ACCOUNT_ID]
    );
    const postTx = await pool.query("SELECT COUNT(*) as count FROM transactions");
    const finalTxCount = parseInt(postTx.rows[0].count, 10);
    const newTxCount = finalTxCount - initialTxCount;

    console.log("\n=== POST-TEST ACCOUNT STATUS ===");
    let postSum = 0;
    for (const acc of postRes.rows) {
        console.log(`  ${acc.account_name}: $${acc.balance}`);
        postSum += parseFloat(acc.balance);
    }
    console.log(`  Total Sum: $${postSum.toFixed(2)}`);
    console.log(`  Invariant Held: ${initialSum.toFixed(2) === postSum.toFixed(2) ? "PASS" : "FAIL"}`);
    console.log(`  New Transactions Created in DB: ${newTxCount}`);
    console.log(`  HTTP 200 vs DB Transaction Count Match: ${statusCounts[200] === newTxCount ? "PASS" : "MISMATCH"}`);

    await pool.end();
    process.exit(0);
});
