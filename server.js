const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const dataManager = require('./data-manager-pg'); // Usa o gerenciador do PostgreSQL
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Confia no proxy reverso (necessário para o Render e outras plataformas de hospedagem)
// Isso garante que o cookie seguro (secure: true) funcione corretamente em produção (HTTPS)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
    // ATENÇÃO: O disco do Render é efêmero. Uploads locais serão perdidos em reinicializações.
    // O ideal seria fazer upload direto para um serviço como Cloudinary ou AWS S3.
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded

// --- Servir Arquivos Estáticos ---
// A melhor prática é servir arquivos de uma pasta 'public' dedicada.
// Isso evita a exposição acidental de arquivos do servidor como server.js.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Verifica se a SESSION_SECRET foi definida no .env
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'seu_segredo_super_secreto_aqui_com_pelo_menos_32_caracteres') {
    console.error('ERRO FATAL: A variável de ambiente SESSION_SECRET não está definida ou está usando o valor padrão.');
    console.error('Por favor, crie um arquivo .env, gere uma chave segura e adicione em SESSION_SECRET.');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error('ERRO FATAL: A variável de ambiente DATABASE_URL não está definida.');
    process.exit(1);
}

// Configuração do Pool do PostgreSQL para o connect-pg-simple
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Configuração da Sessão
app.use(session({
    store: new pgSession({
        pool: pgPool,
        tableName: 'user_sessions' // Nome da tabela para guardar as sessões
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        // Em produção (Render), a conexão é HTTPS. 'secure: true' é obrigatório.
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, 
        maxAge: 24 * 60 * 60 * 1000, // 1 dia
        // 'lax' é o padrão, mas 'none' pode ser necessário em alguns cenários de proxy.
        // 'none' exige que 'secure' seja true, o que já acontece em produção.
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    proxy: true // Força o express-session a confiar no cabeçalho X-Forwarded-Proto.
}));

// --- Middlewares de Autenticação ---
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Não autorizado. Faça login para continuar.' });
const isOwner = (req, res, next) => (req.session.user && req.session.user.role === 'owner') ? next() : res.status(403).json({ message: 'Acesso negado. Apenas proprietários.' });

const isPropertyOwner = async (req, res, next) => {
    try {
        const { id } = req.params; // id do imóvel
        // Busca o imóvel diretamente no banco de dados para melhor performance
        const property = await dataManager.findPropertyById(id);

        if (!property) {
            return res.status(404).json({ message: 'Imóvel não encontrado.' });
        }

        if (property.ownerId !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ message: 'Você não tem permissão para alterar este imóvel.' });
        }
        req.property = property; // Passa o imóvel para o próximo handler
        next();
    } catch (error) {
        console.error("Erro em isPropertyOwner:", error);
        res.status(500).json({ message: 'Erro ao verificar permissões do imóvel.' });
    }
};

// --- Middleware de Depuração ---
// Este middleware nos ajudará a ver o que está acontecendo com a sessão em cada requisição.
const debugSession = (req, res, next) => {
  const cookies = req.headers.cookie || 'Nenhum cookie enviado';
  console.log(`[DEBUG] Rota: ${req.method} ${req.originalUrl}`);
  console.log(`[DEBUG] Cookies recebidos: ${cookies}`);
  
  // Usamos uma cópia para evitar problemas com referências circulares no log
  const sessionCopy = req.session ? JSON.parse(JSON.stringify(req.session)) : null;
  console.log('[DEBUG] req.session ANTES da rota:', sessionCopy);

  res.on('finish', () => {
    console.log('----------------------------------------------------');
  });

  next();
};

