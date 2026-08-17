import express from 'express';
import cookieParser from 'cookie-parser';
import pool from './src/config/database.js';

import authRoutes from './src/modules/auth/AuthRoutes.js';
import accountRoutes from './src/modules/accounts/AccountRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);

app.get('/', (req, res) => {
  res.send('LedgerCore API is running!');
});

app.get('/api/db-test', async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT NOW()');
    res.json({
      success: true,
      currentTime: dbRes.rows[0].now,
      message: 'Successfully connected to PostgreSQL!'
    });
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to the database'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running and listening on http://localhost:${PORT}`);
});
