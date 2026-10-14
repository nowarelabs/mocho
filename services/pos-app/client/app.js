import { newWebSocketRpcSession } from "capnweb";

const { backendUrl } = await fetch("/config.json").then((res) => res.json());

const api = newWebSocketRpcSession(backendUrl);

const form = document.getElementById("echo");
const output = document.getElementById("output");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = new FormData(form).get("message");
  output.textContent = "…";
  try {
    output.textContent = await api.say(message);
  } catch (error) {
    output.textContent = `error: ${error}`;
  }
});
