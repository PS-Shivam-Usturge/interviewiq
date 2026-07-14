const allowedKeys = process.env.API_KEYS
  ? process.env.API_KEYS.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

export function authMiddleware(req, res, next) {
  // Auth disabled when API_KEYS is not set (dev mode)
  if (allowedKeys.length === 0) return next();

  // Health endpoint always exempt
  if (req.method === "GET" && req.path === "/api/health") return next();

  const key = req.headers["x-api-key"];
  if (!key || !allowedKeys.includes(key)) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}
