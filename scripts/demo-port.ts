import { createServer } from "node:net";

/** Check before creating a database or rebuilding files used by a live Demo. */
export async function assertDemoPortAvailable(port = 3101): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`พอร์ต ${port} กำลังใช้งานอยู่ หากเป็น Demo ให้เปิด http://localhost:${port}/login ใช้รอบเดิมได้เลย`)));
    server.listen(port, "127.0.0.1", () => server.close(error => error ? reject(error) : resolve()));
  });
}
