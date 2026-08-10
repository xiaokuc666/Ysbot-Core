import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const EOCD_HEADER = 0x06054b50;

function readUInt16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function findEocd(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32LE(buffer, offset) === EOCD_HEADER) return offset;
  }
  throw new Error("无效的 .plg 文件: 找不到 ZIP 结束标记");
}

function parseCentralEntries(buffer, eocdOffset) {
  const count = readUInt16LE(buffer, eocdOffset + 10);
  let offset = readUInt32LE(buffer, eocdOffset + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (readUInt32LE(buffer, offset) !== CENTRAL_HEADER) {
      throw new Error("无效的 .plg 文件: 中央目录损坏");
    }
    const method = readUInt16LE(buffer, offset + 10);
    const compressedSize = readUInt32LE(buffer, offset + 20);
    const uncompressedSize = readUInt32LE(buffer, offset + 24);
    const nameLength = readUInt16LE(buffer, offset + 28);
    const extraLength = readUInt16LE(buffer, offset + 30);
    const commentLength = readUInt16LE(buffer, offset + 32);
    const localOffset = readUInt32LE(buffer, offset + 42);
    const name = buffer.toString(
      "utf8",
      offset + 46,
      offset + 46 + nameLength,
    );
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntryData(buffer, entry) {
  if (readUInt32LE(buffer, entry.localOffset) !== LOCAL_HEADER) {
    throw new Error("无效的 .plg 文件: 本地文件头损坏");
  }
  const nameLength = readUInt16LE(buffer, entry.localOffset + 26);
  const extraLength = readUInt16LE(buffer, entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`不支持的压缩方式: ${entry.method}`);
}

export function readPlgEntries(buffer) {
  const eocdOffset = findEocd(buffer);
  return parseCentralEntries(buffer, eocdOffset).map((entry) => ({
    ...entry,
    data: readEntryData(buffer, entry),
  }));
}

export function readPlgFile(buffer, name) {
  const entry = readPlgEntries(buffer).find((item) => item.name === name);
  if (!entry) return null;
  return entry.data;
}

export async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function extractPlg(filePath, targetDir) {
  const buffer = await fs.readFile(filePath);
  const entries = readPlgEntries(buffer);
  await fs.mkdir(targetDir, { recursive: true });
  for (const entry of entries) {
    const normalized = path.normalize(entry.name).replace(/^[/\\]+/, "");
    if (!normalized || normalized === ".") continue;
    if (path.isAbsolute(normalized) || normalized.split(/[\\/]/).includes("..")) {
      throw new Error("非法路径: " + entry.name);
    }
    const target = path.join(targetDir, normalized);
    if (entry.name.endsWith("/")) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.data);
  }
}
