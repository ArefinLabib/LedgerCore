import autocannon from "autocannon";
import { defaultAuthService } from "authentication";
import pool from "../../src/config/database.js";

const ALICE_USER_ID = "fd328661-f47d-4fa5-a71d-abf3daa02c1b";
const FROM_ACCOUNT_ID = "9a1a6eef-7413-4ccc-af18-f6c9c3926110";
const TO_ACCOUNT_ID = "182a6ae2-23ae-4441-bc8e-35f3c92e5c48";

// Generate token if not supplied
let token = process.env.TEST_TOKEN;
if (!token) {
    const tokens = await defaultAuthService.generateTokens(ALICE_USER_ID, "user");
    token = tokens.accessToken;
}

// Check initial balances
const preRes = await pool.query(
    "SELECT account_name, balance, version FROM accounts WHERE account_id = $1 OR account_id = $2 ORDER BY account_name",
    [FROM_ACCOUNT_ID, TO_ACCOUNT_ID]
);
console.log("\n=== PRE-TEST ACCOUNT STATUS ===");
let initialSum = 0;
for (const acc of preRes.rows) {
    console.log(`  ${acc.account_name}: $${acc.balance} (version: ${acc.version})`);
    initialSum += parseFloat(acc.balance);
}
console.log(`  Total Sum: $${initialSum.toFixed(2)}`);

const statusCounts = {};

console.log("\nStarting Autocannon Load Test (50 connections, 10 seconds)...");

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

    // Check post-test balances
    const postRes = await pool.query(
        "SELECT account_name, balance, version FROM accounts WHERE account_id = $1 OR account_id = $2 ORDER BY account_name",
        [FROM_ACCOUNT_ID, TO_ACCOUNT_ID]
    );
    console.log("\n=== POST-TEST ACCOUNT STATUS ===");
    let postSum = 0;
    for (const acc of postRes.rows) {
        console.log(`  ${acc.account_name}: $${acc.balance} (version: ${acc.version})`);
        postSum += parseFloat(acc.balance);
    }
    console.log(`  Total Sum: $${postSum.toFixed(2)}`);
    console.log(`  Invariant Held: ${initialSum.toFixed(2) === postSum.toFixed(2) ? "PASS" : "FAIL"}`);

    await pool.end();
    process.exit(0);
});
