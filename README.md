# LedgerCore: Concurrency-Safe Double-Entry Ledger Engine

LedgerCore is a high-throughput, double-entry financial ledger engine built in Node.js and PostgreSQL. It implements and benchmarks three swappable concurrency control strategies (Pessimistic Locking, Optimistic Concurrency Control, and Serializable Snapshot Isolation) under the exact same schema and API surface.

Rather than treating database transactions as generic CRUD operations, LedgerCore models money the way financial institutions do: immutable double-entry ledger records, strict balance conservation invariants, and measurable concurrency guarantees under high parallel write contention.

## Why Double-Entry Bookkeeping

Simple banking tutorials update account balances using `UPDATE accounts SET balance = balance - amount`. This model fails in production because it lacks auditability and loses atomicity guarantees across multiple accounts.

LedgerCore enforces strict double-entry principles:
* Every money transfer creates one parent `transactions` record and exactly two immutable `ledger_entries` records: a debit and a credit.
* The sum of debits and credits for every transaction must equal zero.
* An account balance is the point-in-time reflection of its underlying ledger entries.
* The global money supply across all accounts remains constant throughout concurrent transfers: Initial System Balance equals Final System Balance.

## Architecture and Schema

The system runs on PostgreSQL and Express with the following primary entities:

* `users`: Authentication and identity records.
* `accounts`: Account records containing account number, balance, currency, ownership, and a monotonic `version` integer for optimistic concurrency control.
* `transactions`: Top-level transaction metadata (`transaction_type`, `status`, timestamp).
* `ledger_entries`: Double-entry journal records (`account_id`, `amount`, `type: debit | credit`, `status: success | failed`).

Database migrations are managed sequentially under `src/db/migrations/`.

## The Three Swappable Concurrency Strategies

LedgerCore implements three distinct strategies to handle concurrent transfers. All three share the exact same schema and endpoint (`POST /api/transactions/transfer`), selectable at runtime via the `?strategy=` query parameter, `X-Strategy` request header, or the `CONCURRENCY_STRATEGY` environment variable.

### 1. Pessimistic Locking (`pessimistic`)
* Implementation: `src/modules/transactions/services/transfer.service.js`
* Mechanism: Executes inside PostgreSQL `READ COMMITTED` isolation using explicit row locks via `SELECT ... FOR UPDATE`.
* Behavior: When concurrent transactions target the same account, the second transaction blocks at the database level until the first transaction commits or rolls back.
* Deterministic Ordering: Accounts are queried and locked in sorted order (`ORDER BY account_id`) to prevent cross-account deadlocks during concurrent bidirectional transfers (e.g. Account A to B while Account B transfers to A).

### 2. Optimistic Concurrency Control (`optimistic`)
* Implementation: `src/modules/transactions/services/transfer_optimistic.service.js`
* Mechanism: Non-blocking reads (`SELECT balance, version FROM accounts`) followed by conditional atomic updates:
  `UPDATE accounts SET balance = balance - $1, version = version + 1 WHERE account_id = $2 AND version = $3`
* Conflict Detection: If zero rows are affected, another transaction modified the row concurrently. The transaction is aborted and rolled back.
* Application Retry: Wrapped in an exponential backoff retry loop (`executeTransferWithRetry`) with configurable jitter and retry limits.

### 3. Serializable Snapshot Isolation (`serializable`)
* Implementation: `src/modules/transactions/services/transfer_serializable.services.js`
* Mechanism: Pure Serializable Snapshot Isolation (`BEGIN ISOLATION LEVEL SERIALIZABLE`). Reads data concurrently without explicit `FOR UPDATE` row locks.
* Conflict Detection: Relies on PostgreSQL's internal SSI engine (`SIREAD` predicate locks in `predicate.c`) to detect rw-antidependency conflicts and dangerous structures in the transaction dependency graph.
* Application Retry: When PostgreSQL identifies a serialization failure, it aborts the transaction with SQLSTATE `40001` (`serialization_failure`). The service catches `40001` and executes an exponential backoff retry.

## Empirical Benchmark Results

