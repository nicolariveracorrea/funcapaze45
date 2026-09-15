const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const clientsDir = path.join(rootDir, "clientes");
const clientsFile = path.join(clientsDir, "clientes.json");
const usersFile = path.join(rootDir, "usuarios.json");
const sessions = new Map();
const failedLogins = new Map();

const PASSWORD_HASH_ITERATIONS = 150000;
const PASSWORD_KEY_LENGTH = 64;

const demoAccounts = {
  user: { email: "usuario@reservas.com", password: "usuario123", label: "Usuario", role: "user" },
  admin: { email: "admin@reservas.com", password: "admin123", label: "Administrador", role: "admin" },
};

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
};

fs.mkdirSync(clientsDir, { recursive: true });
if (!fs.existsSync(clientsFile)) {
  fs.writeFileSync(clientsFile, "[]\n", "utf8");
}
if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, "[]\n", "utf8");
}

const readClients = () => JSON.parse(fs.readFileSync(clientsFile, "utf8"));
const writeClients = (clients) => fs.writeFileSync(clientsFile, `${JSON.stringify(clients, null, 2)}\n`, "utf8");
const readUsers = () => JSON.parse(fs.readFileSync(usersFile, "utf8"));
const writeUsers = (users) => fs.writeFileSync(usersFile, `${JSON.stringify(users, null, 2)}\n`, "utf8");

const sendJson = (response, statusCode, data, extraHeaders = {}) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...securityHeaders,
    ...extraHeaders,
  });
  response.end(JSON.stringify(data));
};

const parseCookies = (request) => {
  const cookies = {};
  const header = request.headers.cookie;
  if (!header) return cookies;

  header.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    if (!name) return;
    cookies[name.trim()] = decodeURIComponent(rest.join("=")).trim();
  });

  return cookies;
};

const createSessionToken = () => crypto.randomBytes(32).toString("hex");

