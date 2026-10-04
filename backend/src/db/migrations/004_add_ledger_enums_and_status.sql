CREATE TYPE ledger_entry_type_enum AS ENUM ('credit', 'debit');
CREATE TYPE ledger_entry_status_enum AS ENUM ('pending', 'success', 'failed');

ALTER TABLE ledger_entries
    ALTER COLUMN type TYPE ledger_entry_type_enum USING type::ledger_entry_type_enum;

ALTER TABLE ledger_entries
    ADD COLUMN status ledger_entry_status_enum DEFAULT 'pending';
