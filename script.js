const authScreen = document.getElementById("authScreen");
const appContent = document.getElementById("appContent");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const registerNameInput = document.getElementById("registerName");
const registerEmailInput = document.getElementById("registerEmail");
const registerPasswordInput = document.getElementById("registerPassword");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const togglePassword = document.getElementById("togglePassword");
const toggleRegisterPassword = document.getElementById("toggleRegisterPassword");
const toggleAuthMode = document.getElementById("toggleAuthMode");
const authModeLabel = document.getElementById("authModeLabel");
const logoutBtn = document.getElementById("logoutBtn");
const sessionRole = document.getElementById("sessionRole");
const sessionEmail = document.getElementById("sessionEmail");
const adminPanel = document.getElementById("adminPanel");
const clearReservationsBtn = document.getElementById("clearReservationsBtn");
const adminDashboard = document.getElementById("adminDashboard");
const reservationsChartPanel = document.getElementById("reservationsChartPanel");
const adminClientsPanel = document.getElementById("adminClientsPanel");
const adminClientCount = document.getElementById("adminClientCount");
const clientTableBody = document.getElementById("clientTableBody");
const clientSearch = document.getElementById("clientSearch");
const showArchivedClients = document.getElementById("showArchivedClients");
const loyaltyPanel = document.getElementById("loyaltyPanel");
const stampList = document.getElementById("stampList");
const stampCount = document.getElementById("stampCount");
const loyaltyMessage = document.getElementById("loyaltyMessage");
const rewardStatus = document.getElementById("rewardStatus");
const roleTabs = document.querySelectorAll(".role-tab");

let selectedRole = "user";
let authMode = "login";

const demoAccounts = {
  user: { email: "usuario@reservas.com", password: "usuario123", label: "Usuario" },
  admin: { email: "admin@reservas.com", password: "admin123", label: "Administrador" },
};

const registeredUsersKey = "courtRegisteredUsers";

const getRegisteredUsers = () => JSON.parse(localStorage.getItem(registeredUsersKey) || "[]");
const saveRegisteredUsers = (users) => localStorage.setItem(registeredUsersKey, JSON.stringify(users));

const getUserAccountByEmail = (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const registeredUser = getRegisteredUsers().find((user) => user.email.toLowerCase() === normalizedEmail);
  if (registeredUser) {
    return { email: registeredUser.email.toLowerCase(), password: registeredUser.password, label: "Usuario" };
  }

  if (normalizedEmail === demoAccounts.user.email) {
    return demoAccounts.user;
  }

  return null;
};

const setAuthMode = (mode) => {
  authMode = mode;
  const isRegister = mode === "register";
  const isAdmin = selectedRole === "admin";

  loginForm.classList.toggle("is-hidden", isRegister);
  registerForm.classList.toggle("is-hidden", !isRegister || isAdmin);
  authModeLabel.textContent = isRegister ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
  toggleAuthMode.textContent = isRegister ? "Iniciar sesion" : "Crear cuenta";

  if (isAdmin) {
    authModeLabel.textContent = "¿No tienes cuenta?";
    toggleAuthMode.textContent = "Crear cuenta";
    loginError.textContent = "";
    registerError.textContent = "";
  }
};

const setSession = (account) => {
  sessionStorage.setItem("courtSession", JSON.stringify(account));
  authScreen.classList.add("is-hidden");
  appContent.classList.remove("is-hidden");
  sessionRole.textContent = account.label;
  sessionEmail.textContent = account.email;
  const isAdmin = account.role === "admin";
  adminPanel.classList.toggle("is-hidden", !isAdmin);
  adminDashboard.classList.toggle("is-hidden", !isAdmin);
  reservationsChartPanel.classList.toggle("is-hidden", !isAdmin);
  adminClientsPanel.classList.toggle("is-hidden", !isAdmin);
  loyaltyPanel.classList.toggle("is-hidden", account.role === "admin");
  loadLoyalty(account.email);
  renderAdminClients();
  if (!isAdmin) {
    syncClientsFromServer();
  }
};

