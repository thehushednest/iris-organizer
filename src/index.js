const { loadConfig } = require("./config");
const { OrganizerService } = require("./service");

async function main() {
  const config = loadConfig();
  const service = new OrganizerService(config);

  service.on("log", (message) => console.log(message));
  service.on("status", (payload) => {
    if (payload.status) {
      console.log(`[status] ${payload.status}`);
    }
  });

  await service.start();
}

main().catch((error) => {
  console.error("[app] Fatal error", error);
  process.exit(1);
});
