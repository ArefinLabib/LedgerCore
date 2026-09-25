import pool from '../src/config/database.js';

const TOTAL_USERS = 1_000_000;
const TOTAL_ACCOUNTS = 1_000_000;
const BATCH_SIZE = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeUsername(i) {
  return `user_${String(i).padStart(8, '0')}`;
}

async function ensureUserCount() {
  const existing = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  const count = existing.rows[0].count;
  console.log(`Existing users: ${count}`);

  if (count >= TOTAL_USERS) {
    console.log('Enough users already exist. Skipping user creation.');
    return;
  }

  console.log(`Creating ${TOTAL_USERS - count} users...`);

  for (let offset = count; offset < TOTAL_USERS; offset += BATCH_SIZE) {
    const slice = [];
    const rowCount = Math.min(BATCH_SIZE, TOTAL_USERS - offset);

    for (let i = 0; i < rowCount; i += 1) {
      const index = offset + i;
      const username = makeUsername(index + 1);
      const passwordHash = '$2b$10$abcdefghijklmnopqrstuv';
      slice.push(`('${username}', '${passwordHash}', 'user')`);
    }

    const query = `
      INSERT INTO users (username, password_hash, role)
      VALUES ${slice.join(', ')}
      ON CONFLICT (username) DO NOTHING
    `;

    await pool.query(query);
    console.log(`Inserted users batch ending at ${offset + rowCount}`);
  }
}

async function insertAccounts() {
  const rows = [];
  const userIds = await pool.query(
    'SELECT id FROM users ORDER BY created_at LIMIT $1',
    [TOTAL_USERS]
  );

  const ids = userIds.rows.map((row) => row.id);

  console.log(`Loaded ${ids.length} user IDs for account creation.`);

  for (let i = 0; i < TOTAL_ACCOUNTS; i += 1) {
    const userId = ids[i % ids.length];
    const currency = ['USD', 'EUR', 'GBP'][randomInt(0, 2)];
    const balance = (Math.random() * 2500).toFixed(2);
    const accountName = `Account_${i + 1}`;
    rows.push(`(gen_random_uuid(), '${accountName}', ${balance}, '${currency}', '${userId}')`);

    if (rows.length >= BATCH_SIZE) {
      const query = `
        INSERT INTO accounts (account_id, account_name, balance, currency, user_id)
        VALUES ${rows.join(', ')}
      `;
      await pool.query(query);
      rows.length = 0;
      if ((i + 1) % 100_000 === 0) {
        console.log(`Inserted ${i + 1} accounts...`);
      }
    }
  }

  if (rows.length > 0) {
    const query = `
      INSERT INTO accounts (account_id, account_name, balance, currency, user_id)
      VALUES ${rows.join(', ')}
    `;
    await pool.query(query);
  }
}

async function main() {
  try {
    await ensureUserCount();
    await insertAccounts();
    const accountTotal = await pool.query('SELECT COUNT(*)::int AS count FROM accounts');
    const userTotal = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    console.log('Final counts:');
    console.log(`Users: ${userTotal.rows[0].count}`);
    console.log(`Accounts: ${accountTotal.rows[0].count}`);
  } catch (err) {
    console.error('Seed job failed:', err);
  } finally {
    await pool.end();
  }
}

main();