const endSession = () => {
  sessionStorage.removeItem("courtSession");
  appContent.classList.add("is-hidden");
  authScreen.classList.remove("is-hidden");
  loginForm.reset();
  registerForm.reset();
  loginError.textContent = "";
  registerError.textContent = "";
  setAuthMode("login");
};

roleTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectedRole = tab.dataset.role;
    roleTabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    loginError.textContent = "";
    registerError.textContent = "";
    if (selectedRole === "admin") {
      setAuthMode("login");
      return;
    }
    setAuthMode(authMode === "register" ? "register" : "login");
  });
});

togglePassword.addEventListener("click", () => {
  const showingPassword = loginPasswordInput.type === "text";
  loginPasswordInput.type = showingPassword ? "password" : "text";
  togglePassword.textContent = showingPassword ? "Ver" : "Ocultar";
});

toggleRegisterPassword.addEventListener("click", () => {
  const showingPassword = registerPasswordInput.type === "text";
  registerPasswordInput.type = showingPassword ? "password" : "text";
  toggleRegisterPassword.textContent = showingPassword ? "Ver" : "Ocultar";
});

toggleAuthMode.addEventListener("click", () => {
  if (selectedRole === "admin") {
    return;
  }
  setAuthMode(authMode === "login" ? "register" : "login");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = loginEmailInput.value.trim().toLowerCase();
  const password = loginPasswordInput.value;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role: selectedRole }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      loginError.textContent = data.error || "No se pudo iniciar sesion.";
      return;
    }

    setSession({ role: data.user.role, email: data.user.email, label: data.user.label });
  } catch (error) {
    loginError.textContent = "No se pudo iniciar sesion. Intenta de nuevo.";
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = registerNameInput.value.trim();
  const email = registerEmailInput.value.trim().toLowerCase();
  const password = registerPasswordInput.value;

  if (!name) {
    registerError.textContent = "Escribe tu nombre completo.";
    registerNameInput.focus();
    return;
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    registerError.textContent = "Ingresa un correo valido.";
    registerEmailInput.focus();
    return;
  }

  if (password.length < 6) {
    registerError.textContent = "La contrasena debe tener al menos 6 caracteres.";
    registerPasswordInput.focus();
    return;
  }

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      registerError.textContent = data.error || "No se pudo crear la cuenta.";
      return;
    }

    const users = getRegisteredUsers();
    const alreadyStored = users.some((user) => user.email.toLowerCase() === email);
    if (!alreadyStored) {
      users.push({ name, email, password });
      saveRegisteredUsers(users);
    }

    registerForm.reset();
    setAuthMode("login");
    loginEmailInput.value = email;
    loginPasswordInput.value = password;
    loginError.textContent = "Cuenta creada correctamente. Ya puedes iniciar sesion.";
    registerError.textContent = "";
  } catch (error) {
    registerError.textContent = "No se pudo crear la cuenta. Intenta de nuevo.";
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch (error) {
    // no-op
  }
  endSession();
});

const toast = document.getElementById("toast");
const waNumberInput = document.getElementById("waNumber");
const bookingForm = document.getElementById("bookingForm");
const bookingDateInput = document.getElementById("bookingDate");
const courtSelect = document.getElementById("courtSelect");
const timeSelect = document.getElementById("timeSelect");
const customerNameInput = document.getElementById("customerName");
const customerPhoneInput = document.getElementById("customerPhone");
const customerEmailInput = document.getElementById("customerEmail");
const totalReservationsEl = document.getElementById("totalReservations");
const availableCourtsEl = document.getElementById("availableCourts");
const availabilityList = document.getElementById("availabilityList");
const reserveMainBtn = document.getElementById("reserveMainBtn");
const reservationsChart = document.getElementById("reservationsChart");
const surveyModal = document.getElementById("surveyModal");
const surveyForm = document.getElementById("surveyForm");
const surveyReason = document.getElementById("surveyReason");
const surveyExperience = document.getElementById("surveyExperience");
const surveyComment = document.getElementById("surveyComment");
const closeSurveyBtn = document.getElementById("closeSurveyBtn");

