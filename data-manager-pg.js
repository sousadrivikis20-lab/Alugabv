const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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
    console.log('Banco de dados inicializado com sucesso');
  } catch (err) {
    console.error('Erro ao inicializar banco de dados:', err);
    throw err;
  }
}

async function readImoveis() {
  try {
    const result = await pool.query(`
      SELECT * FROM properties;
    `);
    return { imoveis: result.rows.map(row => ({
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      contato: row.contato,
      coords: row.coords,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      salePrice: row.sale_price,
      rentalPrice: row.rental_price,
      rentalPeriod: row.rental_period,
      images: row.images || []
    })) };
  } catch (err) {
    console.error('Erro ao ler imóveis:', err);
    throw err;
  }
}

async function addProperty(property) {
  try {
    const result = await pool.query(`
      INSERT INTO properties (
        id, nome, descricao, contato, coords, 
        owner_id, owner_username, transaction_type, 
        property_type, sale_price, rental_price, 
        rental_period, images
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
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
      property.images || []
    ]);
    const row = result.rows[0];
    return {
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      contato: row.contato,
      coords: row.coords,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      salePrice: row.sale_price,
      rentalPrice: row.rental_price,
      rentalPeriod: row.rental_period,
      images: row.images || []
    };
  } catch (err) {
    console.error('Erro ao adicionar imóvel:', err);
    throw err;
  }
}

async function updateProperty(id, propertyData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE properties 
      SET nome = $1,
          descricao = $2,
          contato = $3,
          coords = $4,
          owner_id = $5,
          owner_username = $6,
          transaction_type = $7,
          property_type = $8,
          sale_price = $9,
          rental_price = $10,
          rental_period = $11,
          images = $12
      WHERE id = $13
      RETURNING *;
    `, [
      propertyData.nome,
      propertyData.descricao,
      propertyData.contato,
      JSON.stringify(propertyData.coords),
      propertyData.ownerId,
      propertyData.ownerUsername,
      propertyData.transactionType,
      propertyData.propertyType,
      propertyData.salePrice,
      propertyData.rentalPrice,
      propertyData.rentalPeriod,
      propertyData.images,
      id
    ]);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar imóvel:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function deleteProperty(id, ownerId) {
  try {
    // Garante que o usuário só delete seus próprios imóveis
    const result = await pool.query('DELETE FROM properties WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    return result.rowCount; // Retorna 1 se deletou, 0 se não encontrou ou não é o dono
  } catch (err) {
    console.error(`Erro ao deletar imóvel ${id}:`, err);
    throw err;
  }
}

async function deleteImovel(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM properties WHERE id = $1', [id]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar imóvel:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function findUserByUsername(username) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0];
  } catch (err) {
    console.error(`Erro ao buscar usuário ${username}:`, err);
    throw err;
  }
}

async function createUser(user) {
  try {
    const result = await pool.query(`
      INSERT INTO users (id, username, password, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO NOTHING
      RETURNING id, username, role;
    `, [user.id, user.username, user.password, user.role]);
    
    if (result.rowCount === 0) { // Conflito de username, usuário já existe
        return null;
    }
    return result.rows[0];
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    throw err;
  }
}

module.exports = {
  initDB,
  findUserByUsername,
  createUser,
  readImoveis,
  addProperty,
  updateProperty,
  deleteProperty,
  deleteImovel
};
