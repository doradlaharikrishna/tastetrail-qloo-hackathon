export default function handler(request, response) {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end("Method not allowed");
    return;
  }
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify({ mode: process.env.QLOO_API_KEY ? "live" : "preview" }));
}