const loyaltyKey = (email) => `courtLoyalty:${email}`;
const clientsKey = "courtClients";
let loyaltyState = { stamps: 0, rewardAvailable: false };
let pendingReservation = null;

const getClients = () => JSON.parse(localStorage.getItem(clientsKey) || "[]");
const clientsApiUrl = "/api/clients";

const saveClients = (clients) => {
  localStorage.setItem(clientsKey, JSON.stringify(clients));

  if (!sessionStorage.getItem("courtSession")) {
    return;
  }

  fetch(clientsApiUrl, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clients),
  }).catch(() => {});
};

const syncClientsFromServer = async () => {
  if (!sessionStorage.getItem("courtSession")) {
    return;
  }

  try {
    const response = await fetch(clientsApiUrl, { credentials: "same-origin" });
    if (!response.ok) throw new Error("No se pudo leer el archivo de clientes");
    const serverClients = await response.json();
    const localClients = getClients();
    const clients = serverClients.length === 0 && localClients.length > 0 ? localClients : serverClients;
    saveClients(clients);
    renderAdminClients();
  } catch (error) {
    renderAdminClients();
  }
};

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  return entities[character];
});

const renderAdminClients = () => {
  const allClients = getClients();
  const searchTerm = clientSearch.value.trim().toLowerCase();
  const clients = allClients.filter((client) => {
    const matchesArchive = showArchivedClients.checked ? client.archived : !client.archived;
    const searchable = `${client.name} ${client.email} ${client.phone}`.toLowerCase();
    return matchesArchive && searchable.includes(searchTerm);
  });
  const activeCount = allClients.filter((client) => !client.archived).length;
  adminClientCount.textContent = `${activeCount} ${activeCount === 1 ? "cliente activo" : "clientes activos"}`;

  if (clients.length === 0) {
    const emptyMessage = showArchivedClients.checked ? "No hay clientes archivados." : "Todavia no hay clientes activos.";
    clientTableBody.innerHTML = `<tr><td colspan="6" class="empty-client-table">${emptyMessage}</td></tr>`;
    return;
  }

  clientTableBody.innerHTML = clients
    .map((client) => `
      <tr>
        <td><strong>${escapeHtml(client.name)}</strong></td>
        <td><span>${escapeHtml(client.email)}</span><small>${escapeHtml(client.phone)}</small></td>
        <td>${client.reservations}</td>
        <td><strong>${client.stamps}/10</strong></td>
        <td><span class="client-status ${client.rewardAvailable ? "reward-ready" : ""}">${client.rewardAvailable ? "Hora gratis disponible" : "En progreso"}</span></td>
        <td class="payment-actions">
          ${client.paid
            ? `<span class="paid-status">Pagado</span>${client.archived ? '<span class="archived-status">Archivado</span>' : `<button class="archive-client-btn" type="button" data-client-action="archive" data-client-email="${escapeHtml(client.email)}">Archivar</button>`}`
            : `<button class="payment-btn" type="button" data-client-action="paid" data-client-email="${escapeHtml(client.email)}">Marcar pagado</button><button class="delete-client-btn" type="button" data-client-action="delete" data-client-email="${escapeHtml(client.email)}">Eliminar</button>`}
        </td>
      </tr>
    `)
    .join("");
};

clientTableBody.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-client-action]");
  if (!actionButton) return;

  const email = actionButton.dataset.clientEmail;
  const clients = getClients();
  const clientIndex = clients.findIndex((client) => client.email === email);
  if (clientIndex === -1) return;

  if (actionButton.dataset.clientAction === "paid") {
    clients[clientIndex].paid = true;
    saveClients(clients);
    renderAdminClients();
    showToast("Cliente marcado como pagado");
    return;
  }

  if (actionButton.dataset.clientAction === "delete" && !clients[clientIndex].paid) {
    clients.splice(clientIndex, 1);
    saveClients(clients);
    renderAdminClients();
    showToast("Cliente eliminado de la lista");
    return;
  }

  if (actionButton.dataset.clientAction === "archive" && clients[clientIndex].paid) {
    clients[clientIndex].archived = true;
    saveClients(clients);
    renderAdminClients();
    showToast("Cliente guardado en la carpeta de clientes");
  }
});

