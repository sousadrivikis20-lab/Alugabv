const Filter = require('bad-words');

// Cria uma instância do filtro. A biblioteca já vem com uma lista robusta em inglês.
const filter = new Filter();

// Adicionamos nossa própria lista de palavras em português para complementar.
// A biblioteca é inteligente e também bloqueará variações (ex: "merd@").
const portugueseBadWords = [
    'merda', 'bosta', 'caralho', 'puta', 'foder', 'porra', 'krl',
    'viado', 'cu', 'buceta', 'pqp', 'vsf', 'tnc', 'arrombado',
    'piroca', 'pinto', 'rola', 'xoxota', 'grelinho',
    'retardado', 'idiota', 'imbecil', 'otario', 'babaca'
];

filter.addWords(...portugueseBadWords);

/**
 * Verifica se um texto contém palavras proibidas.
 * @param {string} text O texto a ser verificado.
 * @returns {boolean} True se o texto contiver uma palavra proibida, false caso contrário.
 */
function isProfane(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    return filter.isProfane(text);
}

module.exports = { isProfane };