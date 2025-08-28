const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dataManager = require('./data-manager'); // Importa o novo módulo
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração do Multer para Upload de Imagens ---


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(dataManager.dataDir, 'uploads');
        // Garante que o diretório de uploads exista no disco persistente
        require('fs').mkdirSync(uploadPath, { recursive: true });
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
app.use('/uploads', express.static(path.join(dataManager.dataDir, 'uploads'))); // Servir imagens da pasta uploads do disco persistente



// Configuração da Sessão
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret_for_dev_change_it',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1 dia
}));

// --- Inicialização dos arquivos de dados ---
// Isso deve ser chamado antes de qualquer rota que dependa dos arquivos.
dataManager.initializeDataFiles().then(() => {
    console.log('Arquivos de dados inicializados com sucesso.');
}).catch(err => {
    console.error('Falha ao inicializar arquivos de dados:', err);
    process.exit(1); // Sai da aplicação se não conseguir inicializar os dados
});

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
        res.status(500).json({ message: 'Erro ao verificar permissões do imóvel.' });
    }
};

// --- Rotas de Autenticação ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    const users = await dataManager.readUsers();
    if (users.find(u => u.username === username)) return res.status(409).json({ message: 'Usuário já existe.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id: uuidv4(), username, password: hashedPassword, role });
    await dataManager.writeUsers(users);
    res.status(201).json({ message: 'Usuário registrado com sucesso!' });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body; // Assume que 'users.json' é um array de usuários
    const users = await dataManager.readUsers();
    const user = users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    const userSessionData = { id: user.id, username: user.username, role: user.role };
    req.session.user = userSessionData;
    res.json({ message: 'Login bem-sucedido!', user: userSessionData });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Não foi possível fazer logout.' });
        res.clearCookie('connect.sid');
        res.json({ message: 'Logout bem-sucedido.' });
    });
});

app.get('/api/auth/session', (req, res) => {
    if (req.session.user) return res.json({ user: req.session.user });
    res.status(404).json({ message: 'Nenhuma sessão ativa.' });
});

// --- Rotas dos Imóveis ---
app.get('/api/imoveis', async (req, res) => {
    try {
        const propertiesData = await dataManager.readImoveis();
        res.json(propertiesData.imoveis || []); // Retorna apenas o array de imóveis
    } catch (error) {
        res.status(500).json({ message: 'Erro ao carregar imóveis.' });
    }
});

app.post('/api/imoveis', isAuthenticated, isOwner, upload.array('imagens', 5), async (req, res) => {
    const { nome, contato, coords, transactionType, propertyType, salePrice, rentalPrice, rentalPeriod, descricao, description } = req.body;
    // Aceita descricao ou description
    const propertyDescricao = descricao !== undefined ? descricao : description;
    if (!nome || !contato || !coords || !transactionType || !propertyType || !propertyDescricao) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    const propertiesData = await dataManager.readImoveis();
    const properties = propertiesData.imoveis || [];
    const newProperty = {
        id: uuidv4(),
        nome,
        descricao: propertyDescricao,
        contato,
        transactionType,
        propertyType,
        // Salva os preços como números
        salePrice: salePrice ? parseFloat(salePrice) : null,
        rentalPrice: rentalPrice ? parseFloat(rentalPrice) : null,
        rentalPeriod: rentalPeriod || null,
        coords: JSON.parse(coords),
        ownerId: req.session.user.id, // ID do usuário logado
        ownerUsername: req.session.user.username, // Nome do usuário logado
        // Salva o caminho relativo da imagem para ser acessado via /uploads/filename.jpg
        images: req.files ? req.files.map(file => path.relative(dataManager.dataDir, file.path).replace(/\\/g, "/")) : []
    };

    properties.push(newProperty);
    await dataManager.writeImoveis({ imoveis: properties }); // Salva o objeto completo

    res.status(201).json({ message: 'Imóvel adicionado com sucesso!', property: newProperty });
});

