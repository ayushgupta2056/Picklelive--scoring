import http from "node:http";
import { createApp } from "./app";
import { initRealtime } from "./realtime";
import { env } from "./env";
import { prisma } from "./db";

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

server.listen(env.port, () => {
  console.log(`PickleLive listening on :${env.port}`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