// --- Rotas de Autenticação ---
app.use('/api', debugSession); // Aplicar o middleware de debug em todas as rotas /api/*

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        const existingUser = await dataManager.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ message: 'Usuário já existe.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: uuidv4(), username, password: hashedPassword, role };
        
        const createdUser = await dataManager.createUser(newUser);
        if (!createdUser) {
            return res.status(409).json({ message: 'Usuário já existe (conflito no banco de dados).' });
        }
        res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    } catch (error) {
        console.error("Erro no registro de usuário:", error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao registrar o usuário.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await dataManager.findUserByUsername(username);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }

        const userSessionData = { id: user.id, username: user.username, role: user.role };
        req.session.user = userSessionData;

        // Salva a sessão explicitamente para garantir que o cookie seja enviado antes da resposta.
        // Isso adiciona uma camada de robustez em ambientes de produção.
        req.session.save(err => {
            if (err) {
                console.error("Erro ao salvar a sessão durante o login:", err);
                return res.status(500).json({ message: 'Ocorreu um erro interno durante o login.' });
            }
            console.log(`[DEBUG] Sessão para o usuário ${user.username} salva com sucesso. SID: ${req.sessionID}`);
            res.json({ message: 'Login bem-sucedido!', user: userSessionData });
        });
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
        const properties = await dataManager.readImoveis();
        res.json(properties || []); // Agora 'properties' é um array diretamente
    } catch (error) {
        console.error("Erro ao carregar imóveis:", error);
        res.status(500).json({ message: 'Erro ao carregar imóveis.' });
    }
});

app.post('/api/imoveis', isAuthenticated, isOwner, upload.array('imagens', 5), async (req, res) => {
    try {
        const { nome, contato, coords, transactionType, propertyType, salePrice, rentalPrice, rentalPeriod, descricao, description } = req.body;
        const propertyDescricao = descricao !== undefined ? descricao : description;
        if (!nome || !contato || !coords || !transactionType || !propertyType || !propertyDescricao) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        const newProperty = {
            id: uuidv4(),
            nome,
            descricao: propertyDescricao,
            contato,
            transactionType,
            propertyType,
            salePrice: salePrice ? parseFloat(salePrice) : null,
            rentalPrice: rentalPrice ? parseFloat(rentalPrice) : null,
            rentalPeriod: rentalPeriod || null,
            coords: JSON.parse(coords),
            ownerId: req.session.user.id,
            ownerUsername: req.session.user.username,
            images: req.files ? req.files.map(file => path.join('uploads', file.filename).replace(/\\/g, "/")) : []
        };

        await dataManager.addProperty(newProperty);

        res.status(201).json({ message: 'Imóvel adicionado com sucesso!', property: newProperty });
    } catch (error) {
        console.error('Erro ao salvar imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao salvar o imóvel.' });
    }
});

app.put('/api/imoveis/:id', isAuthenticated, isPropertyOwner, upload.array('imagens', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const existingProperty = req.property; // Obtido do middleware isPropertyOwner

        // Construir o objeto com os dados atualizados
        const updatedData = {
            nome: req.body.nome || existingProperty.nome,
            descricao: req.body.descricao || existingProperty.descricao,
            contato: req.body.contato || existingProperty.contato,
            transactionType: req.body.transactionType || existingProperty.transactionType,
            propertyType: req.body.propertyType || existingProperty.propertyType,
            coords: req.body.coords ? JSON.parse(req.body.coords) : existingProperty.coords,
            salePrice: req.body.salePrice ? parseFloat(req.body.salePrice) : existingProperty.salePrice,
            rentalPrice: req.body.rentalPrice ? parseFloat(req.body.rentalPrice) : existingProperty.rentalPrice,
            rentalPeriod: req.body.rentalPeriod || existingProperty.rentalPeriod,
            images: existingProperty.images || [],
            ownerId: req.session.user.id // Passa o ownerId para a verificação de segurança na função
        };

        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => path.join('uploads', file.filename).replace(/\\/g, "/"));
            updatedData.images = [...updatedData.images, ...newImages];
        }

        const updatedProperty = await dataManager.updateProperty(id, updatedData);

        res.json({ message: 'Imóvel atualizado com sucesso!', property: updatedProperty });
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

        const propertyToUpdate = { ...req.property }; // Copia o imóvel do middleware
        propertyToUpdate.images = (propertyToUpdate.images || []).filter(img => img !== imagePath);
        propertyToUpdate.ownerId = req.session.user.id; // Adiciona para a função de update

        // Deleta o arquivo físico
        fs.unlink(path.join(__dirname, imagePath), (err) => {
            if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
        });

        // Atualiza o registro no banco de dados
        const updatedProperty = await dataManager.updateProperty(id, propertyToUpdate);

        res.json({ message: 'Imagem removida com sucesso!', property: updatedProperty });
    } catch (error) {
        console.error('Erro ao remover imagem do imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao remover a imagem.' });
    }
});

