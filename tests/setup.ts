// Tests run ONLY against a local Postgres (see TESTING.md). Never production.
process.env.DB_DRIVER = "pg";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://mulia@127.0.0.1:55432/mulia_test";
