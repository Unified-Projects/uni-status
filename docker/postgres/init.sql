-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schema for partitioned tables
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Grant permissions
GRANT ALL ON SCHEMA monitoring TO uni_status;
GRANT ALL ON SCHEMA public TO uni_status;

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'Uni-Status database initialized successfully';
END $$;