app.delete('/api/imoveis/:id', isAuthenticated, isPropertyOwner, async (req, res) => {
    try {
        const { id } = req.params;
        const propertyToDelete = req.property; // Obtido do middleware

        // Deleta as imagens associadas do sistema de arquivos
        if (propertyToDelete.images && propertyToDelete.images.length > 0) {
            propertyToDelete.images.forEach(imagePath => {
                fs.unlink(path.join(__dirname, imagePath), (err) => {
                    if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
                });
            });
        }

        const deletedCount = await dataManager.deleteProperty(id, req.session.user.id);
        
        if (deletedCount > 0) {
            res.json({ message: 'Imóvel removido com sucesso.' });
        } else {
            res.status(404).json({ message: 'Imóvel não encontrado ou você não tem permissão para remover.' });
        }
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

        if (req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para excluir esta conta.' });
        }

        const userToDelete = await dataManager.findUserById(id);
        if (!userToDelete) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Se o usuário for um proprietário, encontre e remova seus imóveis e imagens
        if (userToDelete.role === 'owner') {
            const properties = await dataManager.findPropertiesByOwner(id);

            // Deleta as imagens dos imóveis removidos
            properties.forEach(property => {
                if (property.images && property.images.length > 0) {
                    property.images.forEach(imagePath => {
                        fs.unlink(path.join(__dirname, imagePath), (err) => {
                            if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
                        });
                    });
                }
            });
            
            // Deleta os imóveis do banco de dados
            await dataManager.deletePropertiesByOwner(id);
        }

        // Remove o usuário do banco de dados
        const deletedCount = await dataManager.deleteUser(id);
        if (deletedCount === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado para exclusão.' });
        }

        // Destrói a sessão do usuário para fazer o logout
        req.session.destroy(err => {
            if (err) {
                console.error("Erro ao destruir sessão após exclusão de usuário:", err);
                // Mesmo com erro, a resposta de sucesso é enviada pois o usuário foi excluído.
            }
            res.clearCookie('connect.sid');
            res.json({ message: 'Sua conta e todos os seus dados foram excluídos com sucesso.' });
        });
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({ message: 'Erro interno ao excluir usuário.' });
    }
});

app.put('/api/users/:id/name', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { newName } = req.body;

        if (req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para alterar este nome.' });
        }

        if (!newName || newName.trim().length < 3) {
            return res.status(400).json({ message: 'O novo nome é obrigatório e deve ter pelo menos 3 caracteres.' });
        }

        const trimmedNewName = newName.trim();

        // Atualiza o nome do usuário no banco
        const updatedUser = await dataManager.updateUsername(id, trimmedNewName);
        if (!updatedUser) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Atualiza o nome do proprietário em todos os seus imóveis para manter a consistência
        if (req.session.user.role === 'owner') {
            await dataManager.updatePropertiesUsername(id, trimmedNewName);
        }

        // Atualiza o nome na sessão ativa
        req.session.user.username = trimmedNewName;

        res.json({ message: 'Nome atualizado com sucesso.', newName: trimmedNewName });
    } catch (error) {
        // Verifica se o erro é de violação de chave única (username já existe)
        if (error.code === '23505') { // Código de erro do PostgreSQL para unique_violation
            return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
        }
        console.error('Erro ao atualizar nome do usuário:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar nome.' });
    }
});

app.put('/api/users/:id/password', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;

        if (req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para alterar esta senha.' });
        }
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'A senha atual e a nova senha são obrigatórias.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }

        const user = await dataManager.findUserById(id);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'A senha atual está incorreta.' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await dataManager.updateUserPassword(id, hashedNewPassword);

        res.json({ message: 'Senha atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar senha do usuário:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar senha.' });
    }
});


// --- Função para iniciar o servidor de forma segura ---
async function startServer() {
    try {
        // 1. Garante que as tabelas do banco de dados existam.
        await dataManager.initDB();
        console.log('Banco de dados inicializado com sucesso.');

        // 2. Inicia o servidor.
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });

    } catch (err) {
        console.error('FALHA CRÍTICA AO INICIAR SERVIDOR:', err);
        process.exit(1); // Encerra o processo se a inicialização falhar.
    }
}

// Inicia a aplicação
startServer();
