const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const dataManager = require('./data-manager-pg');
const pgSession = require('connect-pg-simple')(session);
const { isProfane } = require('./profanity-filter'); // Importa o filtro de palavras
const pgPool = require('./db'); // Importa o pool de conexão compartilhado
require('dotenv').config();

// Log de ambiente - crucial para depuração
console.log(`[INFO] NODE_ENV está definido como: ${process.env.NODE_ENV}`);

const app = express();

// Confiança no Proxy - ESSENCIAL para o Render
// Isso informa ao Express que ele está atrás de um proxy e deve confiar
// nos cabeçalhos X-Forwarded-*, como X-Forwarded-Proto (https).
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
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
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Verificações de inicialização
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('seu_segredo')) {
    console.error('ERRO FATAL: SESSION_SECRET não está definida corretamente no ambiente.');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error('ERRO FATAL: DATABASE_URL não está definida no ambiente.');
    process.exit(1);
}

// Configuração da Sessão - Versão Definitiva para Produção
app.use(session({
    store: new pgSession({
        pool: pgPool,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        // secure: true é OBRIGATÓRIO para 'sameSite: "none"' e para produção HTTPS.
        // O 'trust proxy' garante que o Express saiba que a conexão é segura.
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 dia
        // 'lax' é o padrão moderno e seguro para a maioria das aplicações.
        // Ele protege contra ataques CSRF, ao mesmo tempo que permite que a sessão funcione corretamente em navegações normais.
        sameSite: 'lax'
    }
    // A opção 'proxy' é redundante quando 'app.set("trust proxy", 1)' é usado,
    // pois o express-session usará a configuração do Express por padrão.
}));


// --- Middlewares de Autenticação ---
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Não autorizado. Faça login para continuar.' });
const isOwner = (req, res, next) => (req.session.user && req.session.user.role === 'owner') ? next() : res.status(403).json({ message: 'Acesso negado. Apenas proprietários.' });

const isPropertyOwner = async (req, res, next) => {
    try {
        const { id } = req.params; // id do imóvel
        const property = await dataManager.findPropertyById(id);

        if (!property) {
            return res.status(404).json({ message: 'Imóvel não encontrado.' });
        }

        // Adicionado: Verifica se o usuário logado é o moderador global definido no .env
        const isGlobalModerator = process.env.MODERATOR_USERNAME &&
                                  req.session.user && // Garante que a comparação seja case-insensitive
                                  req.session.user.username.toLowerCase() === process.env.MODERATOR_USERNAME.toLowerCase();

        // Permite a ação se o usuário for o dono do imóvel OU o moderador global
        if (property.ownerId !== req.session.user.id && !isGlobalModerator) {
            return res.status(403).json({ message: 'Você não tem permissão para alterar este imóvel.' });
        }
        req.property = property;
        next();
    } catch (error) {
        console.error("Erro em isPropertyOwner:", error);
        res.status(500).json({ message: 'Erro ao verificar permissões do imóvel.' });
    }
};

// --- Middleware de Depuração ---
const debugSession = (req, res, next) => {
  const cookies = req.headers.cookie || 'Nenhum cookie enviado';
  console.log(`[DEBUG] Rota: ${req.method} ${req.originalUrl}`);
  console.log(`[DEBUG] Cookies recebidos: ${cookies}`);
  
  const sessionCopy = req.session ? JSON.parse(JSON.stringify(req.session)) : null;
  console.log('[DEBUG] req.session ANTES da rota:', sessionCopy);

  res.on('finish', () => {
    console.log('----------------------------------------------------');
  });

  next();
};

// --- Rotas de Autenticação ---
app.use('/api', debugSession);

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        // Adiciona verificação de palavras proibidas no nome de usuário
        if (isProfane(username)) {
            return res.status(400).json({ message: 'O nome de usuário contém palavras não permitidas.' });
        }

        const existingUser = await dataManager.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ message: 'Este nome de usuário já está em uso. Tente adicionar um sobrenome ou um apelido para diferenciá-lo.' });
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

