const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const dataDir = path.join(process.cwd(), 'data');

async function createDatabaseIfNotExists() {
  const tempPool = new Pool({
    connectionString: process.env.DATABASE_URL?.replace('/alugabv', '/postgres') || 'postgresql://postgres:postgres@localhost:5432/postgres',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Verifica se o banco já existe
    const result = await tempPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'alugabv'"
    );

    // Se não existe, cria
    if (result.rows.length === 0) {
      await tempPool.query('CREATE DATABASE alugabv');
      console.log('Banco de dados alugabv criado com sucesso');
    }
  } catch (err) {
    console.error('Erro ao verificar/criar banco de dados:', err);
  } finally {
    await tempPool.end();
  }
}

async function initDB() {
  try {
    // Primeiro tenta criar o banco se não existir
    await createDatabaseIfNotExists();
    
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

    console.log('Banco de dados inicializado com sucesso');
  } catch (err) {
    console.error('Erro ao inicializar banco de dados:', err);
    throw err;
  }
}

async function readUsers() {
  try {
    const result = await pool.query('SELECT * FROM users');
    return result.rows;
  } catch (err) {
    console.error('Erro ao ler usuários:', err);
    throw err;
  }
}

async function writeUsers(users) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM users');
    
    for (const user of users) {
      await client.query(`
        INSERT INTO users (id, username, password, role)
        VALUES ($1, $2, $3, $4)
      `, [user.id, user.username, user.password, user.role]);
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function readImoveis() {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        nome,
        descricao,
        contato,
        coords,
        owner_id as "ownerId",
        owner_username as "ownerUsername",
        transaction_type as "transactionType",
        property_type as "propertyType",
        sale_price as "salePrice",
        rental_price as "rentalPrice",
        rental_period as "rentalPeriod",
        images
      FROM properties
    `);
    
    return { imoveis: result.rows };
  } catch (err) {
    console.error('Erro ao ler imóveis:', err);
    throw err;
  }
}

async function writeImoveis(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Limpa a tabela apenas se estivermos reescrevendo todos os imóveis
    if (Array.isArray(data.imoveis)) {
      await client.query('DELETE FROM properties');
      
      for (const property of data.imoveis) {
        await client.query(`
          INSERT INTO properties (
            id, nome, descricao, contato, coords, 
            owner_id, owner_username, transaction_type, 
            property_type, sale_price, rental_price, 
            rental_period, images
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          property.id,
          property.nome,
          property.descricao,
          property.contato,
          property.coords,
          property.ownerId,
          property.ownerUsername,
          property.transactionType,
          property.propertyType,
          property.salePrice,
          property.rentalPrice,
          property.rentalPeriod,
          property.images
        ]);
      }
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
  dataDir
};
