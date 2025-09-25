const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dataManager = require('./data-manager-pg');
const pgSession = require('connect-pg-simple')(session);
const { isProfane } = require('./profanity-filter'); // Importa o filtro de palavras
const pgPool = require('./db'); // Importa o pool de conexão compartilhado
const cloudinary = require('./cloudinary-config'); // Importa a configuração do Cloudinary
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
// As imagens serão armazenadas em memória para serem enviadas ao Cloudinary,
// em vez de serem salvas no disco do servidor.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

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

// --- Helper do Cloudinary ---
// Função para extrair o public_id de uma URL do Cloudinary
const extractPublicId = (url) => {
    if (!url) return null;
    // Extrai a parte da URL que constitui o public_id (ex: imoveis_site/nome_do_arquivo)
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    return match ? match[1] : null;
};

// --- Middlewares de Autenticação ---
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Não autorizado. Faça login para continuar.' });
const isOwner = (req, res, next) => (req.session.user && req.session.user.role === 'owner') ? next() : res.status(403).json({ message: 'Acesso negado. Apenas proprietários.' });

const isPropertyOwner = async (req, res, next) => {
    try {
        const { id } = req.params;
        const property = await dataManager.findPropertyById(id);

        if (!property) {
            return res.status(404).json({ message: 'Imóvel não encontrado.' });
        }

        const isOwner = property.ownerId === req.session.user.id;
        const isModerator = req.session.user.isModerator === true;

        // Permite a ação se o usuário for o dono OU um moderador
        if (!isOwner && !isModerator) {
            return res.status(403).json({ message: 'Você não tem permissão para editar este imóvel.' });
        }

        req.property = property; // Passa os dados do imóvel para a rota
        next();
    } catch (error) {
        console.error("Erro ao verificar propriedade:", error);
        res.status(500).json({ message: 'Erro interno ao verificar permissões.' });
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

// --- Middleware de Segurança: Rate Limiter ---
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // Janela de 15 minutos
	max: 20, // Limita cada IP a 20 requisições por janela (login/registro)
	message: { message: 'Muitas tentativas de autenticação a partir deste IP. Por favor, tente novamente após 15 minutos.' },
	standardHeaders: true, // Retorna informações do limite nos cabeçalhos `RateLimit-*`
	legacyHeaders: false, // Desabilita os cabeçalhos `X-RateLimit-*`
  // 'trust proxy' já está configurado no app, então o rate limiter usará o IP real do cliente.
});

// --- Rotas de Autenticação ---
app.use('/api', debugSession);

