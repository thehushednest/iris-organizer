const fs = require("node:fs/promises");
const path = require("node:path");
const Fastify = require("fastify");

function requireAuth(config, req) {
  if (!config.botApiToken) {
    return false;
  }

  const header = req.headers.authorization;
  if (!header) return false;
  const [scheme, token] = String(header).split(" ");
  return scheme && scheme.toLowerCase() === "bearer" && token === config.botApiToken;
}

async function startHttpServer(config, context) {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  app.get("/health", async () => {
    return {
      status: "ok",
      irisBaseUrl: config.irisBaseUrl,
      storageRoot: config.storageRoot,
      botName: config.botName,
    };
  });

  app.get("/qr", async (req, reply) => {
    if (!requireAuth(config, req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    try {
      const qr = await fs.readFile(path.join(config.logRoot, "latest-qr.txt"), "utf8");
      return { ok: true, qr };
    } catch {
      return reply.code(404).send({ error: "qr_not_available" });
    }
  });

  app.get("/documents/search", async (req, reply) => {
    if (!requireAuth(config, req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const query = req.query && req.query.q ? String(req.query.q).trim() : "";
    if (!query) {
      return reply.code(400).send({ error: "q is required" });
    }

    const results = await context.store.search(query);
    return {
      ok: true,
      count: results.length,
      results: results.map((item) => ({
        id: item.record.id,
        title: item.record.title,
        category: item.record.category,
        relativePath: item.record.relativePath,
        createdAt: item.record.createdAt,
      })),
    };
  });

  await app.listen({
    host: config.botHttpHost,
    port: config.botHttpPort,
  });

  console.log(`[http] Listening on ${config.botHttpHost}:${config.botHttpPort}`);
  return app;
}

module.exports = {
  startHttpServer,
};
