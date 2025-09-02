const pool = require('./db'); // Importa o pool de conexão compartilhado

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL
      );

      -- Cria um índice ÚNICO e case-insensitive na coluna username.
      -- Esta é a forma mais robusta de garantir que "user" e "User" sejam considerados o mesmo.
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

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

    // Adiciona a criação da tabela de sessões, usada pelo connect-pg-simple
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL PRIMARY KEY,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
    `);

    // Adiciona o índice para a tabela de sessões para otimizar a performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
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
    return result.rows.map(row => ({
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
    }));
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
  try {
    const result = await pool.query(`
      UPDATE properties SET
        nome = $1,
        descricao = $2,
        contato = $3,
        coords = $4,
        transaction_type = $5,
        property_type = $6,
        sale_price = $7,
        rental_price = $8,
        rental_period = $9,
        images = $10
      WHERE id = $11 AND owner_id = $12
      RETURNING *;
    `, [
      propertyData.nome,
      propertyData.descricao,
      propertyData.contato,
      propertyData.coords,
      propertyData.transactionType,
      propertyData.propertyType,
      propertyData.salePrice,
      propertyData.rentalPrice,
      propertyData.rentalPeriod,
      propertyData.images,
      id,
      propertyData.ownerId // Garante que o usuário só edite seus próprios imóveis
    ]);
    
    if (result.rowCount === 0) {
      console.warn(`Tentativa de atualização do imóvel ${id} falhou. Imóvel não encontrado ou permissão negada.`);
      return null;
    }

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
    console.error(`Erro ao atualizar imóvel ${id}:`, err);
    throw err;
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

async function findPropertyById(id) {
  try {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
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
    console.error(`Erro ao buscar imóvel por ID ${id}:`, err);
    throw err;
  }
}

async function findUserByUsername(username) {
  try {
    // A busca agora é case-insensitive para corresponder à regra do banco de dados.
    const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
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
      ON CONFLICT (LOWER(username)) DO NOTHING
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

async function findUserById(id) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  } catch (err) {
    console.error(`Erro ao buscar usuário por ID ${id}:`, err);
    throw err;
  }
}

async function updateUsername(id, newName) {
    try {
        const result = await pool.query('UPDATE users SET username = $1 WHERE id = $2 RETURNING username', [newName, id]);
        if (result.rowCount === 0) return null;
        return result.rows[0];
    } catch (err) {
        console.error(`Erro ao atualizar nome do usuário ${id}:`, err);
        throw err;
    }
}

async function updateUserPassword(id, newPasswordHash) {
    try {
        const result = await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPasswordHash, id]);
        return result.rowCount;
    } catch (err) {
        console.error(`Erro ao atualizar senha do usuário ${id}:`, err);
        throw err;
    }
}

async function deleteUser(id) {
    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
        return result.rowCount;
    } catch (err) {
        console.error(`Erro ao deletar usuário ${id}:`, err);
        throw err;
    }
}

async function findPropertiesByOwner(ownerId) {
  try {
    const result = await pool.query('SELECT id, images FROM properties WHERE owner_id = $1', [ownerId]);
    return result.rows;
  } catch (err) {
    console.error(`Erro ao buscar imóveis do proprietário ${ownerId}:`, err);
    throw err;
  }
}

async function deletePropertiesByOwner(ownerId) {
    try {
        // Primeiro, buscamos as propriedades para poder deletar as imagens associadas
        const propertiesToDelete = await findPropertiesByOwner(ownerId);
        
        // Depois, deletamos as propriedades do banco
        const result = await pool.query('DELETE FROM properties WHERE owner_id = $1', [ownerId]);
        
        // Retornamos as propriedades que foram encontradas para que o server.js possa deletar os arquivos
        return propertiesToDelete;
    } catch (err) {
        console.error(`Erro ao deletar imóveis do proprietário ${ownerId}:`, err);
        throw err;
    }
}

async function updatePropertiesUsername(ownerId, newUsername) {
    try {
        const result = await pool.query('UPDATE properties SET owner_username = $1 WHERE owner_id = $2', [newUsername, ownerId]);
        return result.rowCount;
    } catch (err) {
        console.error(`Erro ao atualizar nome do proprietário nos imóveis ${ownerId}:`, err);
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
  findPropertyById,
  findUserById,
  updateUsername,
  updateUserPassword,
  deleteUser,
  findPropertiesByOwner,
  deletePropertiesByOwner,
  updatePropertiesUsername,
};
