const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "Billys",
  password: "Az123123@",
  port: 5432,
});

module.exports = pool;