import express from 'express';
import cookieParser from 'cookie-parser';
import pool from './src/config/database.js';
import cors from 'cors';


import authRoutes from './src/modules/auth/routes/Auth.routes.js';
import accountRoutes from './src/modules/accounts/routes/Account.routes.js';
import transactionRoutes from './src/modules/transactions/routes/transfer.routes.js'
import benchmarkRoutes from './src/modules/benchmarks/routes/benchmark.routes.js';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors());


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/benchmarks', benchmarkRoutes);

app.get('/', (req, res) => {
  res.send('LedgerCore API is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running and listening on http://localhost:${PORT}`);
});
