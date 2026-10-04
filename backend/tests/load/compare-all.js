import autocannon from "autocannon";
import { defaultAuthService } from "authentication";
import pool from "../../src/config/database.js";

const ALICE_USER_ID = "fd328661-f47d-4fa5-a71d-abf3daa02c1b";
const FROM_ACCOUNT_ID = "9a1a6eef-7413-4ccc-af18-f6c9c3926110";
const TO_ACCOUNT_ID = "182a6ae2-23ae-4441-bc8e-35f3c92e5c48";
const DURATION_SECONDS = 5;
const CONNECTIONS = 50;

async function resetBalances() {
    await pool.query("UPDATE accounts SET balance = 50000.00, version = 1 WHERE account_id = $1::uuid", [FROM_ACCOUNT_ID]);
    await pool.query("UPDATE accounts SET balance = 50000.00, version = 1 WHERE account_id = $1::uuid", [TO_ACCOUNT_ID]);
}

async function getBalances() {
    const res = await pool.query(
        "SELECT account_name, balance FROM accounts WHERE account_id = $1::uuid OR account_id = $2::uuid ORDER BY account_name",
        [FROM_ACCOUNT_ID, TO_ACCOUNT_ID]
    );
    return res.rows;
}

async function runStrategyTest(strategyName, token) {
    await resetBalances();
    const preBalances = await getBalances();
    const preSum = preBalances.reduce((sum, r) => sum + parseFloat(r.balance), 0);

    const statusCounts = {};

    const result = await autocannon({
        url: `http://localhost:3000/api/transactions/transfer?strategy=${strategyName}`,
        connections: CONNECTIONS,
        duration: DURATION_SECONDS,
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

    const postBalances = await getBalances();
    const postSum = postBalances.reduce((sum, r) => sum + parseFloat(r.balance), 0);
    const invariantPassed = preSum.toFixed(2) === postSum.toFixed(2);

    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const success = statusCounts[200] || 0;
    const errors = total - success;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : "0.0";

    return {
        strategy: strategyName,
        totalRequests: total,
        successCount: success,
        errorCount: errors,
        successRate: `${successRate}%`,
        throughput: Math.round(result.requests.average),
        p50: `${result.latency.p50} ms`,
        p99: `${result.latency.p99} ms`,
        maxLatency: `${result.latency.max} ms`,
        invariant: invariantPassed ? "PASS" : "FAIL"
    };
}

async function main() {
    const tokens = await defaultAuthService.generateTokens(ALICE_USER_ID, "user");
    const token = tokens.accessToken;

    console.log("=========================================================================");
    console.log(`Running Unified Benchmark (50 connections, ${DURATION_SECONDS}s per strategy)`);
    console.log("Target: Extreme Single-Account Contention (Alice -> Bob)");
    console.log("=========================================================================\n");

    const strategies = ["pessimistic", "optimistic", "serializable"];
    const results = [];

    for (const strat of strategies) {
        process.stdout.write(`Testing [${strat}] strategy... `);
        const res = await runStrategyTest(strat, token);
        results.push(res);
        console.log("DONE");
    }

    console.log("\n======================== BENCHMARK RESULTS ========================\n");
    console.table(results);

    await pool.end();
}

main().catch(console.error);
