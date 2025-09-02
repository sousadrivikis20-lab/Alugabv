const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configura o SDK do Cloudinary com as credenciais do ambiente
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Garante que as URLs geradas sejam HTTPS
});

module.exports = cloudinary;