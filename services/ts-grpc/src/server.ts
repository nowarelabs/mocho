import { loadSync } from "@grpc/proto-loader";
import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
} from "@grpc/grpc-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT ?? "50050";

const packageDefinition = loadSync(
  path.join(dirname, "..", "proto", "echo.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  },
);

const proto = loadPackageDefinition(packageDefinition);
const echo = (proto as any).echo;

const server = new Server();

server.addService(echo.Echo.service, {
  say: (call: any, callback: any) => {
    callback(null, { message: `echo: ${call.request.message}` });
  },
});

server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), () => {
  console.log(`ts-grpc listening on 0.0.0.0:${port}`);
  server.start();
});