All benchmarks were conducted using `autocannon` with 50 concurrent TCP connections targeting a live PostgreSQL database instance with a pool size of 10 connections.

### Scenario A: Extreme Single-Account Contention
50 concurrent connections continuously transferring money between the exact same account pair (Alice to Bob) over 5 seconds.

| Metric | Pessimistic Locking | Optimistic Locking | Serializable (SSI) |
| :--- | :--- | :--- | :--- |
| Concurrency Mechanism | `SELECT ... FOR UPDATE` | `version` check + retry | PostgreSQL SSI + retry |
| Total Requests | 3,799 | 3,191 | 3,332 |
| Successful Transfers | 3,799 | 2,187 | 3,049 |
| Success Rate | 100.0% | 68.5% | 91.5% |
| Throughput | 760 req/sec | 638 req/sec | 666 req/sec |
| Median Latency (p50) | 61 ms | 54 ms | 2 ms |
| 99th Percentile Latency | 169 ms | 192 ms | 444 ms |
| Max Latency | 248 ms | 217 ms | 465 ms |
| Balance Invariant | PASS | PASS | PASS |

### Scenario B: Distributed Multi-Account Load
50 concurrent connections distributed across 25 independent account pairs (50 accounts total) over 10 seconds.

| Metric | Pessimistic Baseline | Optimistic Locking | Serializable (SSI) |
| :--- | :--- | :--- | :--- |
| Throughput | ~661 req/sec | 1,786 req/sec | ~668 req/sec |
| Successful Transfers | ~7,000 (10s) | 17,800 (10s) | 6,096 (10s) |
| Success Rate | 100.0% | 99.66% | 91.23% |
| Conflict Rate | 0.0% | 0.34% (60 conflicts) | 8.77% |
| Median Latency (p50) | 72 ms | 26 ms | 1 ms |
| 97.5th Percentile Latency | 111 ms | 32 ms | 383 ms |
| Combined Balance Invariant | PASS ($500,000.00) | PASS ($500,000.00) | PASS ($500,000.00) |

### Engineering Analysis of Trade-offs

#### When Pessimistic Wins
Pessimistic locking dominates under extreme, single-record write contention. Because all 50 workers target the exact same row, queuing them up sequentially in the database engine eliminates wasted work. Every request waits in queue and succeeds (100% success rate, 0 errors). The cost is higher median latency (61 ms) and holding database connection pool slots while waiting.

#### When Optimistic Wins
Optimistic locking dominates distributed workloads where contention per account is low to moderate. Throughput jumped from 661 req/sec to 1,786 req/sec (a 2.7x increase), and median latency dropped to 26 ms. Because reads do not acquire row locks, transactions execute without blocking. Contention only degrades performance when multiple writers hit the exact same record within the same millisecond.

#### When Serializable (SSI) Wins
Serializable isolation provides the highest correctness guarantee in relational database theory. While pessimistic and optimistic locking protect single-row updates, they do not inherently prevent multi-row anomalies like Write Skew or Phantom Reads. Serializable isolation achieves sub-2ms median latency for non-conflicting reads/writes and delegates anomaly detection entirely to PostgreSQL's dependency graph engine.

## Concurrency Verification and Proofs

To prove that Serializable Snapshot Isolation actively prevents database anomalies that lower isolation levels permit, LedgerCore includes an automated test harness in `tests/concurrency/prove-serializable.js`.

Running `npm test` executes three targeted test scenarios:

### 1. Serialization Failure Detection (SQLSTATE 40001)
* Two concurrent transactions open in `SERIALIZABLE` mode and read the same account balance ($1000.00).
* Transaction A debits $100 and commits.
* Transaction B attempts to debit $100 based on its stale snapshot.
* Result: PostgreSQL detects the concurrent update conflict and aborts Transaction B with SQLSTATE `40001` (`could not serialize access due to concurrent update`).

### 2. Service Retry Verification
* Two concurrent workers execute transfers simultaneously against the same account via `transferServiceSerializable.executeTransfer`.
* Result: The worker receiving SQLSTATE `40001` automatically executes an exponential backoff retry on a clean snapshot. Both transfers complete successfully without dropping updates.

