import pool from "../../src/config/database.js";
import { transferServiceSerializable } from "../../src/modules/transactions/services/transfer_serializable.services.js";

async function runProofs() {
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
        // Setup a dedicated test user & accounts
        const userRes = await pool.query(
            "INSERT INTO users (username, password_hash, role) VALUES ('ssi_test_user', 'hash', 'user') ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id"
        );
        const userId = userRes.rows[0].id;

        await pool.query("DELETE FROM ledger_entries WHERE account_id IN (SELECT account_id FROM accounts WHERE user_id = $1)", [userId]);
        await pool.query("DELETE FROM accounts WHERE user_id = $1", [userId]);

        const acc1Res = await pool.query(
            "INSERT INTO accounts (account_name, balance, currency, user_id) VALUES ('SSI_Account_1', 1000.00, 'USD', $1) RETURNING account_id",
            [userId]
        );
        const acc2Res = await pool.query(
            "INSERT INTO accounts (account_name, balance, currency, user_id) VALUES ('SSI_Account_2', 1000.00, 'USD', $1) RETURNING account_id",
            [userId]
        );
        const id1 = acc1Res.rows[0].account_id;
        const id2 = acc2Res.rows[0].account_id;

        // TEST 1: Direct Conflict Detection (SQLSTATE 40001)
        console.log("[Test 1] Serialization Failure (SQLSTATE 40001) Detection");
        console.log("1. Starting Transaction A (SERIALIZABLE)...");
        await clientA.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

        console.log("2. Starting Transaction B (SERIALIZABLE)...");
        await clientB.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

        console.log("3. Both transactions read Account 1 concurrently...");
        const readA = await clientA.query("SELECT balance FROM accounts WHERE account_id = $1", [id1]);
        const readB = await clientB.query("SELECT balance FROM accounts WHERE account_id = $1", [id1]);
        console.log(`   Transaction A saw balance: $${readA.rows[0].balance}`);
        console.log(`   Transaction B saw balance: $${readB.rows[0].balance}`);

        console.log("4. Transaction A debits $100 and commits...");
        await clientA.query("UPDATE accounts SET balance = balance - 100 WHERE account_id = $1", [id1]);
        await clientA.query("COMMIT");
        console.log("   Transaction A successfully COMMITTED.");

        console.log("5. Transaction B now attempts to update Account 1 based on its stale read...");
        let errorCaught = null;
        try {
            await clientB.query("UPDATE accounts SET balance = balance - 100 WHERE account_id = $1", [id1]);
            await clientB.query("COMMIT");
        } catch (err) {
            errorCaught = err;
            await clientB.query("ROLLBACK").catch(() => {});
        }

        if (errorCaught && errorCaught.code === "40001") {
            console.log(`   [PASS] PostgreSQL aborted Transaction B with SQLSTATE ${errorCaught.code}`);
            console.log(`   Detail: ${errorCaught.message}`);
        } else {
            console.error("   [FAIL] Expected 40001 serialization_failure, got:", errorCaught);
        }

        // TEST 2: Transfer Service Automatic Retry on 40001
        console.log("\n[Test 2] Service Retry Mechanism Verification");
        console.log("Executing transferServiceSerializable.executeTransfer concurrently from 2 workers...");

        const promise1 = transferServiceSerializable.executeTransfer(id1, id2, 50);
        const promise2 = transferServiceSerializable.executeTransfer(id1, id2, 50);

        const results = await Promise.all([promise1, promise2]);
        console.log("   Worker 1 result: Debit balance =", results[0].debit.balance);
        console.log("   Worker 2 result: Debit balance =", results[1].debit.balance);

        const finalCheck = await pool.query("SELECT balance FROM accounts WHERE account_id = $1", [id1]);
        console.log(`   Final Account 1 balance: $${finalCheck.rows[0].balance} (Expected: $800.00 after $100 + $50 + $50 debits)`);
        console.log(`   Retry Handling: ${parseFloat(finalCheck.rows[0].balance) === 800 ? "PASS" : "FAIL"}`);

        // TEST 3: Write Skew Anomaly Prevention
        console.log("\n[Test 3] Write Skew Anomaly Prevention");
        console.log("Rule: Combined balance of Account 1 and Account 2 must stay >= $500.");
        console.log("Current balances: Account 1 = $800, Account 2 = $1100. Total = $1900.");

        await clientA.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await clientB.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

        // T1 reads both accounts
        const t1TotalRes = await clientA.query("SELECT SUM(balance) as total FROM accounts WHERE account_id = $1::uuid OR account_id = $2::uuid", [id1, id2]);
        const t1Total = parseFloat(t1TotalRes.rows[0].total); // 1900

        // T2 reads both accounts
        const t2TotalRes = await clientB.query("SELECT SUM(balance) as total FROM accounts WHERE account_id = $1::uuid OR account_id = $2::uuid", [id1, id2]);
        const t2Total = parseFloat(t2TotalRes.rows[0].total); // 1900

        // T1 withdraws 700 from Account 1 (1900 - 700 = 1200 >= 500)
        await clientA.query("UPDATE accounts SET balance = balance - 700 WHERE account_id = $1::uuid", [id1]);

        // T2 withdraws 800 from Account 2 (1900 - 800 = 1100 >= 500)
        // If BOTH commit, remaining total = 1900 - 1500 = 400 (< 500, VIOLATION!)
        await clientB.query("UPDATE accounts SET balance = balance - 800 WHERE account_id = $1::uuid", [id2]);

        console.log("Committing Transaction A...");
        await clientA.query("COMMIT");

        console.log("Committing Transaction B (should be rejected for write skew)...");
        let writeSkewError = null;
        try {
            await clientB.query("COMMIT");
        } catch (err) {
            writeSkewError = err;
            await clientB.query("ROLLBACK").catch(() => {});
        }

        if (writeSkewError && writeSkewError.code === "40001") {
            console.log(`   [PASS] PostgreSQL detected Write Skew and aborted Transaction B`);
            console.log(`   Detail: ${writeSkewError.message} (SQLSTATE: ${writeSkewError.code})`);
        } else {
            console.error("   [FAIL] Write skew was NOT prevented. Error:", writeSkewError);
        }

        // Cleanup
        await pool.query("DELETE FROM ledger_entries WHERE account_id IN (SELECT account_id FROM accounts WHERE user_id = $1)", [userId]);
        await pool.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    } finally {
        clientA.release();
        clientB.release();
        await pool.end();
    }
}

runProofs().catch(console.error);
