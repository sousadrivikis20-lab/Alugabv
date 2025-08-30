// --- INÍCIO DA CONFIGURAÇÃO DO MAPA ---
const bounds = L.latLngBounds(L.latLng(-5.45, -40.0), L.latLng(-4.80, -39.45));
const map = L.map('map', {
  center: [-5.11389, -39.73389],
  zoom: 13,
  maxBounds: bounds,
  maxBoundsViscosity: 1.0,
  minZoom: 12
});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
// --- FIM DA CONFIGURAÇÃO DO MAPA ---

// --- Variáveis Globais ---
let markers = {};
let currentUser = null;
let editingPropertyId = null;
let cadastroAtivo = false;
let currentActionConfirmCallback = null; // Para o modal de ação genérico
let locationChangeActive = false;
let newPropertyCoords = null;
let tempLocationMarker = null;

// --- Elementos do DOM ---
const mostrarFormBtn = document.getElementById('mostrar-form-btn');
const formImovel = document.getElementById('form-imovel');
const propertyInstructions = document.getElementById('property-instructions');
const formStatus = document.getElementById('form-status');
const nomeInput = document.getElementById('nome');
const descricaoInput = document.getElementById('descricao');
const contatoInput = document.getElementById('contato');
const imagensInput = document.getElementById('imagens');
const transactionTypeSelect = document.getElementById('transactionType');
const priceFieldsContainer = document.getElementById('price-fields-container');
const salePriceGroup = document.getElementById('sale-price-group');
const rentalPriceGroup = document.getElementById('rental-price-group');
const rentalPeriodGroup = document.getElementById('rental-period-group');
const salePriceInput = document.getElementById('salePrice');
const rentalPriceInput = document.getElementById('rentalPrice');
const propertyTypeSelect = document.getElementById('propertyType');
const rentalPeriodSelect = document.getElementById('rentalPeriod');


