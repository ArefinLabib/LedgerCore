import autocannon from "autocannon";
import { defaultAuthService } from "authentication";
import pool from "../../../config/database.js";

export const benchmarkService = {
  async runTransferBenchmark(
    { strategy = "serializable", connections = 50, duration = 10 },
    { onInfo, onStart, onTick, onDone, onError }
  ) {
    try {
      if (onInfo) onInfo({ message: "Initializing benchmark" });

      // 1. Get two accounts to test with
      const accountsRes = await pool.query(
        "SELECT account_id, user_id FROM accounts LIMIT 2"
      );
      if (accountsRes.rows.length < 2) {
        throw new Error("Not enough accounts in the database to run benchmark.");
      }

      const fromAccount = accountsRes.rows[0];
      const toAccount = accountsRes.rows[1];

      // 2. Generate a token for the first user
      const tokens = await defaultAuthService.generateTokens(
        fromAccount.user_id,
        "user"
      );
      const token = tokens.accessToken;

      // 3. Record initial balances for verification
      const preRes = await pool.query(
        "SELECT account_name, balance, version FROM accounts WHERE account_id = $1 OR account_id = $2",
        [fromAccount.account_id, toAccount.account_id]
      );

      let initialSum = 0;
      preRes.rows.forEach((acc) => {
        initialSum += parseFloat(acc.balance);
      });

      if (onStart)
        onStart({
          strategy,
          connections,
          duration,
          message: `Starting ${strategy} benchmark...`,
        });

      const statusCounts = {};

      // 4. Configure Autocannon
      const instance = autocannon({
        url: `http://localhost:${process.env.PORT || 3000}/api/transactions/transfer?strategy=${strategy}`,
        connections,
        duration,
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fromAccountId: fromAccount.account_id,
          toAccountId: toAccount.account_id,
          amount: 1,
        }),
        setupClient(client) {
          client.on("response", (statusCode) => {
            statusCounts[statusCode] = (statusCounts[statusCode] || 0) + 1;
          });
        },
      });

      // 5. Listen to tick events
      instance.on("tick", () => {
        if (onTick) onTick({ message: "Running benchmark tick..." });
      });

      // 6. Finalize and send results when done
      instance.on("done", async (result) => {
        const postRes = await pool.query(
          "SELECT account_name, balance, version FROM accounts WHERE account_id = $1 OR account_id = $2",
          [fromAccount.account_id, toAccount.account_id]
        );

        let postSum = 0;
        postRes.rows.forEach((acc) => {
          postSum += parseFloat(acc.balance);
        });

        const invariantHeld = initialSum.toFixed(2) === postSum.toFixed(2);

        if (onDone) {
          onDone({
            autocannon: result,
            statusCounts,
            invariantHeld,
            initialSum: initialSum.toFixed(2),
            postSum: postSum.toFixed(2),
          });
        }
      });
      
      return instance; // Return instance so the controller can stop it if client disconnects early
    } catch (error) {
      if (onError) onError({ message: error.message });
    }
  },
};
