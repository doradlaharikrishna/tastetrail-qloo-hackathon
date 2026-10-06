import { handleTrail } from "../server.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" }).end("Method not allowed");
    return;
  }
  return handleTrail(request, response);
}