const saveClientReservation = (name, phone, email) => {
  const clients = getClients();
  const normalizedEmail = email.toLowerCase();
  let client = clients.find((item) => item.email === normalizedEmail);

  if (!client) {
    client = { name, phone, email: normalizedEmail, reservations: 0, stamps: 0, rewardAvailable: false, paid: false, archived: false };
    clients.push(client);
  }

  client.name = name;
  client.phone = phone;
  client.reservations += 1;
  client.stamps = loyaltyState.stamps;
  client.rewardAvailable = loyaltyState.rewardAvailable;
  client.archived = false;
  saveClients(clients);
  renderAdminClients();
};

const saveLoyalty = () => {
  const savedSession = sessionStorage.getItem("courtSession");
  if (savedSession) {
    const account = JSON.parse(savedSession);
    localStorage.setItem(loyaltyKey(account.email), JSON.stringify(loyaltyState));
  }
};

const renderLoyalty = () => {
  stampList.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const completed = index < loyaltyState.stamps;
    return `<span class="stamp ${completed ? "completed" : ""}" aria-label="Sello ${index + 1} ${completed ? "completado" : "pendiente"}">${completed ? "✓" : index + 1}</span>`;
  }).join("");
  stampCount.textContent = `${loyaltyState.stamps}/10`;

  if (loyaltyState.rewardAvailable) {
    loyaltyMessage.textContent = "Felicitaciones, ganaste una hora gratis.";
    rewardStatus.textContent = "Tu hora gratis se aplicara automaticamente en tu proxima reserva.";
    rewardStatus.classList.add("unlocked");
  } else {
    const remaining = 10 - loyaltyState.stamps;
    loyaltyMessage.textContent = "Reserva y acumula sellos para ganar una hora gratis.";
    rewardStatus.textContent = `Te faltan ${remaining} ${remaining === 1 ? "sello" : "sellos"} para desbloquear tu hora gratis.`;
    rewardStatus.classList.remove("unlocked");
  }
};

const loadLoyalty = (email) => {
  const savedLoyalty = localStorage.getItem(loyaltyKey(email));
  loyaltyState = savedLoyalty ? JSON.parse(savedLoyalty) : { stamps: 0, rewardAvailable: false };
  renderLoyalty();
};

const addLoyaltyStamp = () => {
  if (loyaltyState.rewardAvailable) return;
  loyaltyState.stamps += 1;
  if (loyaltyState.stamps === 10) {
    loyaltyState.rewardAvailable = true;
  }
  saveLoyalty();
  renderLoyalty();
};

clearReservationsBtn.addEventListener("click", () => {
  courtState.forEach((court) => {
    court.reserved = false;
    court.reservedRange = "";
  });
  reservationCount = 0;
  Object.keys(reservationsByHour).forEach((hour) => {
    reservationsByHour[hour] = 0;
  });
  localStorage.removeItem(clientsKey);
  renderCourtOptions();
  renderAvailability();
  updateDashboard();
  renderReservationsChart();
  renderAdminClients();
  showToast("Reservas limpiadas correctamente");
});

clientSearch.addEventListener("input", renderAdminClients);
showArchivedClients.addEventListener("change", renderAdminClients);

const PRICE = 100000;
const OPEN_HOUR = 8;
const CLOSE_HOUR = 22;
const TOTAL_COURTS = 10;

const courtState = Array.from({ length: TOTAL_COURTS }, (_, idx) => ({
  number: idx + 1,
  reserved: false,
  reservedRange: "",
}));
let reservationCount = 0;
const reservationsByHour = {};

for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
  reservationsByHour[hour] = 0;
}

const formatPrice = (value) =>
  value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

