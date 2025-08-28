const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// O Render e outras plataformas montam o disco em um caminho específico.
// Usamos uma variável de ambiente para isso, com um fallback para o diretório local.
const dataDir = process.env.DATA_DIR || __dirname;
const usersPath = path.join(dataDir, 'users.json');
const imoveisPath = path.join(dataDir, 'db.json');

// Garante que o diretório de dados e os arquivos JSON existam.
async function initializeDataFiles() {
    try {
        // Cria o diretório se não existir (relevante para o disco persistente)
        await fs.mkdir(dataDir, { recursive: true });

        let usersCreated = false;
        // Verifica e cria users.json se necessário
        try {
            await fs.access(usersPath);
        } catch {
            console.log('Criando arquivo users.json...');
            await fs.writeFile(usersPath, JSON.stringify([], null, 2), 'utf8');
            usersCreated = true;
        }

        // Se o arquivo de usuários foi recém-criado, popule com os usuários originais
        if (usersCreated) {
            console.log('Populando users.json com os usuários originais (seeding)...');
            const passwordVinicius = await bcrypt.hash('senha123', 10); // Senha padrão para 'vinicius'
            const passwordVini = await bcrypt.hash('2007', 10);
            const passwordDani = await bcrypt.hash('2007', 10);
            const seedUsers = [
                {
                    id: 'd58f28e4-7328-4ec3-8c3c-e41cf42c3567',
                    username: 'vinicius',
                    password: passwordVinicius,
                    role: 'owner'
                },
                { id: uuidv4(), username: 'vini', password: passwordVini, role: 'owner' },
                {
                    id: '348232e7-e0e3-4bef-9f23-04051f38226b',
                    username: 'dani',
                    password: passwordDani,
                    role: 'owner'
                }
            ];
            await writeUsers(seedUsers);
        }

        // Verifica e cria db.json se necessário
        try {
            await fs.access(imoveisPath);
        } catch {
            await fs.writeFile(imoveisPath, JSON.stringify({ imoveis: [] }, null, 2), 'utf8');
        }
    } catch (error) {
        console.error('Erro ao inicializar arquivos de dados:', error);
        // Se não conseguir criar os arquivos, a aplicação não pode continuar.
        process.exit(1);
    }
}

// Funções para ler os dados
const readUsers = async () => JSON.parse(await fs.readFile(usersPath, 'utf8'));
const readImoveis = async () => JSON.parse(await fs.readFile(imoveisPath, 'utf8'));

// Funções para escrever os dados
const writeUsers = async (users) => await fs.writeFile(usersPath, JSON.stringify(users, null, 2), 'utf8');
const writeImoveis = async (imoveisData) => await fs.writeFile(imoveisPath, JSON.stringify(imoveisData, null, 2), 'utf8');

module.exports = {
    initializeDataFiles,
    readUsers,
    writeUsers,
    readImoveis,
    writeImoveis,
    dataDir // Exportar para usar no multer para uploads
};