### 3. Write Skew Anomaly Prevention
* Business Rule: The combined balance of Account 1 and Account 2 must not drop below $500.
* Current Balances: Account 1 = $800, Account 2 = $1100 (Total = $1900).
* Transaction A reads both accounts and withdraws $700 from Account 1 (remaining total: $1200 >= $500).
* Transaction B reads both accounts concurrently and withdraws $800 from Account 2 (remaining total: $1100 >= $500).
* Under `READ COMMITTED`, both transactions commit because their writes do not overlap, leaving total balance at $400 (violating the $500 rule).
* Result under Serializable: Transaction A commits. PostgreSQL tracks the rw-antidependency cycle and aborts Transaction B on commit with SQLSTATE `40001` (`could not serialize access due to read/write dependencies among transactions`).

## Getting Started

### Prerequisites
* Node.js (v18 or higher)
* PostgreSQL (v14 or higher)

### Installation
1. Clone the repository:
   git clone https://github.com/ArefinLabib/LedgerCore.git
   cd LedgerCore

2. Install dependencies:
   npm install

3. Configure environment variables in `.env`:
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=ledger_core
   DB_USER=postgres
   DB_PASSWORD=your_password

4. Run database migrations:
   npm run migrate

5. Start the server:
   npm run dev

## Running Tests and Benchmarks

### 1. Run Automated Concurrency Proofs
Executes conflict detection and Write Skew verification tests:
npm test

### 2. Run the Unified 3-Strategy Benchmark
Executes a head-to-head comparison of Pessimistic, Optimistic, and Serializable strategies under 50 concurrent connections:
npm run benchmark

### 3. Run Individual Strategy Benchmarks
* Pessimistic: `npm run benchmark:pessimistic`
* Optimistic: `npm run benchmark:optimistic`
* Serializable: `npm run benchmark:serializable`
* Distributed Multi-Account: `npm run benchmark:distributed`

## API Reference

### Transfer Money
`POST /api/transactions/transfer`

Query Parameters (Optional):
* `strategy`: `pessimistic` | `optimistic` | `serializable` (default: `serializable`)

Headers:
* `Authorization`: `Bearer <jwt_token>`
* `Content-Type`: `application/json`
* `X-Strategy`: Optional header alternative for strategy selection

Request Body:
```json
{
  "fromAccountId": "uuid",
  "toAccountId": "uuid",
  "amount": 100.00
}
```

Response (200 OK):
```json
{
  "success": true,
  "message": "Transfer Successful",
  "data": {
    "debit": {
      "account_id": "uuid",
      "balance": "900.00"
    },
    "credit": {
      "account_id": "uuid",
      "balance": "1100.00"
    },
    "transaction": {
      "transaction_id": "uuid",
      "transaction_type": "transfer",
      "status": "completed"
    }
  }
}
```

## Project Structure

```
ledgercore/
├── migrate.js
├── package.json
├── README.md
├── server.js
├── src/
│   ├── config/
│   │   └── database.js
│   ├── db/
│   │   └── migrations/
│   │       ├── 001_initial_schema.sql
│   │       ├── 002_add_users_and_auth.sql
│   │       ├── 003_add_transaction_enums.sql
│   │       ├── 004_add_ledger_enums_and_status.sql
│   │       └── 005_add_version_column.sql
│   └── modules/
│       ├── accounts/
│       ├── auth/
│       └── transactions/
│           ├── controller/
│           │   └── transfer.controller.js
│           ├── routes/
│           │   └── transfer.routes.js
│           └── services/
│               ├── transfer.service.js
│               ├── transfer_optimistic.service.js
│               └── transfer_serializable.services.js
└── tests/
    ├── concurrency/
    │   └── prove-serializable.js
    └── load/
        ├── compare-all.js
        ├── diagnose-errors.js
        ├── multi-account-test.js
        ├── optimistic-transfer.js
        ├── pessimistic-transfer.js
        ├── seed-multi-accounts.js
        └── serializable-transfer.js
```