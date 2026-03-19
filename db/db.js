const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres.ctjgemczhxzygechqlii",
  host: "aws-1-eu-west-1.pooler.supabase.com",
  database: "postgres",
  password: "billys1234@ffmm",
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;