const pool = require('./db'); // Importa o pool de conexão compartilhado

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        role VARCHAR(50) NOT NULL
      );

      -- Cria um índice ÚNICO e case-insensitive na coluna username.
      -- Esta é a forma mais robusta de garantir que "user" e "User" sejam considerados o mesmo.
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

      CREATE TABLE IF NOT EXISTS properties (
        id VARCHAR(36) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        coords JSONB NOT NULL,
        owner_id VARCHAR(36) REFERENCES users(id),
        owner_username VARCHAR(100),
        transaction_type VARCHAR(50) NOT NULL DEFAULT 'Vender',
        property_type VARCHAR(50) NOT NULL DEFAULT 'Casa',
        sale_price DECIMAL(10,2),
        rental_price DECIMAL(10,2),
        rental_period VARCHAR(50),
        contact_method VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
        neighborhood VARCHAR(100),
        images TEXT[]
      );
    `);

    // --- Migração: Garante que a coluna 'neighborhood' exista ---
    // Este comando é seguro e só adiciona a coluna se ela não existir.
    // Isso corrige o erro em bancos de dados que foram criados antes da adição do campo.
    await pool.query(`
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100);
    `);

    // --- Migração: Remove a coluna 'contato' obsoleta da tabela de properties ---
    await pool.query(`
      ALTER TABLE properties DROP COLUMN IF EXISTS contato;
    `);

    // --- Migração: Garante que a coluna 'email' exista na tabela de usuários ---
    // E a coluna 'phone'
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      -- Altera a coluna email para permitir valores nulos, caso já exista como NOT NULL
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
      CREATE UNIQUE INDEX IF NOT EXISTS users_phone_idx ON users (phone);
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

    // --- Migração: Garante que a coluna 'contact_method' exista na tabela de properties ---
    await pool.query(`
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_method VARCHAR(20) NOT NULL DEFAULT 'whatsapp';
    `);
  } catch (err) {
    console.error('Erro ao inicializar banco de dados:', err);
    throw err;
  }
}

async function readImoveis() {
  try {
    const result = await pool.query(`
      SELECT p.*, u.email as owner_email, u.phone as owner_phone
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.id
      ORDER BY p.id;
    `);
    return result.rows.map(row => ({
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      coords: row.coords,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      salePrice: row.sale_price,
      rentalPrice: row.rental_price,
      rentalPeriod: row.rental_period,
      images: row.images || [],
      neighborhood: row.neighborhood,
      ownerEmail: row.owner_email,
      ownerPhone: row.owner_phone,
      contactMethod: row.contact_method
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
        id, nome, descricao, coords, 
        owner_id, owner_username, transaction_type,
        property_type, sale_price, rental_price,
        rental_period, images, neighborhood, contact_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `, [
      property.id,
      property.nome,
      property.descricao,
      property.coords,
      property.ownerId,
      property.ownerUsername,
      property.transactionType || 'Vender',
      property.propertyType || 'Casa',
      property.salePrice,
      property.rentalPrice,
      property.rentalPeriod,
      property.images || [],
      property.neighborhood,
      property.contactMethod
    ]);
    const row = result.rows[0];
    return {
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      coords: row.coords,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      salePrice: row.sale_price,
      rentalPrice: row.rental_price,
      rentalPeriod: row.rental_period,
      images: row.images || [],
      neighborhood: row.neighborhood
    };
  } catch (err) {
    console.error('Erro ao adicionar imóvel:', err);
    throw err;
  }
}

async function updateProperty(id, propertyData, isModerator = false) {
  try {
    let query = `
      UPDATE properties SET
        nome = $1,             -- 1
        descricao = $2,        -- 2
        coords = $3,           -- 3
        transaction_type = $4, -- 4
        property_type = $5,    -- 5
        sale_price = $6,       -- 6
        rental_price = $7,     -- 7
        rental_period = $8,    -- 8
        images = $9,           -- 9
        neighborhood = $10,    -- 10
        contact_method = $11   -- 11
      WHERE id = $12           -- 12
    `;
    let params = [
      propertyData.nome,
      propertyData.descricao,
      propertyData.coords,
      propertyData.transactionType,
      propertyData.propertyType,
      propertyData.salePrice,
      propertyData.rentalPrice,
      propertyData.rentalPeriod,
      propertyData.images,      
      propertyData.neighborhood,
      propertyData.contactMethod,
      id
    ];

    if (!isModerator) {
      query += ' AND owner_id = $13'; // O próximo parâmetro é 13
      params.push(propertyData.ownerId); // Adiciona o ownerId ao final
    }

    query += ' RETURNING *;';

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      console.warn(`Tentativa de atualização do imóvel ${id} falhou. Imóvel não encontrado ou permissão negada.`);
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      coords: row.coords,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      salePrice: row.sale_price,
      rentalPrice: row.rental_price,
      rentalPeriod: row.rental_period,
      images: row.images || [],
      neighborhood: row.neighborhood
    };
  } catch (err) {
    console.error(`Erro ao atualizar imóvel ${id}:`, err);
    throw err;
  }
}

