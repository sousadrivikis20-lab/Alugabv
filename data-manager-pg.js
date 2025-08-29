const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Queries de inicialização do banco
const INIT_QUERIES = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    contato VARCHAR(255) NOT NULL,
    coords JSONB NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    sale_price DECIMAL,
    rental_price DECIMAL,
    rental_period VARCHAR(50),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    owner_username VARCHAR(255),
    images TEXT[]
  )`
];

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const query of INIT_QUERIES) {
      await client.query(query);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Funções de usuário
async function readUsers() {
  const { rows } = await pool.query('SELECT * FROM users');
  return rows;
}

async function writeUsers(users) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM users');
    for (const user of users) {
      await client.query(
        'INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)',
        [user.id, user.username, user.password, user.role]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Funções de propriedades
async function readImoveis() {
  const { rows } = await pool.query('SELECT * FROM properties');
  return { imoveis: rows };
}

async function writeImoveis(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM properties');
    for (const prop of data.imoveis) {
      await client.query(
        `INSERT INTO properties (
          id, nome, descricao, contato, coords, transaction_type, 
          property_type, sale_price, rental_price, rental_period,
          owner_id, owner_username, images
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          prop.id, prop.nome, prop.descricao, prop.contato,
          JSON.stringify(prop.coords), prop.transactionType,
          prop.propertyType, prop.salePrice, prop.rentalPrice,
          prop.rentalPeriod, prop.ownerId, prop.ownerUsername,
          prop.images
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  initDB,
  readUsers,
  writeUsers,
  readImoveis,
  writeImoveis,
  dataDir: path.join(__dirname) // Mantido para compatibilidade com uploads
};
