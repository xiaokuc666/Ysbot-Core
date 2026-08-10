import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractPlg, hashFile, readPlgFile } from "../src/core/plg.js";

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([local, nameBuf, data]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));
    offset += localEntry.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}

test("plg reads manifest and extracts files", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-plg-"));
  const plgPath = path.join(dir, "demo.plg");
  const target = path.join(dir, "cache");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const buffer = createZip([
    ["plugin.json", JSON.stringify({ id: "demo", type: "capability" })],
    ["index.js", "export default class Demo {}"],
  ]);
  await fs.writeFile(plgPath, buffer);
  const manifest = readPlgFile(buffer, "plugin.json");
  assert.equal(JSON.parse(manifest.toString("utf8")).id, "demo");
  await extractPlg(plgPath, target);
  assert.match(
    await fs.readFile(path.join(target, "index.js"), "utf8"),
    /Demo/,
  );
  assert.match(await hashFile(plgPath), /^[a-f0-9]{64}$/);
});
