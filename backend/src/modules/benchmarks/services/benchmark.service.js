import autocannon from "autocannon";
import { defaultAuthService } from "authentication";
import pool from "../../../config/database.js";

export const benchmarkService = {
  async runTransferBenchmark(
    { strategy = "serializable", connections = 50, duration = 10, scenario = "hot-wallet" },
    { onInfo, onStart, onTick, onDone, onError }
  ) {
    try {
      if (onInfo) onInfo({ message: "Initializing benchmark environment..." });

      // Create a test user if needed
      const userRes = await pool.query(`
        INSERT INTO users (username, password_hash, role) 
        VALUES ($1, $2, 'user') 
        ON CONFLICT (username) DO UPDATE SET role = 'user' RETURNING id`, 
        [`bench_user_${Date.now()}`, 'hashed']
      );
      const userId = userRes.rows[0].id;

      // Generate token
      const tokens = await defaultAuthService.generateTokens(userId, "user");
      const token = tokens.accessToken;

      let generatedRequests = [];
      let trackAccounts = [];

      if (scenario === "happy-path") {
        if (onInfo) onInfo({ message: "Provisioning isolated account pairs for Zero Contention..." });
        // Create 2000 accounts to ensure we never loop too fast
        const values = [];
        const queryParams = [];
        for(let i=0; i < 2000; i++) {
          values.push(`($${i*3 + 1}, $${i*3 + 2}, $${i*3 + 3})`);
          queryParams.push(userId, `HappyAccount_${i}`, 1000.00);
        }
        const insertRes = await pool.query(
          `INSERT INTO accounts (user_id, account_name, balance) VALUES ${values.join(',')} RETURNING account_id`,
          queryParams
        );
        const accs = insertRes.rows.map(a => a.account_id);
        trackAccounts = accs;
        
        global.benchmarkAccounts = accs;
        global.benchmarkIndex = 0;
        
        generatedRequests.push({
          method: "POST",
          path: `/api/transactions/transfer?strategy=${strategy}&scenario=happy-path`,
          headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
          body: JSON.stringify({ amount: 1 }) // Accounts filled dynamically by controller
        });
      } 
      else if (scenario === "deadlock") {
        if (onInfo) onInfo({ message: "Provisioning a small account pool to force 2-Way Contention..." });
        const values = [];
        const queryParams = [];
        for(let i=0; i < 5; i++) {
          values.push(`($${i*3 + 1}, $${i*3 + 2}, $${i*3 + 3})`);
          queryParams.push(userId, `DeadlockAcc_${i}`, 100000.00);
        }
        const insertRes = await pool.query(
          `INSERT INTO accounts (user_id, account_name, balance) VALUES ${values.join(',')} RETURNING account_id`,
          queryParams
        );
        const accs = insertRes.rows.map(a => a.account_id);
        trackAccounts = accs;
        
        global.benchmarkAccounts = accs;
        
        generatedRequests.push({
          method: "POST",
          path: `/api/transactions/transfer?strategy=${strategy}&scenario=deadlock`,
          headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
          body: JSON.stringify({ amount: 10 }) // Accounts filled dynamically by controller
        });
      }
      else if (scenario === "overdraft") {
        if (onInfo) onInfo({ message: "Provisioning a vulnerable account with exactly $100..." });
        const insertRes = await pool.query(`
          INSERT INTO accounts (user_id, account_name, balance) 
          VALUES ($1, 'Target', 100.00), ($1, 'Thief', 0.00) 
          RETURNING account_id`,
          [userId]
        );
        trackAccounts = [insertRes.rows[0].account_id, insertRes.rows[1].account_id];
        
        generatedRequests.push({
          method: "POST",
          path: `/api/transactions/transfer?strategy=${strategy}`,
          headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
          body: JSON.stringify({ fromAccountId: trackAccounts[0], toAccountId: trackAccounts[1], amount: 100 })
        });
      }
      else { // hot-wallet
        if (onInfo) onInfo({ message: "Provisioning Hot Wallet with massive balance for 1-Way Contention..." });
        const insertRes = await pool.query(`
          INSERT INTO accounts (user_id, account_name, balance) 
          VALUES ($1, 'HotWallet', 1000000.00), ($1, 'Receiver', 0.00) 
          RETURNING account_id`,
          [userId]
        );
        trackAccounts = [insertRes.rows[0].account_id, insertRes.rows[1].account_id];
        
        generatedRequests.push({
          method: "POST",
          path: `/api/transactions/transfer?strategy=${strategy}`,
          headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
          body: JSON.stringify({ fromAccountId: trackAccounts[0], toAccountId: trackAccounts[1], amount: 1 })
        });
      }

      // Record initial balances for verification
      const preRes = await pool.query(`SELECT balance FROM accounts WHERE account_id = ANY($1)`, [trackAccounts]);
      let initialSum = 0;
      preRes.rows.forEach((acc) => { initialSum += parseFloat(acc.balance); });

      if (onStart)
        onStart({
          strategy,
          connections,
          duration,
          message: `Starting ${scenario} benchmark with ${strategy}...`,
        });

      const statusCounts = {};

      // 4. Configure Autocannon
      const instance = autocannon({
        url: `http://localhost:${process.env.PORT || 3000}`,
        connections,
        duration,
        requests: generatedRequests,
        setupClient(client) {
          let errorLogged = false;
          client.on("response", (statusCode, resBytes, responseTime) => {
            statusCounts[statusCode] = (statusCounts[statusCode] || 0) + 1;
          });
          client.on("body", (bodyBuffer) => {
            if (!errorLogged) {
              try {
                const bodyStr = bodyBuffer.toString();
                if (bodyStr.includes("success\":false")) {
                  const parsed = JSON.parse(bodyStr);
                  if (onInfo) onInfo({ message: `[LOG] Concurrency Error Detected: ${parsed.message}` });
                  errorLogged = true; // only log once per client to prevent spam
                }
              } catch (e) {}
            }
          });
        },
      });

      // 5. Listen to tick events
      let ticks = 0;
      instance.on("tick", () => {
        ticks++;
        const currentReqs = Object.values(statusCounts).reduce((a,b) => a+b, 0);
        if (onTick) onTick({ message: `[${ticks}s] Running... ${currentReqs} requests processed.` });
      });

      // 6. Finalize and send results when done
      instance.on("done", async (result) => {
        const postRes = await pool.query(
          `SELECT balance FROM accounts WHERE account_id = ANY($1)`,
          [trackAccounts]
        );

        let postSum = 0;
        postRes.rows.forEach((acc) => {
          postSum += parseFloat(acc.balance);
        });

        const invariantHeld = initialSum.toFixed(2) === postSum.toFixed(2);

        // Cleanup test data
        try {
          await pool.query('DELETE FROM transactions WHERE transaction_id IN (SELECT transaction_id FROM ledger_entries WHERE account_id = ANY($1))', [trackAccounts]);
          await pool.query('DELETE FROM accounts WHERE account_id = ANY($1)', [trackAccounts]);
          await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        } catch (cleanupErr) {
          console.error("Failed to cleanup benchmark data:", cleanupErr);
        }

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
