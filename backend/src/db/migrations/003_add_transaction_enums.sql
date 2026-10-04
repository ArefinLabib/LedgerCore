CREATE TYPE transaction_status_enum AS ENUM ('pending', 'completed', 'failed', 'reversed');
CREATE TYPE transaction_type_enum AS ENUM ('transfer', 'deposit', 'withdrawal');

ALTER TABLE transactions
    ALTER COLUMN status DROP DEFAULT,
    ALTER COLUMN status TYPE transaction_status_enum USING status::transaction_status_enum,
    ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE transactions
    ALTER COLUMN transaction_type TYPE transaction_type_enum USING transaction_type::transaction_type_enum;
