import pool from "../../src/config/database.js";

const ALICE_USER_ID = "fd328661-f47d-4fa5-a71d-abf3daa02c1b";
const BOB_USER_ID = "abf14da9-1af0-4011-9781-ea35d030dda6";
const NUM_PAIRS = 25;

export async function seedAccounts() {
    const pairs = [];

    // Clean up any old load-test accounts
    await pool.query("DELETE FROM accounts WHERE account_name LIKE 'Alice_LoadTest_%' OR account_name LIKE 'Bob_LoadTest_%'");

    for (let i = 1; i <= NUM_PAIRS; i++) {
        const aliceRes = await pool.query(
            `INSERT INTO accounts (account_name, balance, currency, user_id, version)
             VALUES ($1, $2, 'USD', $3, 1) RETURNING account_id`,
            [`Alice_LoadTest_${i}`, 10000.00, ALICE_USER_ID]
        );

        const bobRes = await pool.query(
            `INSERT INTO accounts (account_name, balance, currency, user_id, version)
             VALUES ($1, $2, 'USD', $3, 1) RETURNING account_id`,
            [`Bob_LoadTest_${i}`, 10000.00, BOB_USER_ID]
        );

        pairs.push({
            fromAccountId: aliceRes.rows[0].account_id,
            toAccountId: bobRes.rows[0].account_id
        });
    }

    console.log(`Successfully seeded ${NUM_PAIRS} account pairs (50 accounts total).`);
    return pairs;
}

if (process.argv[1] && process.argv[1].endsWith("seed-multi-accounts.js")) {
    await seedAccounts();
    await pool.end();
}
