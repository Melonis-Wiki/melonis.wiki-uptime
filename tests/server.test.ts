import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";

async function freePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Sends a raw request line so the target reaches Node exactly as written. */
function rawStatusLine(port: number, target: string): Promise<string> {
  return new Promise((resolve) => {
    let out = "";
    const socket = net.connect(port, "127.0.0.1", () =>
      socket.end(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`),
    );
    socket.on("data", (chunk) => (out += chunk));
    socket.on("close", () => resolve(out.split("\r\n")[0]));
    socket.on("error", () => resolve("error"));
  });
}

test("malformed request targets get 400 and do not stop the server", { timeout: 30_000 }, async () => {
  const port = await freePort();
  // No REDIS_URL: the scheduler fails locally and nothing is probed.
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env: { PATH: process.env.PATH, NODE_ENV: "production", PORT: String(port), TSX_TSCONFIG_PATH: "./tsconfig.server.json" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (chunk: Buffer) => chunk.toString().includes("ready on") && resolve());
      child.once("exit", (code) => reject(new Error(`server exited early (${code})`)));
    });
    assert.match(await rawStatusLine(port, "//["), / 400 /);
    assert.match(await rawStatusLine(port, "//other.example/healthz"), / 400 /);
    assert.match(await rawStatusLine(port, "http://localhost/healthz"), / 400 /);
    assert.match(await rawStatusLine(port, "/healthz"), / 200 /);
    assert.equal(child.exitCode, null);
  } finally {
    child.kill();
    await once(child, "exit");
  }
});