// Aplica o rate limiter apenas nas rotas de registro e login
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, password, role, email } = req.body;
        if (!username || !password || !role || !email) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        // Adiciona verificação de palavras proibidas no nome de usuário
        if (isProfane(username)) {
            return res.status(400).json({ message: 'O nome de usuário contém palavras não permitidas.' });
        }

        // Validação simples de e-mail
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: 'Formato de e-mail inválido.' });
        }

        const existingUser = await dataManager.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ message: 'Este nome de usuário já está em uso. Tente adicionar um sobrenome ou um apelido para diferenciá-lo.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: uuidv4(), username, password: hashedPassword, role };
        newUser.email = email;
        
        const createdUser = await dataManager.createUser(newUser);
        if (!createdUser) {
            return res.status(409).json({ message: 'Nome de usuário ou e-mail já está em uso.' });
        }
        res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    } catch (error) {
        console.error("Erro no registro de usuário:", error);
        if (error.code === '23505' && error.constraint === 'users_email_lower_idx') return res.status(409).json({ message: 'Este e-mail já está em uso.' });
        res.status(500).json({ message: 'Ocorreu um erro interno ao registrar o usuário.' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await dataManager.findUserByUsername(username);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }

        // Verifica se o usuário logado é o moderador global
        const moderatorUsername = (process.env.MODERATOR_USERNAME || '').toLowerCase();
        const isModerator = user.username.toLowerCase() === moderatorUsername;

        const userSessionData = {
            id: user.id,
            username: user.username,
            role: user.role,
            email: user.email,
            isModerator: isModerator // Adiciona a flag de moderador à sessão
        };

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
        const { nome, contato, coords, transactionType, propertyType, salePrice, rentalPrice, rentalPeriod, descricao, description, neighborhood } = req.body;
        const propertyDescricao = descricao !== undefined ? descricao : description;
        if (!nome || !contato || !coords || !transactionType || !propertyType || !propertyDescricao || !neighborhood) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        // Adiciona verificação de palavras proibidas
        if (isProfane(nome) || isProfane(propertyDescricao)) {
            return res.status(400).json({ message: 'O nome ou a descrição do imóvel contém palavras não permitidas.' });
        }

        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            try {
                const uploadPromises = req.files.map(file => {
                    const b64 = Buffer.from(file.buffer).toString("base64");
                    let dataURI = "data:" + file.mimetype + ";base64," + b64;
                    return cloudinary.uploader.upload(dataURI, {
                        folder: "imoveis_site",
                        resource_type: "auto"
                    });
                });
                const uploadResults = await Promise.all(uploadPromises);
                imageUrls = uploadResults.map(result => result.secure_url);
            } catch (uploadError) {
                console.error('Erro no upload para o Cloudinary:', uploadError);
                return res.status(500).json({ message: 'Falha ao fazer upload das imagens.' });
            }
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
            images: imageUrls,
            neighborhood: neighborhood
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
            salePrice: req.body.salePrice !== undefined ? parseFloat(req.body.salePrice) : existingProperty.salePrice,
            rentalPrice: req.body.rentalPrice !== undefined ? parseFloat(req.body.rentalPrice) : existingProperty.rentalPrice,
            rentalPeriod: req.body.rentalPeriod || existingProperty.rentalPeriod,
            images: existingProperty.images || [],
            ownerId: req.session.user.id,
            neighborhood: req.body.neighborhood || existingProperty.neighborhood
        };

        if (req.files && req.files.length > 0) {
            try {
                const uploadPromises = req.files.map(file => {
                    const b64 = Buffer.from(file.buffer).toString("base64");
                    let dataURI = "data:" + file.mimetype + ";base64," + b64;
                    return cloudinary.uploader.upload(dataURI, {
                        folder: "imoveis_site",
                        resource_type: "auto"
                    });
                });
                const uploadResults = await Promise.all(uploadPromises);
                const newImageUrls = uploadResults.map(result => result.secure_url);
                updatedData.images = [...updatedData.images, ...newImageUrls];
            } catch (uploadError) {
                console.error('Erro no upload de novas imagens para o Cloudinary:', uploadError);
                return res.status(500).json({ message: 'Falha ao fazer upload das novas imagens.' });
            }
        }

        // CORREÇÃO: Defina isModerator e passe como terceiro argumento
        const isModerator = req.session.user.isModerator === true;
        const updatedProperty = await dataManager.updateProperty(id, updatedData, isModerator);

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
            return res.status(400).json({ message: 'URL da imagem é obrigatória.' });
        }

        // Deleta a imagem do Cloudinary
        const publicId = extractPublicId(imagePath);
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (deleteError) {
                console.error(`Erro ao deletar imagem do Cloudinary ${publicId}:`, deleteError);
                // Continua mesmo se a exclusão falhar, para não bloquear a remoção do DB
            }
        }

        const propertyToUpdate = { ...req.property };
        propertyToUpdate.images = (propertyToUpdate.images || []).filter(img => img !== imagePath);
        propertyToUpdate.ownerId = req.session.user.id;

        // CORREÇÃO: Passa o status de moderador para a função de atualização,
        // garantindo que a permissão seja respeitada.
        const isModerator = req.session.user.isModerator === true;
        const updatedProperty = await dataManager.updateProperty(id, propertyToUpdate, isModerator);

        res.json({ message: 'Imagem removida com sucesso!', property: updatedProperty });
    } catch (error) {
        console.error('Erro ao remover imagem:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao remover a imagem.' });
    }
});
app.delete('/api/imoveis/:id', isAuthenticated, isPropertyOwner, async (req, res) => {
    try {
        const { id } = req.params;
        // O middleware isPropertyOwner já validou a permissão e carregou o imóvel em req.property
        const propertyToDelete = req.property;
        const isModerator = req.session.user.isModerator === true;
        if (propertyToDelete.images && propertyToDelete.images.length > 0) {
            const publicIds = propertyToDelete.images.map(extractPublicId).filter(id => id);
            if (publicIds.length > 0) {
                try {
                    // Deleta todos os recursos (imagens) de uma vez
                    await cloudinary.api.delete_resources(publicIds);
                } catch (deleteError) {
                    console.error('Erro ao deletar imagens em massa do Cloudinary:', deleteError);
                    // Não interrompe o fluxo, a exclusão do imóvel do DB é mais importante.
                    // Pode-se adicionar um log mais robusto aqui se necessário.
                }
            }
        }

        // Remove o imóvel do banco de dados
        // Corrigido para passar ownerId e isModerator
        const deletedCount = await dataManager.deleteProperty(id, propertyToDelete.ownerId, isModerator);

        if (deletedCount > 0) {
            res.json({ message: 'Imóvel removido com sucesso.' });
        } else {
            // Isso pode acontecer se o imóvel foi deletado por outra requisição entre a verificação e a exclusão.
            res.status(404).json({ message: 'Imóvel não encontrado para remoção.' });
        }
    } catch (error) {
        console.error('Erro ao remover imóvel:', error);
        res.status(500).json({ message: 'Ocorreu um erro interno ao remover o imóvel.' });
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

app.put('/api/users/:id/email', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { newEmail } = req.body;

        if (req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para alterar este e-mail.' });
        }

        if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) {
            return res.status(400).json({ message: 'Formato de e-mail inválido.' });
        }

        const updatedUser = await dataManager.updateUserEmail(id, newEmail.trim());
        if (!updatedUser) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        req.session.user.email = updatedUser.email;
        res.json({ message: 'E-mail atualizado com sucesso.', newEmail: updatedUser.email });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Este e-mail já está em uso.' });
        }
        console.error('Erro ao atualizar e-mail do usuário:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar e-mail.' });
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

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Só o próprio usuário pode excluir a própria conta
        if (!req.session.user || req.session.user.id !== id) {
            return res.status(403).json({ message: 'Você não tem permissão para excluir esta conta.' });
        }

        // Remove imóveis e usuário (se usar Postgres)
        if (typeof dataManager.deleteUserAndContent === 'function') {
            await dataManager.deleteUserAndContent(id);
        } else {
            await dataManager.deleteUser(id);
        }

        // Destroi a sessão do usuário
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ message: 'Conta excluída com sucesso.' });
        });
    } catch (error) {
        console.error('Erro ao excluir conta:', error);
        res.status(500).json({ message: 'Erro interno ao excluir conta.' });
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