// --- Rotas dos Imóveis (sem alterações) ---
// ... (seu código de rotas de imóveis continua aqui) ...
app.get('/api/imoveis', async (req, res) => {
    try {
        const properties = await dataManager.readImoveis();
        res.json(properties || []);
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

        // Adiciona verificação de palavras proibidas
        if (isProfane(nome) || isProfane(propertyDescricao)) {
            return res.status(400).json({ message: 'O nome ou a descrição do imóvel contém palavras não permitidas.' });
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
        const existingProperty = req.property;
        const newDescription = req.body.descricao !== undefined ? req.body.descricao : req.body.description;

        // Adiciona verificação de palavras proibidas nos campos que podem ser atualizados
        if (req.body.nome && isProfane(req.body.nome)) {
            return res.status(400).json({ message: 'O nome do imóvel contém palavras não permitidas.' });
        }
        if (newDescription && isProfane(newDescription)) {
            return res.status(400).json({ message: 'A descrição do imóvel contém palavras não permitidas.' });
        }

        const updatedData = {
            nome: req.body.nome || existingProperty.nome,
            descricao: newDescription || existingProperty.descricao,
            contato: req.body.contato || existingProperty.contato,
            transactionType: req.body.transactionType || existingProperty.transactionType,
            propertyType: req.body.propertyType || existingProperty.propertyType,
            coords: req.body.coords ? JSON.parse(req.body.coords) : existingProperty.coords,
            salePrice: req.body.salePrice ? parseFloat(req.body.salePrice) : existingProperty.salePrice,
            rentalPrice: req.body.rentalPrice ? parseFloat(req.body.rentalPrice) : existingProperty.rentalPrice,
            rentalPeriod: req.body.rentalPeriod || existingProperty.rentalPeriod,
            images: existingProperty.images || [],
            ownerId: req.session.user.id
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

        const propertyToUpdate = { ...req.property };
        propertyToUpdate.images = (propertyToUpdate.images || []).filter(img => img !== imagePath);
        propertyToUpdate.ownerId = req.session.user.id;

        fs.unlink(path.join(__dirname, imagePath), (err) => {
            if (err) console.error(`Erro ao deletar arquivo de imagem ${imagePath}:`, err);
        });

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
        const propertyToDelete = req.property;

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


// --- Rotas de Gerenciamento de Usuário (sem alterações) ---
// ... (seu código de rotas de usuário continua aqui) ...
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

        // Adicionado: Proteção para não deletar o moderador
        const moderatorUsername = process.env.MODERATOR_USERNAME;
        if (moderatorUsername && userToDelete.username.toLowerCase() === moderatorUsername.toLowerCase()) {
            return res.status(403).json({ message: 'A conta do moderador não pode ser excluída.' });
        }

        // Deleta o usuário e busca a lista de suas imagens para remoção do Cloudinary
        const { deletedUserCount, imagesToDelete } = await dataManager.deleteUserAndContent(id);

        if (deletedUserCount === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado para exclusão.' });
        }

        // Remove as imagens associadas do Cloudinary
        if (imagesToDelete && imagesToDelete.length > 0) {
            const publicIds = imagesToDelete.map(url => {
                const match = url.match(/\/v\d+\/(imoveis_site\/[^\.]+)/);
                return match ? match[1] : null;
            }).filter(id => id);
            if (publicIds.length > 0) {
                await cloudinary.api.delete_resources(publicIds);
            }
        }

        req.session.destroy(err => {
            if (err) {
                console.error("Erro ao destruir sessão após exclusão de usuário:", err);
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

        // Adiciona verificação de palavras proibidas
        if (isProfane(newName)) {
            return res.status(400).json({ message: 'O novo nome contém palavras não permitidas.' });
        }

        const trimmedNewName = newName.trim();

        const updatedUser = await dataManager.updateUsername(id, trimmedNewName);
        if (!updatedUser) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        if (req.session.user.role === 'owner') {
            await dataManager.updatePropertiesUsername(id, trimmedNewName);
        }

        req.session.user.username = trimmedNewName;

        res.json({ message: 'Nome atualizado com sucesso.', newName: trimmedNewName });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Este nome de usuário já está em uso. Tente adicionar um sobrenome ou um apelido.' });
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
        await dataManager.initDB();
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (err) {
        console.error('FALHA CRÍTICA AO INICIAR SERVIDOR:', err);
        process.exit(1);
    }
}

startServer();
