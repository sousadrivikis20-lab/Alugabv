const { Pool } = require('pg');
const path = require('path');

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

async function writeImoveis(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Se temos apenas um imóvel para atualizar ou remover
    if (data.imoveis && data.imoveis.length === 1) {
      const property = data.imoveis[0];
      
      if (property.isDeleted) {
        // Remove o imóvel
        await client.query('DELETE FROM properties WHERE id = $1', [property.id]);
      } else {
        // Atualiza ou insere o imóvel
        await client.query(`
          INSERT INTO properties (
            id, nome, descricao, contato, coords, 
            owner_id, owner_username, transaction_type, 
            property_type, sale_price, rental_price, 
            rental_period, images
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            nome = EXCLUDED.nome,
            descricao = EXCLUDED.descricao,
            contato = EXCLUDED.contato,
            coords = EXCLUDED.coords,
            owner_id = EXCLUDED.owner_id,
            owner_username = EXCLUDED.owner_username,
            transaction_type = EXCLUDED.transaction_type,
            property_type = EXCLUDED.property_type,
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
          property.images || []
        ]);
      }
    } else if (data.imoveis) {
      // Se estamos atualizando vários imóveis, mantém o código existente
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
          property.transactionType || 'Vender',
          property.propertyType || 'Casa',
          property.salePrice,
          property.rentalPrice,
          property.rentalPeriod,
          property.images || []
        ]);
      }
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao escrever imóveis:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function readUsers() {
  try {
    const result = await pool.query(`
      SELECT id, username, password, role 
      FROM users;
    `);
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
    
    // Se estamos atualizando apenas um usuário
    if (users.length === 1) {
      const user = users[0];
      await client.query(`
        UPDATE users 
        SET username = $1, password = $2, role = $3
        WHERE id = $4;
        
        INSERT INTO users (id, username, password, role)
        SELECT $4, $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = $4);
      `, [user.username, user.password, user.role, user.id]);
    } else {
      // Se estamos reescrevendo todos os usuários
      await client.query('DELETE FROM users');
      
      for (const user of users) {
        await client.query(`
          INSERT INTO users (id, username, password, role)
          VALUES ($1, $2, $3, $4)
        `, [user.id, user.username, user.password, user.role]);
      }
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao escrever usuários:', err);
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
  dataDir: path.join(process.cwd(), 'data')
};