app.put('/api/imoveis/:id', isAuthenticated, isPropertyOwner, upload.array('imagens', 5), async (req, res) => {
    const { id } = req.params;

    const properties = await readDb(PROPERTIES_DB_PATH);
    const propertyIndex = properties.findIndex(p => p.id === id);
    const propertyToUpdate = properties[propertyIndex];

    // Atualiza os campos de texto apenas se eles foram enviados no corpo da requisição
    // Isso evita que campos não enviados (ex: rentalPrice em uma venda) apaguem dados existentes.
    if (req.body.nome !== undefined) propertyToUpdate.nome = req.body.nome;
    if (req.body.descricao !== undefined) propertyToUpdate.descricao = req.body.descricao;
    if (req.body.contato !== undefined) propertyToUpdate.contato = req.body.contato;
    if (req.body.transactionType !== undefined) propertyToUpdate.transactionType = req.body.transactionType;
    if (req.body.propertyType !== undefined) propertyToUpdate.propertyType = req.body.propertyType;

    // Atualiza a localização se for fornecida
    if (req.body.coords) {
        try {
            propertyToUpdate.coords = JSON.parse(req.body.coords);
        } catch (e) {
            console.error("Erro ao parsear coordenadas na atualização:", e);
        }
    }

    // Atualiza os preços, convertendo para número ou null
    if (req.body.salePrice !== undefined) {
        propertyToUpdate.salePrice = req.body.salePrice ? parseFloat(req.body.salePrice) : null;
    }
    if (req.body.rentalPrice !== undefined) {
        propertyToUpdate.rentalPrice = req.body.rentalPrice ? parseFloat(req.body.rentalPrice) : null;
    }
    if (req.body.rentalPeriod !== undefined) {
        propertyToUpdate.rentalPeriod = req.body.rentalPeriod || null;
    }

    // Adiciona novas imagens, se houver
    if (req.files && req.files.length > 0) {
        const newImages = req.files.map(file => path.relative(dataManager.dataDir, file.path).replace(/\\/g, "/"));
        propertyToUpdate.images = [...(propertyToUpdate.images || []), ...newImages];
    }

    properties[propertyIndex] = propertyToUpdate;
    await dataManager.writeImoveis({ imoveis: properties });

    res.json({ message: 'Imóvel atualizado com sucesso!', property: propertyToUpdate });
});

app.delete('/api/imoveis/:id/images', isAuthenticated, isPropertyOwner, async (req, res) => {
    const { id } = req.params;
    const { imagePath } = req.body;

    if (!imagePath) {
        return res.status(400).json({ message: 'Caminho da imagem é obrigatório.' });
    }

    const propertiesData = await dataManager.readImoveis();
    const properties = propertiesData.imoveis || [];
    const propertyIndex = properties.findIndex(p => p.id === id);
    const propertyToUpdate = properties[propertyIndex];

    propertyToUpdate.images = propertyToUpdate.images.filter(img => img !== imagePath);

    require('fs').unlink(path.join(dataManager.dataDir, imagePath), (err) => {
        if (err) console.error(`Erro ao deletar imagem ${imagePath}:`, err);
    });

    properties[propertyIndex] = propertyToUpdate;
    await writeDb(PROPERTIES_DB_PATH, properties);

    res.json({ message: 'Imagem removida com sucesso!', property: propertyToUpdate });
});

app.delete('/api/imoveis/:id', isAuthenticated, isPropertyOwner, async (req, res) => {
    const { id } = req.params;
    const propertiesData = await dataManager.readImoveis();
    const properties = propertiesData.imoveis || [];
    const propertyIndex = properties.findIndex(p => p.id === id);

    if (req.property.images && req.property.images.length > 0) {
        req.property.images.forEach(imagePath => {
            require('fs').unlink(path.join(dataManager.dataDir, imagePath), (err) => {
                if (err) console.error(`Erro ao deletar imagem ${imagePath}:`, err);
            });
        });
    }

    properties.splice(propertyIndex, 1);
    await dataManager.writeImoveis({ imoveis: properties });
    res.json({ message: 'Imóvel removido com sucesso.' });
});

// Servir arquivos estáticos (HTML, CSS, JS do cliente) - DEVE VIR DEPOIS DAS ROTAS DA API
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