const sanitizePhone = (phone) => phone.replace(/\D/g, "");
const isValidEmail = (email) => /\S+@\S+\.\S+/.test(email);

const toHourLabel = (hour) => {
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  let normalHour = hour % 12;
  if (normalHour === 0) normalHour = 12;
  return `${normalHour}:00 ${suffix}`;
};

const buildHourOptions = () => {
  const options = [];
  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
    options.push({
      value: String(hour),
      label: `${toHourLabel(hour)} - ${toHourLabel(hour + 1)}`,
    });
  }
  return options;
};

const setupDateField = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;

  bookingDateInput.min = today;
  bookingDateInput.value = today;
};

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
};

const renderTimeOptions = () => {
  const options = buildHourOptions();
  timeSelect.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
};

const renderCourtOptions = () => {
  const available = courtState.filter((court) => !court.reserved);
  courtSelect.innerHTML = available
    .map((court) => `<option value="${court.number}">Cancha ${court.number}</option>`)
    .join("");

  const allReserved = available.length === 0;
  courtSelect.disabled = allReserved;
  timeSelect.disabled = allReserved;
  reserveMainBtn.disabled = allReserved;

  if (allReserved) {
    courtSelect.innerHTML = '<option value="">No hay canchas disponibles</option>';
  }
};

const renderAvailability = () => {
  availabilityList.innerHTML = courtState
    .map((court) => {
      if (!court.reserved) {
        return `<article class="availability-item available">Cancha ${court.number}<small>Disponible</small></article>`;
      }
      return `<article class="availability-item reserved">Cancha ${court.number}<small>Reservada: ${court.reservedRange}</small></article>`;
    })
    .join("");
};

const updateDashboard = () => {
  const availableCount = courtState.filter((court) => !court.reserved).length;
  totalReservationsEl.textContent = String(reservationCount);
  availableCourtsEl.textContent = String(availableCount);
};

