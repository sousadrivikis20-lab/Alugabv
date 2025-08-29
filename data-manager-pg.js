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
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'Vender',
    property_type VARCHAR(50) NOT NULL DEFAULT 'Casa',
    sale_price DECIMAL(10,2),
    rental_price DECIMAL(10,2),
    rental_period VARCHAR(50),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    owner_username VARCHAR(255),
    images TEXT[]
  )`
];

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS properties (
        id VARCHAR(36) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        contato VARCHAR(100) NOT NULL,
        coords JSONB NOT NULL,
        owner_id VARCHAR(36) REFERENCES users(id),
        owner_username VARCHAR(100),
        transaction_type VARCHAR(50) NOT NULL DEFAULT 'Vender',
        property_type VARCHAR(50) NOT NULL DEFAULT 'Casa',
        sale_price DECIMAL(10,2),
        rental_price DECIMAL(10,2),
        rental_period VARCHAR(50),
        images TEXT[]
      );
    `);

    // Atualiza registros existentes que têm transaction_type NULL
    await pool.query(`
      UPDATE properties 
      SET transaction_type = 'Vender', 
          property_type = 'Casa' 
      WHERE transaction_type IS NULL 
      OR property_type IS NULL;
    `);

    console.log('Banco de dados inicializado com sucesso');
  } catch (err) {
    console.error('Erro ao inicializar banco de dados:', err);
    throw err;
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
    
    // Para cada imóvel, insere ou atualiza com valores padrão se necessário
    for (const property of data.imoveis) {
      await client.query(`
        INSERT INTO properties (
          id, nome, descricao, contato, coords, owner_id, owner_username,
          transaction_type, property_type, sale_price, rental_price, rental_period, images
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          descricao = EXCLUDED.descricao,
          contato = EXCLUDED.contato,
          coords = EXCLUDED.coords,
          owner_id = EXCLUDED.owner_id,
          owner_username = EXCLUDED.owner_username,
          transaction_type = COALESCE(EXCLUDED.transaction_type, 'Vender'),
          property_type = COALESCE(EXCLUDED.property_type, 'Casa'),
          sale_price = EXCLUDED.sale_price,
          rental_price = EXCLUDED.rental_price,
          rental_period = EXCLUDED.rental_period,
          images = EXCLUDED.images
      `, [
        property.id,
        property.nome,
        property.descricao,
        property.contato,
        property.coords,
        property.ownerId,
        property.ownerUsername,
        property.transactionType || 'Vender',
        property.propertyType || 'Casa',
        property.salePrice,
        property.rentalPrice,
        property.rentalPeriod,
        property.images
      ]);
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
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
