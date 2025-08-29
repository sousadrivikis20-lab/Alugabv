const { Client } = require('pg');
require('dotenv').config();

async function setupDatabase() {
    // Primeiro conecta ao postgres para criar o banco se necessário
    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'sua_senha_aqui', // Altere para sua senha do PostgreSQL
        database: 'postgres'
    });

    try {
        await client.connect();
        
        // Verifica se o banco alugabv existe
        const res = await client.query(
            "SELECT 1 FROM pg_database WHERE datname = 'alugabv'"
        );

        if (res.rows.length === 0) {
            // Cria o banco se não existir
            await client.query('CREATE DATABASE alugabv');
            console.log('Banco de dados alugabv criado com sucesso!');
        }
    } catch (err) {
        console.error('Erro ao configurar banco de dados:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Executa a configuração
setupDatabase().then(() => {
    console.log('Configuração do banco concluída!');
    process.exit(0);
}).catch(err => {
    console.error('Erro durante a configuração:', err);
    process.exit(1);
});
