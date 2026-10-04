import pool from "../src/config/database.js";
import { redis, accountCacheKey } from "../src/cache/accountCache.js";
import { AccountService } from "../src/modules/accounts/services/Account.service.js";

async function runStampedeTest() {
    // 1. Get any user ID from the database
    const userRes = await pool.query("SELECT id FROM users LIMIT 1");
    const userId = userRes.rows[0].id;
    const cacheKey = accountCacheKey(userId);

    // 2. Clear Redis so the cache is completely empty to start
    await redis.del(cacheKey);
    await redis.del(`lock:${cacheKey}`);

    console.log("Firing 50 simultaneous requests...");

    // 3. Create a list of 50 requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
        // Calling your regular cache function (without 'await' yet, so they start together)
        promises.push(AccountService.getAccountsByUserIdCache(userId));
    }

    // 4. Fire all 50 simultaneously and wait for them to finish
    await Promise.all(promises);

    console.log("All 50 requests finished.");

    await redis.quit();
    await pool.end();
}

runStampedeTest();
