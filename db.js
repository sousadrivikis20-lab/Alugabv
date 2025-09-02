const { Pool } = require('pg');
require('dotenv').config();

// Centraliza a criação do Pool de conexão com o PostgreSQL.
// Isso garante que toda a aplicação use a mesma instância, o que é mais eficiente e seguro.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // A opção SSL é necessária para conexões com bancos de dados internos no Render.
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool;
