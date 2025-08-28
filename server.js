const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração do Multer para Upload de Imagens ---
const UPLOADS_DIR = 'uploads';
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
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
app.use('/uploads', express.static(path.join(__dirname, UPLOADS_DIR))); // Servir imagens da pasta uploads

// Configuração da Sessão
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret_for_dev_change_it',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1 dia
}));

// --- Caminhos dos "Bancos de Dados" ---
const USERS_DB_PATH = path.join(__dirname, 'users.json');
const PROPERTIES_DB_PATH = path.join(__dirname, 'db.json');

// --- Funções Auxiliares para ler/escrever nos arquivos JSON ---
const readDb = async (filePath) => {
    try {
        await fsp.access(filePath);
        const data = await fsp.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

const writeDb = async (filePath, data) => {
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// --- Middlewares de Autenticação ---
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Não autorizado. Faça login para continuar.' });
const isOwner = (req, res, next) => (req.session.user && req.session.user.role === 'owner') ? next() : res.status(403).json({ message: 'Acesso negado. Apenas proprietários.' });

const isPropertyOwner = async (req, res, next) => {
    try {
        const { id } = req.params;
        const properties = await readDb(PROPERTIES_DB_PATH);
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
    if (!username || !password || !role) return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });

    const users = await readDb(USERS_DB_PATH);
    if (users.find(u => u.username === username)) return res.status(409).json({ message: 'Usuário já existe.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id: uuidv4(), username, password: hashedPassword, role });
    await writeDb(USERS_DB_PATH, users);
    res.status(201).json({ message: 'Usuário registrado com sucesso!' });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await readDb(USERS_DB_PATH);
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
        res.json(await readDb(PROPERTIES_DB_PATH));
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

    const properties = await readDb(PROPERTIES_DB_PATH);
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
        ownerId: req.session.user.id,
        ownerUsername: req.session.user.username,
        images: req.files ? req.files.map(file => file.path.replace(/\\/g, "/")) : []
    };

    properties.push(newProperty);
    await writeDb(PROPERTIES_DB_PATH, properties);
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
        const newImages = req.files.map(file => file.path.replace(/\\/g, "/"));
        propertyToUpdate.images = [...(propertyToUpdate.images || []), ...newImages];
    }

    properties[propertyIndex] = propertyToUpdate;
    await writeDb(PROPERTIES_DB_PATH, properties);

    res.json({ message: 'Imóvel atualizado com sucesso!', property: propertyToUpdate });
});

app.delete('/api/imoveis/:id/images', isAuthenticated, isPropertyOwner, async (req, res) => {
    const { id } = req.params;
    const { imagePath } = req.body;

    if (!imagePath) {
        return res.status(400).json({ message: 'Caminho da imagem é obrigatório.' });
    }

    const properties = await readDb(PROPERTIES_DB_PATH);
    const propertyIndex = properties.findIndex(p => p.id === id);
    const propertyToUpdate = properties[propertyIndex];

    propertyToUpdate.images = propertyToUpdate.images.filter(img => img !== imagePath);

    fs.unlink(path.join(__dirname, imagePath), (err) => {
        if (err) console.error(`Erro ao deletar imagem ${imagePath}:`, err);
    });

    properties[propertyIndex] = propertyToUpdate;
    await writeDb(PROPERTIES_DB_PATH, properties);

    res.json({ message: 'Imagem removida com sucesso!', property: propertyToUpdate });
});

app.delete('/api/imoveis/:id', isAuthenticated, isPropertyOwner, async (req, res) => {
    const { id } = req.params;
    const properties = await readDb(PROPERTIES_DB_PATH);
    const propertyIndex = properties.findIndex(p => p.id === id);

    if (req.property.images && req.property.images.length > 0) {
        req.property.images.forEach(imagePath => {
            fs.unlink(path.join(__dirname, imagePath), (err) => {
                if (err) console.error(`Erro ao deletar imagem ${imagePath}:`, err);
            });
        });
    }

    properties.splice(propertyIndex, 1);
    await writeDb(PROPERTIES_DB_PATH, properties);
    res.json({ message: 'Imóvel removido com sucesso.' });
});

// Servir arquivos estáticos (HTML, CSS, JS do cliente) - DEVE VIR DEPOIS DAS ROTAS DA API
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
