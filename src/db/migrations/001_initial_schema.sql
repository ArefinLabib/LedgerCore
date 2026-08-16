CREATE TABLE IF NOT EXISTS accounts (
    account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_number INTEGER GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    account_name varchar(255) NOT NULL,
    balance decimal(15,2) default 0.00,
    currency char(3) default 'USD',
    created_at timestamp with time zone default current_timestamp,
    updated_at timestamp with time zone default current_timestamp
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_type varchar(10) NOT NULL,
    status varchar(10) default 'pending',
    created_at timestamp with time zone default current_timestamp
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    amount decimal(15,2) NOT NULL,
    type varchar(10) NOT NULL,
    created_at timestamp with time zone default current_timestamp
);