async function deleteProperty(id, ownerId, isModerator = false) {
  try {
    let query = 'DELETE FROM properties WHERE id = $1 AND owner_id = $2';
    let params = [id, ownerId];

    if (isModerator) {
      query = 'DELETE FROM properties WHERE id = $1';
      params = [id];
    }

    // Garante que o usuário só delete seus próprios imóveis
    const result = await pool.query(query, params);
    return result.rowCount; // Retorna 1 se deletou, 0 se não encontrou ou não é o dono
  } catch (err) {
    console.error(`Erro ao deletar imóvel ${id}:`, err);
    throw err;
  }
}

async function findPropertyById(id) {
  try {
    const result = await pool.query(`
      SELECT p.*, u.email as owner_email, u.phone as owner_phone
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.id
      WHERE p.id = $1
    `, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      coords: row.coords,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      salePrice: row.sale_price,
      rentalPrice: row.rental_price,
      rentalPeriod: row.rental_period,
      images: row.images || [],
      neighborhood: row.neighborhood,
      ownerEmail: row.owner_email,
      ownerPhone: row.owner_phone,
      contactMethod: row.contact_method
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

async function findUserByIdentifier(identifier) {
  try {
    // Esta query busca um usuário onde o identificador pode corresponder
    // ao nome de usuário (case-insensitive), ao e-mail (case-insensitive) ou ao telefone.
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) OR phone = $1',
      [identifier]
    );
    return result.rows[0];
  } catch (err) {
    console.error(`Erro ao buscar usuário pelo identificador ${identifier}:`, err);
    throw err;
  }
}

async function findUserByPhone(phone) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return result.rows[0];
  } catch (err) {
    console.error(`Erro ao buscar usuário pelo telefone ${phone}:`, err);
    throw err;
  }
}

async function createUser(user) {
  try {
    const result = await pool.query(`
      INSERT INTO users (id, username, password, role, email, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (LOWER(username)) DO NOTHING
      RETURNING id, username, role, email, phone;
    `, [user.id, user.username, user.password, user.role, user.email, user.phone]);
    
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

async function updateUserEmail(id, newEmail) {
    try {
        const result = await pool.query('UPDATE users SET email = $1 WHERE id = $2 RETURNING email', [newEmail, id]);
        if (result.rowCount === 0) return null;
        return result.rows[0];
    } catch (err) {
        console.error(`Erro ao atualizar email do usuário ${id}:`, err);
        throw err;
    }
}

async function updateUserPhone(id, newPhone) {
    try {
        const result = await pool.query('UPDATE users SET phone = $1 WHERE id = $2 RETURNING phone', [newPhone, id]);
        if (result.rowCount === 0) return null;
        return result.rows[0];
    } catch (err) {
        console.error(`Erro ao atualizar telefone do usuário ${id}:`, err);
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

async function deleteUserAndContent(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Encontra todos os imóveis do usuário
    const propertiesResult = await client.query('SELECT images FROM properties WHERE owner_id = $1', [id]);
    const allImages = propertiesResult.rows.flatMap(p => p.images).filter(Boolean);

    // Deleta os imóveis do banco de dados (se ON DELETE CASCADE não estiver configurado)
    await client.query('DELETE FROM properties WHERE owner_id = $1', [id]);

    // Deleta o usuário
    const userDeleteResult = await client.query('DELETE FROM users WHERE id = $1', [id]);

    await client.query('COMMIT');
    return { deletedUserCount: userDeleteResult.rowCount, imagesToDelete: allImages };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  initDB,
  findUserByUsername,
  findUserByIdentifier,
  findUserByPhone,
  createUser,
  readImoveis,
  addProperty,
  updateProperty,
  deleteProperty,
  findPropertyById,
  findUserById,
  updateUsername,
  updateUserPassword,
  updateUserPhone,
  updateUserEmail,
  deleteUser,
  findPropertiesByOwner,
  deletePropertiesByOwner,
  updatePropertiesUsername,
  deleteUserAndContent,
};
