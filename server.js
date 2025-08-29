const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dataManager = require('./data-manager-pg'); // Alterado para versão PostgreSQL
const cloudinary = require('cloudinary').v2;

// Configuração simplificada do Cloudinary - ele automaticamente lê do CLOUDINARY_URL
cloudinary.config({ 
  secure: true // Força HTTPS
});

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Usar uma pasta uploads no diretório raiz do projeto
        const uploadPath = path.join(process.cwd(), 'uploads');
        // Garante que o diretório de uploads exista
        require('fs').mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Modificar o upload para usar memória ao invés do disco
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'))); // Servir imagens da pasta uploads do disco persistente

// Verifica se a SESSION_SECRET foi definida no .env
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'seu_segredo_super_secreto_aqui_com_pelo_menos_32_caracteres') {
    console.error('ERRO FATAL: A variável de ambiente SESSION_SECRET não está definida ou está usando o valor padrão.');
    console.error('Por favor, crie um arquivo .env, gere uma chave segura e adicione em SESSION_SECRET.');
    process.exit(1);
}

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Configuração da Sessão
app.set('trust proxy', 1); // Adicione esta linha antes da configuração da sessão
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true, // Adicione esta linha
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'none', // Adicione esta linha
    maxAge: 24 * 60 * 60 * 1000 // 1 dia
  }
}));

// --- Middlewares de Autenticação ---
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Não autorizado. Faça login para continuar.' });
const isOwner = (req, res, next) => (req.session.user && req.session.user.role === 'owner') ? next() : res.status(403).json({ message: 'Acesso negado. Apenas proprietários.' });

const isPropertyOwner = async (req, res, next) => {
    try {
        const { id } = req.params; // id do imóvel
        const propertiesData = await dataManager.readImoveis();
        const properties = propertiesData.imoveis || []; // Assume que 'db.json' tem uma chave 'imoveis'
        const property = properties.find(p => p.id === id);

        if (!property) {
            return res.status(404).json({ message: 'Imóvel não encontrado.' });
        }

        if (property.ownerId !== req.session.user.id) {
            return res.status(403).json({ message: 'Você não tem permissão para realizar esta ação.' });
        }
        req.property = property; // Passa o imóvel para o próximo handler
        next();
    } catch (error) {
        console.error("Erro em isPropertyOwner:", error);
        res.status(500).json({ message: 'Erro ao verificar permissões do imóvel.' });
    }
};

// --- Rotas de Autenticação ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        const users = await dataManager.readUsers();
        if (users.find(u => u.username === username)) {
            return res.status(409).json({ message: 'Usuário já existe.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ id: uuidv4(), username, password: hashedPassword, role });
        await dataManager.writeUsers(users);
        res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    } catch (error) {
        console.error("Erro no registro de usuário:", error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao registrar o usuário.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await dataManager.readUsers();
        const user = users.find(u => u.username === username);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }

        const userSessionData = { id: user.id, username: user.username, role: user.role };
        req.session.user = userSessionData;
        res.json({ message: 'Login bem-sucedido!', user: userSessionData });
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ message: 'Ocorreu um erro interno durante o login.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Erro ao fazer logout:", err);
            return res.status(500).json({ message: 'Não foi possível fazer logout.' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logout bem-sucedido.' });
    });
});

app.get('/api/auth/session', (req, res) => {
    if (req.session.user) {
        return res.json({ user: req.session.user });
    }
    res.status(404).json({ message: 'Nenhuma sessão ativa.' });
});

// --- Rotas dos Imóveis ---
app.get('/api/imoveis', async (req, res) => {
    try {
        const propertiesData = await dataManager.readImoveis();
        res.json(propertiesData.imoveis || []);
    } catch (error) {
        console.error("Erro ao carregar imóveis:", error);
        res.status(500).json({ message: 'Erro ao carregar imóveis.' });
    }
});

app.post('/api/imoveis', isAuthenticated, isOwner, upload.array('imagens', 5), async (req, res) => {
    try {
        const { nome, contato, coords, transactionType, propertyType, salePrice, rentalPrice, rentalPeriod, descricao } = req.body;
        
        // Upload das imagens para o Cloudinary
        const uploadPromises = req.files ? req.files.map(file => {
            return new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'alugabv' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result.secure_url);
                    }
                );
                uploadStream.end(file.buffer);
            });
        }) : [];

        const imageUrls = await Promise.all(uploadPromises);

        const newProperty = {
            id: uuidv4(),
            nome,
            descricao,
            contato,
            transactionType,
            propertyType,
            salePrice: salePrice ? parseFloat(salePrice) : null,
            rentalPrice: rentalPrice ? parseFloat(rentalPrice) : null,
            rentalPeriod: rentalPeriod || null,
            coords: JSON.parse(coords),
            ownerId: req.session.user.id,
            ownerUsername: req.session.user.username,
            images: imageUrls
        };

        const propertiesData = await dataManager.readImoveis();
        const properties = propertiesData.imoveis || [];
        properties.push(newProperty);
        await dataManager.writeImoveis({ imoveis: properties });

        res.status(201).json({ message: 'Imóvel adicionado com sucesso!', property: newProperty });
    } catch (error) {
        console.error('Erro ao salvar imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao salvar o imóvel.' });
    }
});