const renderReservationsChart = () => {
  const hours = Object.keys(reservationsByHour).map(Number);
  const maxReservations = Math.max(1, ...Object.values(reservationsByHour));

  if (hours.length === 0) {
    reservationsChart.innerHTML = '<p class="line-empty">Sin datos de reservas.</p>';
    return;
  }

  const width = 780;
  const height = 230;
  const padLeft = 24;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 34;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const stepX = hours.length > 1 ? plotWidth / (hours.length - 1) : 0;

  const points = hours.map((hour, index) => {
    const value = reservationsByHour[hour];
    const x = padLeft + index * stepX;
    const y = padTop + (1 - value / maxReservations) * plotHeight;
    return { hour, value, x, y };
  });

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padTop + ratio * plotHeight;
      return `<line class="line-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" />`;
    })
    .join("");

  const pointNodes = points
    .map(
      (point) => `
      <circle class="line-point" cx="${point.x}" cy="${point.y}" r="4" />
      <text class="line-point-label" x="${point.x}" y="${point.y - 8}" text-anchor="middle">${point.value}</text>
      <text class="line-x-label" x="${point.x}" y="${height - 10}" text-anchor="middle">${toHourLabel(point.hour).replace(":00 ", "")}</text>
    `
    )
    .join("");

  reservationsChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico de lineas de personas reservadas por horario">
      ${grid}
      <line class="line-axis" x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" />
      <polyline class="line-path" points="${polylinePoints}" />
      ${pointNodes}
    </svg>
  `;
};

const openWhatsAppReservation = (
  courtNumber,
  selectedHour,
  bookingDate,
  customerName,
  customerPhone,
  customerEmail,
  survey
) => {
  const waNumber = sanitizePhone(waNumberInput.value || "");

  if (!waNumber || waNumber.length < 10) {
    showToast("Ingresa un numero de WhatsApp valido (ejemplo: 573001112233)");
    waNumberInput.focus();
    return;
  }

  const range = `${toHourLabel(selectedHour)} - ${toHourLabel(selectedHour + 1)}`;
  const message = [
    "Hola, quiero reservar una cancha.",
    `Persona: ${reservationCount + 1}`,
    `Nombre: ${customerName}`,
    `Fecha: ${bookingDate}`,
    `Cancha: ${courtNumber}`,
    `Horario: ${range}`,
    `Telefono: ${customerPhone}`,
    `Correo: ${customerEmail}`,
    `Motivo: ${survey.reason}`,
    `Como nos conociste: ${survey.experience}`,
    `Comentario: ${survey.comment || "Sin comentario"}`,
    `Precio: ${loyaltyState.rewardAvailable ? "HORA GRATIS - Premio por 10 sellos" : `${formatPrice(PRICE)} por hora`}`,
  ].join("\n");

  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");
  return range;
};

const closeSurvey = () => {
  pendingReservation = null;
  surveyForm.reset();
  surveyModal.classList.add("is-hidden");
};

closeSurveyBtn.addEventListener("click", closeSurvey);

surveyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingReservation) return;

  const reservation = pendingReservation;
  const range = openWhatsAppReservation(
    reservation.courtNumber,
    reservation.selectedHour,
    reservation.bookingDate,
    reservation.customerName,
    reservation.customerPhone,
    reservation.customerEmail,
    {
      reason: surveyReason.value,
      experience: surveyExperience.value,
      comment: surveyComment.value.trim(),
    }
  );
  if (!range) return;

  reservation.selectedCourt.reserved = true;
  reservation.selectedCourt.reservedRange = `${reservation.bookingDate} ${range}`;
  reservationCount += 1;
  reservationsByHour[reservation.selectedHour] += 1;

  if (loyaltyState.rewardAvailable) {
    loyaltyState = { stamps: 0, rewardAvailable: false };
    saveLoyalty();
    renderLoyalty();
  } else {
    addLoyaltyStamp();
  }
  saveClientReservation(reservation.customerName, reservation.customerPhone, reservation.customerEmail);
  renderCourtOptions();
  renderAvailability();
  updateDashboard();
  renderReservationsChart();
  closeSurvey();
  showToast(`Reserva enviada para Cancha ${reservation.courtNumber}`);
});

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const selectedCourtNumber = Number(courtSelect.value);
  const selectedHour = Number(timeSelect.value);
  const bookingDate = bookingDateInput.value;
  const customerName = (customerNameInput.value || "").trim();
  const customerPhone = sanitizePhone(customerPhoneInput.value || "");
  const customerEmail = (customerEmailInput.value || "").trim();
  const selectedCourt = courtState.find((court) => court.number === selectedCourtNumber);

  if (!bookingDate) {
    showToast("Selecciona una fecha para reservar.");
    bookingDateInput.focus();
    return;
  }

  if (!customerName) {
    showToast("Ingresa tu nombre.");
    customerNameInput.focus();
    return;
  }

  if (!customerPhone || customerPhone.length < 7) {
    showToast("Ingresa un telefono valido.");
    customerPhoneInput.focus();
    return;
  }

  if (!isValidEmail(customerEmail)) {
    showToast("Ingresa un correo valido.");
    customerEmailInput.focus();
    return;
  }

  if (!selectedCourt || selectedCourt.reserved) {
    showToast("Esa cancha ya no esta disponible, elige otra.");
    renderCourtOptions();
    return;
  }

  pendingReservation = {
    selectedCourt,
    courtNumber: selectedCourtNumber,
    selectedHour,
    bookingDate,
    customerName,
    customerPhone,
    customerEmail,
  };
  surveyModal.classList.remove("is-hidden");
  surveyReason.focus();
});

setupDateField();
renderTimeOptions();
renderCourtOptions();
renderAvailability();
updateDashboard();
renderReservationsChart();

const initializeApp = async () => {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (!response.ok) {
      sessionStorage.removeItem("courtSession");
      setAuthMode("login");
      return;
    }

    const data = await response.json();
    if (data.user) {
      setSession({ role: data.user.role, email: data.user.email, label: data.user.label });
    }
  } catch (error) {
    sessionStorage.removeItem("courtSession");
    setAuthMode("login");
  }
};

setAuthMode("login");
initializeApp();
