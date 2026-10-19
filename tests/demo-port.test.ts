import { createServer } from "node:net";
import { expect, it } from "vitest";
import { assertDemoPortAvailable } from "../scripts/demo-port";

it("refuses a busy Demo port before changing build files or database state", async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try { await expect(assertDemoPortAvailable(address.port)).rejects.toThrow(`พอร์ต ${address.port} กำลังใช้งานอยู่`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  await expect(assertDemoPortAvailable(address.port)).resolves.toBeUndefined();
});