const setSessionCookie = (response, token, request) => {
  const isHttps = request.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
  const cookieParts = [`session=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=86400"];
  if (isHttps) cookieParts.push("Secure");
  response.setHeader("Set-Cookie", cookieParts.join("; "));
};

const getSessionUser = (request) => {
  const cookies = parseCookies(request);
  const token = cookies.session;
  if (!token) return null;
  return sessions.get(token) || null;
};

const requireSession = (request, response) => {
  const sessionUser = getSessionUser(request);
  if (!sessionUser) {
    sendJson(response, 401, { error: "No autorizado. Inicia sesion nuevamente." });
    return null;
  }
  return sessionUser;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const passwordHash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_KEY_LENGTH, "sha256");
  return { salt, hash: passwordHash.toString("hex") };
};

const checkPassword = (password, storedHash, salt) => {
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_KEY_LENGTH, "sha256");
  return crypto.timingSafeEqual(Buffer.from(hash.toString("hex"), "hex"), Buffer.from(storedHash, "hex"));
};

const protectAgainstBruteforce = (request) => {
  const ip = request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempts = failedLogins.get(ip) || { count: 0, firstAttemptAt: now };

  if (attempts.count >= 5 && now - attempts.firstAttemptAt < 60_000) {
    return false;
  }

  if (now - attempts.firstAttemptAt > 60_000) {
    failedLogins.delete(ip);
  }

  return true;
};

const recordFailedLogin = (request) => {
  const ip = request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempts = failedLogins.get(ip) || { count: 0, firstAttemptAt: now };
  attempts.count += 1;
  attempts.firstAttemptAt = attempts.firstAttemptAt || now;
  failedLogins.set(ip, attempts);
};

const clearFailedLogin = (request) => {
  const ip = request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown";
  failedLogins.delete(ip);
};

const userExists = (email) => {
  const normalized = normalizeEmail(email);
  return readUsers().some((user) => normalizeEmail(user.email) === normalized) || normalized === demoAccounts.user.email;
};

const getUserFromStore = (email) => {
  const normalized = normalizeEmail(email);
  const stored = readUsers().find((user) => normalizeEmail(user.email) === normalized);
  if (stored) {
    const passwordData = stored.password || "";
    const hashInfo = String(passwordData).includes(":") ? passwordData.split(":") : null;
    return {
      ...stored,
      email: normalized,
      label: "Usuario",
      role: "user",
      password: stored.password,
      salt: hashInfo ? hashInfo[0] : null,
      passwordHash: hashInfo ? hashInfo[1] : null,
    };
  }

  if (normalized === demoAccounts.user.email) {
    return { ...demoAccounts.user, email: normalized, label: demoAccounts.user.label, role: "user" };
  }

  return null;
};

const parseJsonBody = (request) => new Promise((resolve, reject) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    if (!body.trim()) {
      resolve({});
      return;
    }

    try {
      resolve(JSON.parse(body));
    } catch (error) {
      reject(new Error("JSON invalido."));
    }
  });
  request.on("error", () => reject(new Error("Error leyendo la solicitud.")));
});

const serveFile = (request, response) => {
  const requestedPath = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.resolve(rootDir, `.${requestedPath}`);
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, securityHeaders);
    response.end("Not found");
    return;
  }

  const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    ...securityHeaders,
  });
  fs.createReadStream(filePath).pipe(response);
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/session") {
    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    sendJson(response, 200, { user: { role: sessionUser.role, email: sessionUser.email, label: sessionUser.label } });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const cookies = parseCookies(request);
    const token = cookies.session;
    if (token) sessions.delete(token);
    response.writeHead(200, {
      "Set-Cookie": "session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      ...securityHeaders,
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    try {
      const body = await parseJsonBody(request);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const role = String(body.role || "user");

      if (!email || !password) {
        sendJson(response, 400, { error: "Correo y contrasena son obligatorios." });
        return;
      }

      if (!protectAgainstBruteforce(request)) {
        sendJson(response, 429, { error: "Demasiados intentos. Espera 1 minuto antes de volver a intentar." });
        return;
      }

      if (role === "admin") {
        const admin = demoAccounts.admin;
        if (email !== admin.email || password !== admin.password) {
          recordFailedLogin(request);
          sendJson(response, 401, { error: "Credenciales de administrador invalidas." });
          return;
        }

        clearFailedLogin(request);
        const token = createSessionToken();
        sessions.set(token, { role: "admin", email: admin.email, label: admin.label });
        setSessionCookie(response, token, request);
        sendJson(response, 200, { user: { role: "admin", email: admin.email, label: admin.label } });
        return;
      }

      const user = getUserFromStore(email);
      const validPassword = user && (
        (user.password && String(user.password).includes(":") && user.salt && user.passwordHash && checkPassword(password, user.passwordHash, user.salt)) ||
        user.password === password
      );

      if (!user || !validPassword) {
        recordFailedLogin(request);
        sendJson(response, 401, { error: "Correo o contrasena incorrectos." });
        return;
      }

      clearFailedLogin(request);
      const token = createSessionToken();
      sessions.set(token, { role: "user", email: user.email, label: user.label });
      setSessionCookie(response, token, request);
      sendJson(response, 200, { user: { role: "user", email: user.email, label: user.label } });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Solicitud no valida." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/register") {
    try {
      const body = await parseJsonBody(request);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      if (!name) {
        sendJson(response, 400, { error: "El nombre es obligatorio." });
        return;
      }

      if (!/\S+@\S+\.\S+/.test(email)) {
        sendJson(response, 400, { error: "Ingresa un correo valido." });
        return;
      }

      if (password.length < 6) {
        sendJson(response, 400, { error: "La contrasena debe tener al menos 6 caracteres." });
        return;
      }

      if (userExists(email)) {
        sendJson(response, 409, { error: "Ese correo ya esta registrado." });
        return;
      }

      const users = readUsers();
      const { salt, hash } = hashPassword(password);
      users.push({ name, email, password: `${salt}:${hash}` });
      writeUsers(users);
      sendJson(response, 201, { ok: true, message: "Usuario registrado correctamente." });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "No se pudo registrar el usuario." });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/clients") {
    const sessionUser = requireSession(request, response);
    if (!sessionUser) return;
    sendJson(response, 200, readClients());
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/clients") {
    const sessionUser = requireSession(request, response);
    if (!sessionUser) return;

    try {
      const body = await parseJsonBody(request);
      const clients = body;
      if (!Array.isArray(clients)) throw new Error("Invalid clients data");
      writeClients(clients);
      sendJson(response, 200, clients);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  serveFile(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`funcapaze: http://localhost:${port}`);
});