app.put('/api/imoveis/:id', isAuthenticated, isPropertyOwner, upload.array('imagens', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const propertiesData = await dataManager.readImoveis();
        const properties = propertiesData.imoveis || [];
        const propertyIndex = properties.findIndex(p => p.id === id);

        if (propertyIndex === -1) {
            return res.status(404).json({ message: 'Imóvel não encontrado.' });
        }

        const propertyToUpdate = properties[propertyIndex];

        if (req.body.nome !== undefined) propertyToUpdate.nome = req.body.nome;
        if (req.body.descricao !== undefined) propertyToUpdate.descricao = req.body.descricao;
        if (req.body.contato !== undefined) propertyToUpdate.contato = req.body.contato;
        if (req.body.transactionType !== undefined) propertyToUpdate.transactionType = req.body.transactionType;
        if (req.body.propertyType !== undefined) propertyToUpdate.propertyType = req.body.propertyType;
        if (req.body.coords) propertyToUpdate.coords = JSON.parse(req.body.coords);
        if (req.body.salePrice !== undefined) propertyToUpdate.salePrice = req.body.salePrice ? parseFloat(req.body.salePrice) : null;
        if (req.body.rentalPrice !== undefined) propertyToUpdate.rentalPrice = req.body.rentalPrice ? parseFloat(req.body.rentalPrice) : null;
        if (req.body.rentalPeriod !== undefined) propertyToUpdate.rentalPeriod = req.body.rentalPeriod || null;

        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => path.relative(dataManager.dataDir, file.path).replace(/\\/g, "/"));
            propertyToUpdate.images = [...(propertyToUpdate.images || []), ...newImages];
        }

        properties[propertyIndex] = propertyToUpdate;
        await dataManager.writeImoveis({ imoveis: properties });

        res.json({ message: 'Imóvel atualizado com sucesso!', property: propertyToUpdate });
    } catch (error) {
        console.error('Erro ao atualizar imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao atualizar o imóvel.' });
    }
});

app.delete('/api/imoveis/:id/images', isAuthenticated, isPropertyOwner, async (req, res) => {
    try {
        const { id } = req.params;
        const { imagePath } = req.body;

        if (!imagePath) {
            return res.status(400).json({ message: 'Caminho da imagem é obrigatório.' });
        }

        const propertiesData = await dataManager.readImoveis();
        const properties = propertiesData.imoveis || [];
        const propertyIndex = properties.findIndex(p => p.id === id);

        if (propertyIndex === -1) {
            return res.status(404).json({ message: 'Imóvel não encontrado.' });
        }

        const propertyToUpdate = properties[propertyIndex];
        propertyToUpdate.images = propertyToUpdate.images.filter(img => img !== imagePath);

        require('fs').unlink(path.join(dataManager.dataDir, imagePath), (err) => {
            if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
        });

        properties[propertyIndex] = propertyToUpdate;
        await dataManager.writeImoveis({ imoveis: properties });

        res.json({ message: 'Imagem removida com sucesso!', property: propertyToUpdate });
    } catch (error) {
        console.error('Erro ao remover imagem do imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao remover a imagem.' });
    }
});

app.delete('/api/imoveis/:id', isAuthenticated, isPropertyOwner, async (req, res) => {
    try {
        const { id } = req.params;
        const propertiesData = await dataManager.readImoveis();
        const properties = propertiesData.imoveis || [];
        const propertyIndex = properties.findIndex(p => p.id === id);

        if (propertyIndex === -1) {
            return res.status(404).json({ message: 'Imóvel não encontrado para exclusão.' });
        }

        if (req.property.images && req.property.images.length > 0) {
            req.property.images.forEach(imagePath => {
                require('fs').unlink(path.join(dataManager.dataDir, imagePath), (err) => {
                    if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
                });
            });
        }

        properties.splice(propertyIndex, 1);
        await dataManager.writeImoveis({ imoveis: properties });
        res.json({ message: 'Imóvel removido com sucesso.' });
    } catch (error) {
        console.error('Erro ao remover imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao remover o imóvel.' });
    }
});

// --- Rotas de Gerenciamento de Usuário ---

