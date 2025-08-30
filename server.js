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
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Servir imagens da pasta uploads

// Verifica se a SESSION_SECRET foi definida no .env
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'seu_segredo_super_secreto_aqui_com_pelo_menos_32_caracteres') {
    console.error('ERRO FATAL: A variável de ambiente SESSION_SECRET não está definida ou está usando o valor padrão.');
    console.error('Por favor, crie um arquivo .env, gere uma chave segura e adicione em SESSION_SECRET.');
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
    saveUninitialized: true, // Alterado para true para salvar sessões de visitantes
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Use cookies seguros em produção (HTTPS)
        httpOnly: true, 
        maxAge: 24 * 60 * 60 * 1000 // 1 dia
    }
}));

// --- Middlewares de Autenticação ---
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Não autorizado. Faça login para continuar.' });
const isOwner = (req, res, next) => (req.session.user && req.session.user.role === 'owner') ? next() : res.status(403).json({ message: 'Acesso negado. Apenas proprietários.' });

const isPropertyOwner = async (req, res, next) => {
    try {
        const { id } = req.params; // id do imóvel
        // Ineficiente, mas funciona com as funções atuais. O ideal seria ter uma função "findPropertyById".
        const properties = await dataManager.readImoveis();
        const property = properties.find(p => p.id === id);

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

// --- Rotas de Autenticação ---
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
// ATENÇÃO: Estas rotas ainda usam o padrão antigo de ler/escrever todos os usuários. Devem ser refatoradas.

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
                    property.images.forEach(imagePath => { // ATENÇÃO: Caminho pode precisar de ajuste
                        fs.unlink(path.join(__dirname, imagePath), (err) => {
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
