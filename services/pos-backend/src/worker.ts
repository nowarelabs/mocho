import { RpcTarget, newWorkersRpcResponse } from "capnweb";

class EchoServer extends RpcTarget {
  say(message: string): string {
    return `echo: ${message}`;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api") {
      return newWorkersRpcResponse(request, new EchoServer());
    }

    return new Response("Not found", { status: 404 });
  },
};
