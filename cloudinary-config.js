const cloudinary = require('cloudinary').v2;
require('dotenv').config(); // Garante que as variáveis de ambiente sejam carregadas

// A forma mais segura e recomendada de configurar é usando a CLOUDINARY_URL
// que você obtém do seu dashboard. Ela contém o cloud_name, api_key e api_secret.
// Ex: CLOUDINARY_URL=cloudinary://<API_Key>:<API_Secret>@<Cloud_Name>
if (!process.env.CLOUDINARY_URL) {
  console.error('ERRO FATAL: CLOUDINARY_URL não está definida no ambiente.');
  console.error('Por favor, adicione a variável CLOUDINARY_URL ao seu arquivo .env');
  process.exit(1);
}

// O SDK do Cloudinary detecta e usa a variável de ambiente CLOUDINARY_URL automaticamente,
// então uma chamada explícita para `cloudinary.config()` não é necessária se a URL estiver definida.
// Apenas exportamos o objeto 'cloudinary' já configurado para ser usado em outras partes da aplicação.

module.exports = cloudinary;