// Rota para excluir usuário
app.delete('/api/users/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        // Validação de segurança: o usuário só pode excluir a própria conta
        if (req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para excluir esta conta.' });
        }

        const users = await dataManager.readUsers();
        const userIndex = users.findIndex(user => user.id === id);
        if (userIndex === -1) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Se o usuário for um proprietário, encontre e remova seus imóveis e imagens
        if (users[userIndex].role === 'owner') {
            const propertiesData = await dataManager.readImoveis();
            const propertiesToKeep = [];
            const propertiesToRemove = propertiesData.imoveis.filter(p => {
                if (p.ownerId === id) {
                    return true;
                }
                propertiesToKeep.push(p);
                return false;
            });

            // Deleta as imagens dos imóveis removidos
            propertiesToRemove.forEach(property => {
                if (property.images && property.images.length > 0) {
                    property.images.forEach(imagePath => {
                        require('fs').unlink(path.join(dataManager.dataDir, imagePath), (err) => {
                            if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
                        });
                    });
                }
            });

            // Salva a lista de imóveis atualizada
            await dataManager.writeImoveis({ imoveis: propertiesToKeep });
        }

        // Remove o usuário
        users.splice(userIndex, 1);
        await dataManager.writeUsers(users);

        // Destrói a sessão do usuário para fazer o logout
        req.session.destroy(err => {
            if (err) {
                console.error("Erro ao destruir sessão após exclusão de usuário:", err);
            }
            res.clearCookie('connect.sid');
            res.json({ message: 'Usuário excluído com sucesso.' });
        });
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({ message: 'Erro interno ao excluir usuário.' });
    }
});

// Rota para atualizar nome do usuário
app.put('/api/users/:id/name', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { newName } = req.body;

        // Validação de segurança: o usuário só pode alterar o próprio nome
        if (req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para alterar este nome.' });
        }

        if (!newName || newName.trim().length < 3) {
            return res.status(400).json({ message: 'O novo nome é obrigatório e deve ter pelo menos 3 caracteres.' });
        }

        const users = await dataManager.readUsers();
        const user = users.find(user => user.id === id);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        user.username = newName.trim();
        req.session.user.username = newName.trim(); // Atualiza o nome na sessão ativa

        // Atualiza o nome do proprietário em todos os seus imóveis para manter a consistência
        const propertiesData = await dataManager.readImoveis();
        propertiesData.imoveis.forEach(p => {
            if (p.ownerId === id) {
                p.ownerUsername = newName.trim();
            }
        });

        await dataManager.writeUsers(users);
        await dataManager.writeImoveis(propertiesData);

        res.json({ message: 'Nome atualizado com sucesso.', newName: user.username });
    } catch (error) {
        console.error('Erro ao atualizar nome do usuário:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar nome.' });
    }
});

// Rota para atualizar senha do usuário
app.put('/api/users/:id/password', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;

        if (req.session.user.id !== id) return res.status(403).json({ message: 'Você não tem permissão para alterar esta senha.' });
        if (!currentPassword || !newPassword) return res.status(400).json({ message: 'A senha atual e a nova senha são obrigatórias.' });

        const users = await dataManager.readUsers();
        const user = users.find(user => user.id === id);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Senha atual incorreta.' });

        user.password = await bcrypt.hash(newPassword, 10);
        await dataManager.writeUsers(users);

        res.json({ message: 'Senha atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar senha do usuário:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar senha.' });
    }
});

// Servir arquivos estáticos (HTML, CSS, JS do cliente) - DEVE VIR DEPOIS DAS ROTAS DA API
// ATENÇÃO: Servir o diretório raiz é um risco de segurança, pois expõe arquivos como server.js.
// A melhor prática é mover index.html, script.js e style.css para uma pasta 'public' e usar app.use(express.static('public'))
app.use(express.static(path.join(__dirname)));

// --- Função para iniciar o servidor de forma segura ---
async function createSessionTable() {
  try {
    // Primeiro cria a extensão pgcrypto se não existir
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    
    // Depois cria a tabela session
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log('Tabela de sessão verificada/criada com sucesso');
  } catch (err) {
    console.error('Erro ao criar tabela de sessão:', err);
    throw err;
  }
}

// Adicionar antes da função startServer
async function ensureUploadsDirectory() {
    const uploadPath = path.join(process.cwd(), 'uploads');
    try {
        await fs.promises.mkdir(uploadPath, { recursive: true });
        console.log('Diretório de uploads verificado/criado com sucesso');
    } catch (err) {
        console.error('Erro ao criar diretório de uploads:', err);
        throw err;
    }
}

// Modificar a função startServer
async function startServer() {
    try {
        // Garante que o diretório de uploads exista
        await ensureUploadsDirectory();
        
        // Cria a tabela de sessão
        await createSessionTable();
        
        // Inicializa o banco de dados
        await dataManager.initDB();
        console.log('Banco de dados inicializado com sucesso.');

        // Inicia o servidor com tratamento de erro
        const server = app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`Porta ${PORT} já está em uso. Tentando outra porta...`);
                server.close();
                // Tenta uma porta diferente
                const newPort = parseInt(PORT) + 1;
                app.listen(newPort, () => {
                    console.log(`Servidor rodando na nova porta ${newPort}`);
                });
            } else {
                console.error('Erro ao iniciar servidor:', error);
                process.exit(1);
            }
        });

    } catch (err) {
        console.error('FALHA CRÍTICA AO INICIAR SERVIDOR:', err);
        process.exit(1);
    }
}

// Inicia a aplicação
startServer();
startServer();