// Elementos de Autenticação
const guestView = document.getElementById('guest-view');
const userView = document.getElementById('user-view');
const actionsPanel = document.getElementById('actions-panel');
const toggleLoginBtn = document.getElementById('toggle-login-btn');
const toggleRegisterBtn = document.getElementById('toggle-register-btn');
const welcomeMsg = document.getElementById('welcome-msg');
const logoutBtn = document.getElementById('logout-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const editButtons = document.getElementById('edit-buttons');
const existingImagesContainer = document.getElementById('existing-images');
const saveEditBtn = document.getElementById('save-edit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const changeLocationBtn = document.getElementById('change-location-btn');
const searchInput = document.getElementById('search-input');

// Elementos do Modal de Confirmação
const confirmationModal = document.getElementById('confirmation-modal');
const modalMessage = document.getElementById('modal-message');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// Elementos do Modal de Ação (para editar nome/senha)
const actionModal = document.getElementById('action-modal');
const actionModalTitle = document.getElementById('action-modal-title');
const actionModalForm = document.getElementById('action-modal-form');
const actionModalConfirmBtn = document.getElementById('action-modal-confirm-btn');
const actionModalCancelBtn = document.getElementById('action-modal-cancel-btn');

// Elementos de Gerenciamento de Conta
const accountManagementSection = document.getElementById('account-management-section');
const toggleAccountActionsBtn = document.getElementById('toggle-account-actions-btn');
const accountActionsContent = document.getElementById('account-actions-content');

// --- Funções de UI ---

// Notificações Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconSvg = '';
  switch (type) {
    case 'success':
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;
      break;
    case 'error':
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/></svg>`;
      break;
    case 'info':
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;
      break;
  }

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

toast.addEventListener('animationend', (e) => {
  if (e.animationName === 'slideOut') {
    toast.remove();
  }
});

// Feedback de Carregamento em Botões
function toggleLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.classList.add('loading');
        button.disabled = true;
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const textSpan = button.querySelector('span');
        if (textSpan) {
            button.insertBefore(spinner, textSpan);
        } else {
            button.appendChild(spinner);
        }
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        const spinner = button.querySelector('.spinner');
        if (spinner) {
            spinner.remove();
        }
    }
}

function updateStatus(message, type, element = formStatus) {
  if (!element) return;

  element.innerText = message;
  // Reset classes, keeping the base class
  element.className = 'status-message';

  if (type) {
    element.classList.add(type);
  }

  // Show or hide the element based on whether there's a message
  element.classList.toggle('hidden', !message);
}

function updateUIForUser() {
  if (currentUser) {
    guestView.classList.add('hidden');
    userView.classList.remove('hidden');
    accountManagementSection.classList.remove('hidden');
    welcomeMsg.innerText = `Bem-vindo, ${currentUser.username}!`;

    if (currentUser.role === 'owner') {
      actionsPanel.classList.remove('hidden');
    } else {
      actionsPanel.classList.add('hidden');
      formImovel.classList.add('hidden');
      propertyInstructions.classList.add('hidden');
      cadastroAtivo = false;
    }
  } else {
    guestView.classList.remove('hidden');
    userView.classList.add('hidden');
    actionsPanel.classList.add('hidden');
    accountManagementSection.classList.add('hidden');
    formImovel.classList.add('hidden');
    propertyInstructions.classList.add('hidden');
    cadastroAtivo = false;
  }
  // Atualiza os marcadores existentes para mostrar/esconder o botão de remover
  Object.values(markers).forEach(marker => {
    const property = marker.propertyData;
    if (property) {
      marker.setPopupContent(createPopupContent(property));
  }  });
}

function togglePropertyForm() {
  if (editingPropertyId) {
    // Se o usuário clicar em "Adicionar" enquanto edita, cancela a edição primeiro
    handleEditCancel();
  }

  const isHiding = formImovel.classList.toggle('hidden');
  propertyInstructions.classList.toggle('hidden');
  cadastroAtivo = !isHiding;

  const message = cadastroAtivo ? 'Modo de cadastro ativado. Clique no mapa para adicionar um imóvel.' : '';
  updateStatus(message, 'info');
}

// --- Funções de Busca e Filtro ---
function filterProperties() {
  const searchTerm = searchInput.value.toLowerCase().trim();

  Object.values(markers).forEach(marker => {
    const property = marker.propertyData;
    if (!property) return; // Ignora se não houver dados

    // Garante que os valores existam, usando operador ?? para fornecer valor padrão
    const propertyName = property.nome?.toLowerCase() ?? '';
    const propertyType = property.propertyType?.toLowerCase() ?? '';
    const propertyTransactionType = property.transactionType?.toLowerCase() ?? '';
    const propertyOwner = property.ownerUsername?.toLowerCase() ?? '';
    const propertyDescription = property.descricao?.toLowerCase() ?? '';

    // Verifica se o termo de busca está presente em qualquer um dos campos
    const matches = propertyName.includes(searchTerm) || 
                   propertyType.includes(searchTerm) ||
                   propertyTransactionType.includes(searchTerm) ||
                   propertyOwner.includes(searchTerm) ||
                   propertyDescription.includes(searchTerm);

    // Mostra ou esconde o marcador
    if (matches) {
      marker.addTo(map);
    } else {
      marker.remove();
    }
  });
}

async function loadInitialProperties() {
  try {
    const response = await apiCall('/api/imoveis');
    if (!Array.isArray(response)) {
      console.warn('Resposta inesperada ao carregar imóveis:', response);
      return;
    }

    // Limpa marcadores existentes
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};

    // Adiciona novos marcadores
    response.forEach(property => {
      if (property && property.coords) {
        addPropertyMarker(property);
      }
    });
  } catch (error) {
    console.error('Não foi possível carregar imóveis:', error);
    showToast('Erro ao carregar imóveis. Por favor, tente novamente.', 'error');
  }
}

// --- Funções de Lógica de Imóveis ---
function formatCurrency(input) {
  let value = input.value.replace(/\D/g, '');
  if (value === '') {
    input.value = '';
    return;
  }
  value = (parseInt(value, 10) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  input.value = value;
}

function unformatCurrency(value) {
  if (!value) return 0;
  return parseFloat(value.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
}

function isFormValid() {
  const nome = nomeInput.value.trim();
  const descricao = descricaoInput.value.trim();
  const contato = contatoInput.value.trim();
  const transactionType = transactionTypeSelect.value;
  const propertyType = propertyTypeSelect.value; // Novo campo
  const salePrice = unformatCurrency(salePriceInput.value);
  const rentalPrice = unformatCurrency(rentalPriceInput.value);

  if (!nome || !descricao || !contato || !transactionType || !propertyType) return false; // Valida propertyType e descricao

  if (transactionType === 'Vender' && salePrice <= 0) return false;
  if (transactionType === 'Alugar' && rentalPrice <= 0) return false;
  if (transactionType === 'Ambos' && (salePrice <= 0 || rentalPrice <= 0)) return false;

  return true;
}

function createPopupContent(property, doc = document) {
  const { id, nome, descricao, contato, ownerId, ownerUsername, images, transactionType, salePrice, rentalPrice, rentalPeriod, propertyType } = property;
  const numeroWhatsApp = String(contato).replace(/\D/g, '');
  const linkWhatsApp = `https://wa.me/55${numeroWhatsApp}`;

  const container = doc.createElement('div');

  // Galeria de Imagens
  if (images && images.length > 0) {
    const gallery = doc.createElement('div');
    gallery.className = 'popup-gallery';
    images.forEach(imgSrc => {
      const img = doc.createElement('img');
      img.src = imgSrc;
      img.alt = `Imagem de ${nome}`;
      img.loading = 'lazy';
      gallery.appendChild(img);
    });
    container.appendChild(gallery);
  }

  // Tipo de Imóvel
  const propertyTypeEl = doc.createElement('div');
  propertyTypeEl.className = 'property-type-info';
  let propertyTypeIconSvg = '';
  switch (propertyType) {
    case 'Apartamento':
      propertyTypeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-building-fill" viewBox="0 0 16 16"><path d="M4 2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm2.5.5a.5.5 0 0 0 .5-.5h1a.5.5 0 0 0 .5.5v1a.5.5 0 0 0-.5.5h-1a.5.5 0 0 0-.5-.5v-1zM9 2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm2.5.5a.5.5 0 0 0 .5-.5h1a.5.5 0 0 0 .5.5v1a.5.5 0 0 0-.5.5h-1a.5.5 0 0 0-.5-.5v-1z"/><path d="M2 1a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V1zm2 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zm3 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zm3 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zm3 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zM2 8.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5z"/></svg>`;
      break;
    case 'Casa':
      propertyTypeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house-door-fill" viewBox="0 0 16 16"><path d="M6.5 14.5v-3.505c0-.245.25-.495.5-.495h2c.25 0 .5.25.5.5v3.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5z"/></svg>`;
      break;
    case 'Casa de Piscina':
      propertyTypeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-droplet-fill" viewBox="0 0 16 16"><path d="M8 16a6 6 0 0 0 6-6c0-1.655-1.122-2.904-2.432-4.362C10.254 4.176 8.75 2.503 8 0c0 0-6 5.686-6 10a6 6 0 0 0 6 6zM6.646 4.646c-.376.377-1.272 1.489-2.093 2.718.22-.333.44-.644.658-.926.218-.282.476-.543.77-.746.294-.203.64-.326 1.027-.326.387 0 .733.123 1.027.326.294.203.552.464.77.746.218.282.438.593.658.926-.82-1.229-1.717-2.341-2.093-2.718A1.96 1.96 0 0 0 8 4c-.464 0-.873.144-1.154.354z"/></svg>`;
      break;
    case 'Fazenda':
      propertyTypeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house-lodge-fill" viewBox="0 0 16 16"><path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.707 1.5z"/><path d="M12 9.793V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V9.793l-1 1V14.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V10.793l-1-1V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V9.793l4-4 4 4z"/></svg>`;
      break;
    case 'Ponto Comercial':
      propertyTypeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-shop-window" viewBox="0 0 16 16"><path d="M2.97 1.35A1 1 0 0 1 3.73 1h8.54a1 1 0 0 1 .76.35L14.75 4H11V2H5v2H1.25L2.97 1.35zM1 5h14v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5zm6 0v2H5V5h2zm2 0v2h2V5H9zm2 3v2H9V8h2zm-2 0v2H7V8h2zm-2 0v2H5V8h2zm2 3v2H9v-2h2zm-2 0v2H7v-2h2z"/></svg>`;
      break;
    default:
      propertyTypeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-geo-alt-fill" viewBox="0 0 16 16"><path d="M8 16s6-5.686 6-10A6 6 0 1 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`; // Ícone genérico
  }
  propertyTypeEl.innerHTML = `${propertyTypeIconSvg} <span>${propertyType}</span>`;
  container.appendChild(propertyTypeEl);

  // Nome do Imóvel
  const nameEl = doc.createElement('b');
  nameEl.textContent = nome;
  container.appendChild(nameEl);

  // Descrição do Imóvel
  if (descricao) {
    const descriptionEl = doc.createElement('p');
    descriptionEl.className = 'property-description';
    descriptionEl.textContent = descricao;
    container.appendChild(descriptionEl);
  }

  // Informações de Preço
  const formatPrice = (price) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  const createPriceLine = (label, price, period = '') => {
    const span = doc.createElement('span');
    const strong = doc.createElement('strong');
    strong.textContent = `${label}: `;
    span.appendChild(strong);
    span.append(`${formatPrice(price)} ${period}`.trim());
    container.appendChild(span);
    container.appendChild(doc.createElement('br'));
  };
  if ((transactionType === 'Vender' || transactionType === 'Ambos') && salePrice) {
    createPriceLine('Venda', salePrice);
  }
  if ((transactionType === 'Alugar' || transactionType === 'Ambos') && rentalPrice) {
    createPriceLine('Aluguel', rentalPrice, rentalPeriod);
  }

  // Link do WhatsApp (ícone ao lado do texto)
  const whatsappLink = doc.createElement('a');
  whatsappLink.href = linkWhatsApp;
  whatsappLink.target = '_blank';
  whatsappLink.innerHTML = `   
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-whatsapp" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
    <span>Chamar no WhatsApp</span>
 
  `;
  container.appendChild(whatsappLink);

  // Informação do Proprietário
  if (ownerUsername) {
    const ownerInfo = doc.createElement('div');
    ownerInfo.className = 'property-owner';
    ownerInfo.textContent = `Anunciado por: ${ownerUsername}`;
    container.appendChild(ownerInfo);
  }

  // Seção de botões de ação (modifique esta parte)
  if (currentUser && currentUser.role === 'owner' && currentUser.id === ownerId) {
    const actionsDiv = doc.createElement('div');
    actionsDiv.className = 'popup-actions';
    
    const editButton = doc.createElement('button');
    editButton.className = 'edit-btn';
    editButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
      </svg>
      Editar
    `;
    editButton.onclick = () => handleEditStart(id);

    const removeButton = doc.createElement('button');
    removeButton.className = 'remove-btn';
    removeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
      </svg>
      Remover
    `;
    removeButton.onclick = () => handleDelete(id);

    actionsDiv.appendChild(editButton);
    actionsDiv.appendChild(removeButton);
    container.appendChild(actionsDiv);
  }

  return container;
}

function addPropertyMarker(property) {
  const marker = L.marker(property.coords, { icon: getPropertyMarkerIcon(property.propertyType) }).addTo(map).bindPopup(createPopupContent(property));
  marker.propertyData = property; // Armazena os dados no marcador
  markers[property.id] = marker;
  return marker;
}

function resetFormAndState() {
  formImovel.reset();
  if (!formImovel.classList.contains('hidden')) togglePropertyForm();
}

function handleLocationChange(e) {
    newPropertyCoords = e.latlng;
    locationChangeActive = false;

    if (tempLocationMarker) {
        map.removeLayer(tempLocationMarker);
    }

    // Adiciona um marcador temporário para feedback visual
    tempLocationMarker = L.marker(newPropertyCoords, {
        icon: L.icon({
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        })
    }).addTo(map);

    updateStatus('Nova localização selecionada. Clique em "Salvar Alterações".', 'success');
    changeLocationBtn.disabled = false;
    changeLocationBtn.querySelector('span').textContent = 'Alterar Localização';
}

function handleMapClick(e) {
  if (locationChangeActive && editingPropertyId) {
    handleLocationChange(e);
    return;
  }

  if (!cadastroAtivo) return;

  if (!isFormValid()) {
    showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
    return;
  }

  // Desativa o modo de cadastro imediatamente para evitar cliques múltiplos
  cadastroAtivo = false;
  updateStatus('Salvando imóvel, por favor aguarde...', 'info');

  const formData = new FormData();
  formData.append('nome', nomeInput.value.trim());
  formData.append('descricao', descricaoInput.value.trim());
  formData.append('contato', contatoInput.value.trim());
  formData.append('coords', JSON.stringify(e.latlng));
  formData.append('transactionType', transactionTypeSelect.value);
  formData.append('propertyType', propertyTypeSelect.value); // Novo campo

  const transactionType = transactionTypeSelect.value;
  if (transactionType === 'Vender' || transactionType === 'Ambos') {
    formData.append('salePrice', unformatCurrency(salePriceInput.value));
  }
  if (transactionType === 'Alugar' || transactionType === 'Ambos') {
    formData.append('rentalPrice', unformatCurrency(rentalPriceInput.value));
    formData.append('rentalPeriod', rentalPeriodSelect.value);
  }

  for (const file of imagensInput.files) {
    formData.append('imagens', file);
  }

  savePropertyToServer(formData);
}

// --- Funções de Comunicação com o Servidor (API) ---
async function apiCall(endpoint, options = {}) {
  const fetchOptions = { ...options };

  // Não serializa FormData e deixa o navegador definir o Content-Type
  if (options.body && !(options.body instanceof FormData)) {
    fetchOptions.headers = { 'Content-Type': 'application/json', ...options.headers };
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(endpoint, fetchOptions);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Ocorreu um erro.');
    }
    return data;
  } catch (error) {
    console.error(`Erro na chamada API para ${endpoint}:`, error);
    if (error instanceof SyntaxError) { // Se o servidor enviar um erro não-JSON
      throw new Error("Ocorreu um erro de comunicação com o servidor.");
    }
    throw error;
  }
}

async function loadInitialProperties() {
  try {
    const response = await apiCall('/api/imoveis');
    if (!Array.isArray(response)) {
      console.warn('Resposta inesperada ao carregar imóveis:', response);
      return;
    }

    // Limpa marcadores existentes
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};

    // Adiciona novos marcadores
    response.forEach(property => {
      if (property && property.coords) {
        addPropertyMarker(property);
      }
    });
  } catch (error) {
    console.error('Não foi possível carregar imóveis:', error);
    showToast('Erro ao carregar imóveis. Por favor, tente novamente.', 'error');
  }
}

async function savePropertyToServer(formData) {
  try {
    const data = await apiCall('/api/imoveis', {
      method: 'POST',
      body: formData,
    });
    addPropertyMarker(data.property).openPopup();
    updateStatus('Imóvel salvo com sucesso!', 'success');
    setTimeout(resetFormAndState, 2000);
  } catch (error) {
    updateStatus(error.message, 'error');
    // Reativa o modo de cadastro em caso de erro para que o usuário possa tentar novamente
    cadastroAtivo = true;
  }
}

function handleEditStart(id) {
  const property = markers[id]?.propertyData;
  if (!property) return;

  editingPropertyId = id;
  
  // Preenche o formulário
  newPropertyCoords = null;
  locationChangeActive = false;
  changeLocationBtn.disabled = false;

  nomeInput.value = property.nome;
  descricaoInput.value = property.descricao || '';
  contatoInput.value = property.contato;
  transactionTypeSelect.value = property.transactionType;
  propertyTypeSelect.value = property.propertyType; // Preenche o novo campo

  // Formata e preenche os preços
  if (property.salePrice) {
    salePriceInput.value = String(property.salePrice * 100);
    formatCurrency(salePriceInput);
  } else {
    salePriceInput.value = '';
  }
  if (property.rentalPrice) {
    rentalPriceInput.value = String(property.rentalPrice * 100);
    formatCurrency(rentalPriceInput);
  } else {
    rentalPriceInput.value = '';
  }
  rentalPeriodSelect.value = property.rentalPeriod || 'por Mês';


  imagensInput.value = ''; // Limpa o input de arquivos
  handleTransactionTypeChange(); // Mostra os campos corretos

  // Atualiza a UI para o modo de edição
  formImovel.classList.remove('hidden');
  propertyInstructions.classList.add('hidden');
  updateStatus(`Editando o imóvel: ${property.nome}.`, 'info');
  
  renderExistingImages(property);
  mostrarFormBtn.classList.add('hidden');
  editButtons.classList.remove('hidden');
  cadastroAtivo = false;
  
  formImovel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleEditCancel() {
  editingPropertyId = null;
  
  formImovel.reset();

  // Limpa o estado de alteração de localização
  locationChangeActive = false;
  newPropertyCoords = null;
  if (tempLocationMarker) {
      map.removeLayer(tempLocationMarker);
      tempLocationMarker = null;
  }

  formImovel.classList.add('hidden');
  
  editButtons.classList.add('hidden');
  mostrarFormBtn.classList.remove('hidden');
  priceFieldsContainer.classList.add('hidden');
  
  updateStatus('', null);
  renderExistingImages({});
}

async function removeImageFromProperty(propertyId, imagePath) {
  try {
    const data = await apiCall(`/api/imoveis/${propertyId}/images`, {
      method: 'DELETE',
      body: { imagePath },
    });

    return data;
  } catch (error) {
    updateStatus(`Erro ao remover imagem: ${error.message}`, 'error');
    return null;
  }
}

function handleRemoveImage(event) {
  const imagePath = event.target.dataset.image;
  if (!imagePath) return;

  removeImageFromProperty(editingPropertyId, imagePath).then(data => {
    if (data) {
      updateStatus('Imagem removida com sucesso!', 'success');
      const property = markers[editingPropertyId].propertyData;
      property.images = property.images.filter(img => img !== imagePath);
      markers[editingPropertyId].propertyData = property;
      markers[editingPropertyId].setPopupContent(createPopupContent(property));
      renderExistingImages(property);
    }
  });
}

function renderExistingImages(property) {
    existingImagesContainer.innerHTML = '';

    if (!property || !property.images || property.images.length === 0) {
        existingImagesContainer.innerHTML = '<p>Nenhuma imagem cadastrada.</p>';
        return;
    }

    property.images.forEach(imagePath => {
        const imageElement = document.createElement('div');
        imageElement.classList.add('existing-image-item');

        const img = document.createElement('img');
        img.src = imagePath;
        img.alt = 'Imagem do imóvel';
        imageElement.appendChild(img);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.classList.add('remove-image-btn');
        removeButton.dataset.image = imagePath;
        removeButton.innerHTML = '&times;';
        removeButton.addEventListener('click', handleRemoveImage);
        imageElement.appendChild(removeButton);

        existingImagesContainer.appendChild(imageElement);
    });

    formImovel.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function handleEditSave() {
  if (!editingPropertyId || !isFormValid()) {
    showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
    return;
  }

  const formData = new FormData();
  const transactionType = transactionTypeSelect.value;
  formData.append('nome', nomeInput.value.trim());
  formData.append('descricao', descricaoInput.value.trim());
  formData.append('contato', contatoInput.value.trim());
  formData.append('transactionType', transactionType);
  formData.append('propertyType', propertyTypeSelect.value); // Novo campo
  if (transactionType === 'Vender' || transactionType === 'Ambos') {
    formData.append('salePrice', unformatCurrency(salePriceInput.value));
  }
  if (transactionType === 'Alugar' || transactionType === 'Ambos') {
    formData.append('rentalPrice', unformatCurrency(rentalPriceInput.value));
    formData.append('rentalPeriod', rentalPeriodSelect.value);
  }

  // Adiciona as novas coordenadas se tiverem sido alteradas
  if (newPropertyCoords) {
    formData.append('coords', JSON.stringify(newPropertyCoords));
  }

  for (const file of imagensInput.files) {
    formData.append('imagens', file);
  }

  toggleLoading(saveEditBtn, true);
  try {
    updateStatus('Salvando alterações...', 'info');
    const data = await apiCall(`/api/imoveis/${editingPropertyId}`, {
      method: 'PUT',
      body: formData,
    });

    const updatedProperty = data.property;
    const marker = markers[updatedProperty.id];

    // Move o marcador se a localização foi alterada
    if (newPropertyCoords) {
        marker.setLatLng(newPropertyCoords);
    }

    marker.propertyData = updatedProperty;
    marker.setPopupContent(createPopupContent(updatedProperty));

    updateStatus('Imóvel atualizado com sucesso!', 'success');
    setTimeout(handleEditCancel, 2000);

    // Limpa o estado de alteração de localização
    newPropertyCoords = null;
    if (tempLocationMarker) {
        map.removeLayer(tempLocationMarker);
        tempLocationMarker = null;
    }
  } catch (error) {
    updateStatus(`Erro ao salvar: ${error.message}`, 'error');
  } finally {
    toggleLoading(saveEditBtn, false);
  }
}

async function handleDelete(id) {
  const onConfirm = async () => {
    try {
      const response = await apiCall(`/api/imoveis/${id}`, { method: 'DELETE' });
      if (!response) throw new Error('Falha ao excluir imóvel');
      
      // Remove o marcador do mapa
      if (markers[id]) {
        markers[id].remove();
        delete markers[id];
      }
      
      showToast('Imóvel removido com sucesso!', 'success');
      hideConfirmationModal();
    } catch (error) {
      console.error('Erro ao excluir imóvel:', error);
      showToast('Erro ao excluir imóvel. Tente novamente.', 'error');
      hideConfirmationModal();
  }

  // Certifique-se de que o modal está sendo exibido
  showConfirmationModal(
    'Tem certeza que deseja remover este imóvel?<br>Esta ação não pode ser desfeita.',
    onConfirm
  );
}

// --- Funções do Modal de Confirmação ---
let confirmationCallback = null;

function showConfirmationModal(message, onConfirm) {
  confirmationCallback = onConfirm;
  modalMessage.innerHTML = message || 'Tem certeza que deseja executar esta ação?';
  confirmationModal.classList.remove('hidden');
}

function hideConfirmationModal() {
  confirmationModal.classList.add('hidden');
  confirmationCallback = null;
}

async function handleConfirmAction() {
  if (!confirmationCallback) return;

  toggleLoading(modalConfirmBtn, true);
  try {
    await confirmationCallback();
  } catch (error) {
    // O callback já deve ter mostrado um toast específico.
    // O console.error é para debug.
    console.error("Erro na ação de confirmação:", error);
  } finally {
    hideConfirmationModal();
    toggleLoading(modalConfirmBtn, false);
  }
}

// --- Funções do Modal de Ação (Editar Nome/Senha) ---
function showActionModal(title, formHtml, onConfirm) {
  actionModalTitle.textContent = title;
  actionModalForm.innerHTML = formHtml;
  currentActionConfirmCallback = onConfirm;
  actionModal.classList.remove('hidden');
}

function hideActionModal() {
  actionModal.classList.add('hidden');
  actionModalForm.innerHTML = '';
  currentActionConfirmCallback = null;
}

async function handleActionConfirm() {
  if (!currentActionConfirmCallback) return;

  const form = actionModalForm;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  toggleLoading(actionModalConfirmBtn, true);
  try {
    // Executa o callback passando os dados do formulário
    await currentActionConfirmCallback(data);
  } finally {
    // O callback é responsável por fechar o modal ou mostrar erros
    toggleLoading(actionModalConfirmBtn, false);
  }
}

// Função para alterar o nome do usuário
async function handleChangeName() {
  const formHtml = `
    <div class="modal-form-group">
      <label for="newNameInput">Novo nome de usuário</label>
      <input type="text" id="newNameInput" name="newName" value="${currentUser.username}" required>
    </div>`;

  showActionModal('Alterar Nome', formHtml, async (formData) => {
    if (!formData.newName) {
      showToast('O nome não pode ser vazio.', 'error');
      return;
    }
    try {
      const result = await apiCall(`/api/users/${currentUser.id}/name`, { method: 'PUT', body: { newName: formData.newName.trim() } });
      showToast(result.message, 'success');
      currentUser.username = result.newName; // Usa o nome retornado pelo servidor
      updateUIForUser();
      // Recarrega os imóveis para atualizar os popups com o novo nome de proprietário
      loadInitialProperties();
      hideActionModal(); // Fecha o modal em caso de sucesso
    } catch (error) {
      showToast(`Erro ao alterar nome: ${error.message}`, 'error');
    }
  });
}

// Função para alterar a senha do usuário
async function handleChangePassword() {
  const formHtml = `
    <div class="modal-form-group">
      <label for="currentPasswordInput">Senha Atual</label>
      <input type="password" id="currentPasswordInput" name="currentPassword" required autocomplete="current-password">
    </div>
    <div class="modal-form-group">
      <label for="newPasswordInput">Nova Senha</label>
      <input type="password" id="newPasswordInput" name="newPassword" required autocomplete="new-password">
    </div>`;

  showActionModal('Alterar Senha', formHtml, async (formData) => {
    if (!formData.currentPassword || !formData.newPassword) {
      showToast('Ambos os campos de senha são obrigatórios.', 'error');
      return;
    }
    try {
      const result = await apiCall(`/api/users/${currentUser.id}/password`, { method: 'PUT', body: formData });
      showToast(result.message, 'success');
      hideActionModal(); // Fecha o modal em caso de sucesso
    } catch (error) {
      showToast(`Erro ao alterar senha: ${error.message}`, 'error');
    }
  });
}

// Função para excluir o usuário
async function handleDeleteUser() {
  const onConfirm = async () => {
    try {
      const data = await apiCall(`/api/users/${currentUser.id}`, { method: 'DELETE' });
      showToast(data.message, 'success');
      currentUser = null;
      updateUIForUser();
      loadInitialProperties(); // Recarrega para remover botões de edição
    } catch (error) {
      showToast(`Erro ao excluir conta: ${error.message}`, 'error');
      throw error; // Propaga para o handler do modal
    }
  };

  // Define a mensagem de confirmação, adicionando um aviso para proprietários
  let confirmationMessage = 'Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.';
  if (currentUser && currentUser.role === 'owner') {
    confirmationMessage += '<br><br><strong>AVISO:</strong> Todos os seus imóveis cadastrados também serão excluídos.';
  }

  showConfirmationModal(
    confirmationMessage,
    onConfirm
  );
}

// Adicionar eventos aos botões
document.getElementById('change-name-btn').addEventListener('click', handleChangeName);
document.getElementById('change-password-btn').addEventListener('click', handleChangePassword);
document.getElementById('delete-user-btn').addEventListener('click', handleDeleteUser);

// --- Funções de Autenticação ---
async function checkSession() {
  try {
    const data = await apiCall('/api/auth/session');
    currentUser = data.user;
  } catch (error) {
    currentUser = null;
  }
  updateUIForUser();
}

async function handleLogin(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const username = event.target.elements['login-username'].value;
  const password = event.target.elements['login-password'].value;
  toggleLoading(button, true);
  try {    
    const data = await apiCall('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    currentUser = data.user;
    updateUIForUser();
    loadInitialProperties(); // Recarrega os imóveis para atualizar as permissões
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    toggleLoading(button, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const username = event.target.elements['register-username'].value;
  const password = event.target.elements['register-password'].value;
  const role = event.target.elements['register-role'].value;
  toggleLoading(button, true);
  try {    
    const data = await apiCall('/api/auth/register', {
      method: 'POST',
      body: { username, password, role },
    });
    showToast(data.message, 'success');
    setTimeout(() => {
      registerForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      toggleLoginBtn.classList.add('active');
      toggleRegisterBtn.classList.remove('active');
    }, 2000);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    toggleLoading(button, false);
  }
}

async function handleLogout() {
  toggleLoading(logoutBtn, true);
  try {
    await apiCall('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    updateUIForUser();
    loadInitialProperties(); // Recarrega os imóveis
    showToast('Logout realizado com sucesso.', 'success');
  } catch (error) {
    showToast(`Erro ao fazer logout: ${error.message}`, 'error');
  } finally {
    toggleLoading(logoutBtn, false);
  }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  checkSession().then(loadInitialProperties);
});

map.on('click', handleMapClick);

document.getElementById('map').addEventListener('click', (event) => {
  const target = event.target;
  
  // Verifica se o clique foi em um botão dentro do popup
  const editButton = target.closest('.edit-btn');
  const removeButton = target.closest('.remove-btn');
  
  if (editButton) {
    const id = editButton.getAttribute('data-id');
    if (id) handleEditStart(id);
  } else if (removeButton) {
    const id = removeButton.getAttribute('data-id');
    if (id) handleDelete(id);
  }
});

function handleChangeLocationStart() {
    locationChangeActive = true;
    updateStatus('Clique no novo local do imóvel no mapa.', 'info');
    changeLocationBtn.disabled = true;
    changeLocationBtn.querySelector('span').textContent = 'Selecionando...';
}

function handleTransactionTypeChange() {
  const type = transactionTypeSelect.value;
  priceFieldsContainer.classList.remove('hidden');
  salePriceGroup.classList.add('hidden');
  rentalPriceGroup.classList.add('hidden');
  rentalPeriodGroup.classList.add('hidden');

  if (type === 'Vender' || type === 'Ambos') {
    salePriceGroup.classList.remove('hidden');
  }
  if (type === 'Alugar' || type === 'Ambos') {
    // A linha abaixo continha um erro de sintaxe que quebrava o script.
    // O event listener do campo de contato foi movido para uma área global para melhor performance.
    rentalPriceGroup.classList.remove('hidden');
    rentalPeriodGroup.classList.remove('hidden');
  }
}

mostrarFormBtn.addEventListener('click', togglePropertyForm);

toggleLoginBtn.addEventListener('click', () => {
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  toggleLoginBtn.classList.add('active');
  toggleRegisterBtn.classList.remove('active');
});

toggleRegisterBtn.addEventListener('click', () => {
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  toggleRegisterBtn.classList.add('active');
  toggleLoginBtn.classList.remove('active');
});

loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
logoutBtn.addEventListener('click', handleLogout);
saveEditBtn.addEventListener('click', handleEditSave);
cancelEditBtn.addEventListener('click', handleEditCancel);
changeLocationBtn.addEventListener('click', handleChangeLocationStart);
searchInput.addEventListener('input', filterProperties); // Listener para o campo de busca
transactionTypeSelect.addEventListener('change', handleTransactionTypeChange);
salePriceInput.addEventListener('input', () => formatCurrency(salePriceInput));
rentalPriceInput.addEventListener('input', () => formatCurrency(rentalPriceInput));
// Garante que o campo de WhatsApp aceite apenas números
contatoInput.addEventListener('input', () => {
  contatoInput.value = contatoInput.value.replace(/\D/g, '');
});

toggleAccountActionsBtn.addEventListener('click', () => {
  toggleAccountActionsBtn.classList.toggle('active');
  accountActionsContent.classList.toggle('hidden');
});


// --- Definição dos Ícones dos Marcadores no Mapa ---
function getPropertyMarkerIcon(propertyType) {
  // Configurações visuais do marcador
  const iconSize = [38, 38]; // Tamanho do ícone em pixels [largura, altura]
  const iconAnchor = [19, 38]; // Ponto do ícone que corresponde à localização (ponta inferior do pino)
  const popupAnchor = [0, -38]; // Ponto de onde o popup deve "sair" do ícone
  const pinColor = '#27ae60'; // Cor principal do pino (verde do tema)
  const iconColor = '#FFFFFF'; // Cor do ícone dentro do pino (branco)

  // Template SVG para o pino do mapa. `{icon_path}` será substituído pelo ícone específico.
  const pinTemplate = `
    <svg width="${iconSize[0]}" height="${iconSize[1]}" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
      <!-- Sombra suave para dar profundidade -->
      <path d="M19 38C19 38 35 24.822 35 16a16 16 0 1 0-32 0c0 8.822 16 22 16 22z" fill="rgba(0,0,0,0.25)" transform="translate(1, 0)"/>
      <!-- Corpo principal do pino -->
      <path d="M19 38C19 38 35 24.822 35 16a16 16 0 1 0-32 0c0 8.822 16 22 16 22z" fill="${pinColor}" stroke="#FFFFFF" stroke-width="2"/>
      <!-- Ícone centralizado (o viewBox do path é 16x16) -->
      <g fill="${iconColor}" transform="translate(11, 8)">
        {icon_path}
      </g>
    </svg>
  `;

  // Função para extrair apenas os elementos <path> de um SVG completo
  const getIconPath = (svgString) => {
    const match = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    return match ? match[1] : '';
  };

  // Função para criar um Data URL a partir de um conteúdo SVG, de forma segura para URLs
  const createSvgDataUrl = (svgContent) => {
    // Remove quebras de linha e espaços extras, e codifica para uso em URL
    const encodedSvg = encodeURIComponent(svgContent.trim().replace(/\s+/g, ' '));
    return `data:image/svg+xml,${encodedSvg}`;
  };

  let iconSvg = '';
  switch (propertyType) {
    case 'Apartamento':
      iconSvg = `<svg viewBox="0 0 16 16"><path d="M4 2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm2.5.5a.5.5 0 0 0 .5-.5h1a.5.5 0 0 0 .5.5v1a.5.5 0 0 0-.5.5h-1a.5.5 0 0 0-.5-.5v-1zM9 2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm2.5.5a.5.5 0 0 0 .5-.5h1a.5.5 0 0 0 .5.5v1a.5.5 0 0 0-.5.5h-1a.5.5 0 0 0-.5-.5v-1z"/><path d="M2 1a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V1zm2 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zm3 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zm3 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zm3 0v6.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V1h-2zM2 8.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5z"/></svg>`;
      break;
    case 'Casa':
      iconSvg = `<svg viewBox="0 0 16 16"><path d="M6.5 14.5v-3.505c0-.245.25-.495.5-.495h2c.25 0 .5.25.5.5v3.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5z"/></svg>`;
      break;
    case 'Casa de Piscina':
      iconSvg = `<svg viewBox="0 0 16 16"><path d="M8 16a6 6 0 0 0 6-6c0-1.655-1.122-2.904-2.432-4.362C10.254 4.176 8.75 2.503 8 0c0 0-6 5.686-6 10a6 6 0 0 0 6 6zM6.646 4.646c-.376.377-1.272 1.489-2.093 2.718.22-.333.44-.644.658-.926.218-.282.476-.543.77-.746.294-.203.64-.326 1.027-.326.387 0 .733.123 1.027.326.294.203.552.464.77.746.218.282.438.593.658.926-.82-1.229-1.717-2.341-2.093-2.718A1.96 1.96 0 0 0 8 4c-.464 0-.873.144-1.154.354z"/></svg>`;
      break;
    case 'Fazenda':
      iconSvg = `<svg viewBox="0 0 16 16"><path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.707 1.5z"/><path d="M12 9.793V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V9.793l-1 1V14.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V10.793l-1-1V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V9.793l4-4 4 4z"/></svg>`;
      break;
    case 'Ponto Comercial':
      iconSvg = `<svg viewBox="0 0 16 16"><path d="M2.97 1.35A1 1 0 0 1 3.73 1h8.54a1 1 0 0 1 .76.35L14.75 4H11V2H5v2H1.25L2.97 1.35zM1 5h14v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5zm6 0v2H5V5h2zm2 0v2h2V5H9zm2 3v2H9V8h2zm-2 0v2H7V8h2zm-2 0v2H5V8h2zm2 3v2H9v-2h2zm-2 0v2H7v-2h2z"/></svg>`;
      break;
    default:
      iconSvg = `<svg viewBox="0 0 16 16"><path d="M8 16s6-5.686 6-10A6 6 0 1 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`; // Ícone genérico
  }

  const iconPath = getIconPath(iconSvg);
  const finalSvg = pinTemplate.replace('{icon_path}', iconPath);

  return new L.Icon({
    iconUrl: createSvgDataUrl(finalSvg),
    iconSize: iconSize,
    iconAnchor: iconAnchor,
    popupAnchor: popupAnchor
  });
}

// Listeners do Modal
modalConfirmBtn.addEventListener('click', handleConfirmAction);
modalCancelBtn.addEventListener('click', hideConfirmationModal);
confirmationModal.addEventListener('click', (e) => {
    // Fecha o modal se o clique for no overlay (fundo)
    if (e.target === confirmationModal) {
        hideConfirmationModal();
    }
});

// Listeners do Modal de Ação
actionModalConfirmBtn.addEventListener('click', handleActionConfirm);
actionModalCancelBtn.addEventListener('click', hideActionModal);
actionModal.addEventListener('click', (e) => {
  if (e.target === actionModal) {
    hideActionModal();
  }
});
  }
};
