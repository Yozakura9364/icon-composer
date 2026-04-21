#!/usr/bin/env node
/**
 * Strip OpenType layout tables (GSUB/GPOS/GDEF/BASE/JSTF) from a TTF/OTF.
 * Usage:
 *   node scripts/strip-font-layout.js <input-font> <output-font>
 */

const fs = require('fs');
const path = require('path');

const DROP_TABLES = new Set(['GSUB', 'GPOS', 'GDEF', 'BASE', 'JSTF', 'morx', 'mort', 'kerx', 'opbd', 'prop', 'trak', 'just']);

function u32(v) {
  return v >>> 0;
}

function calcSearchParams(numTables) {
  let maxPow2 = 1;
  let entrySelector = 0;
  while (maxPow2 * 2 <= numTables) {
    maxPow2 *= 2;
    entrySelector += 1;
  }
  const searchRange = maxPow2 * 16;
  const rangeShift = numTables * 16 - searchRange;
  return { searchRange, entrySelector, rangeShift };
}

function checksumTable(tableBuf) {
  const paddedLen = (tableBuf.length + 3) & ~3;
  let sum = 0;
  for (let i = 0; i < paddedLen; i += 4) {
    const b0 = i < tableBuf.length ? tableBuf[i] : 0;
    const b1 = i + 1 < tableBuf.length ? tableBuf[i + 1] : 0;
    const b2 = i + 2 < tableBuf.length ? tableBuf[i + 2] : 0;
    const b3 = i + 3 < tableBuf.length ? tableBuf[i + 3] : 0;
    const word = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = u32(sum + word);
  }
  return sum;
}

function checksumBuffer(buf) {
  let sum = 0;
  const paddedLen = (buf.length + 3) & ~3;
  for (let i = 0; i < paddedLen; i += 4) {
    const b0 = i < buf.length ? buf[i] : 0;
    const b1 = i + 1 < buf.length ? buf[i + 1] : 0;
    const b2 = i + 2 < buf.length ? buf[i + 2] : 0;
    const b3 = i + 3 < buf.length ? buf[i + 3] : 0;
    const word = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = u32(sum + word);
  }
  return sum;
}

function parseTables(src) {
  if (src.length < 12) throw new Error('Invalid sfnt: too short');
  const sfntVersion = src.readUInt32BE(0);
  const numTables = src.readUInt16BE(4);
  const out = [];
  const dirEnd = 12 + numTables * 16;
  if (dirEnd > src.length) throw new Error('Invalid sfnt: broken table directory');
  for (let i = 0; i < numTables; i += 1) {
    const o = 12 + i * 16;
    const tag = src.toString('ascii', o, o + 4);
    const offset = src.readUInt32BE(o + 8);
    const length = src.readUInt32BE(o + 12);
    if (offset + length > src.length) throw new Error(`Invalid sfnt: table ${tag} out of range`);
    out.push({ tag, offset, length, data: src.slice(offset, offset + length) });
  }
  return { sfntVersion, tables: out };
}

function rebuildFont(sfntVersion, tables) {
  const keep = tables.filter(t => !DROP_TABLES.has(t.tag));
  if (!keep.length) throw new Error('No tables left after stripping');

  const sorted = keep.slice().sort((a, b) => a.tag.localeCompare(b.tag));
  const numTables = sorted.length;
  const { searchRange, entrySelector, rangeShift } = calcSearchParams(numTables);

  const headerSize = 12 + numTables * 16;
  const records = [];
  const chunks = [];
  let cursor = headerSize;
  let headRecord = null;

  for (const t of sorted) {
    let data = Buffer.from(t.data);
    if (t.tag === 'head') {
      // head.checkSumAdjustment (offset 8) must be zero during checksum calculation.
      data = Buffer.from(data);
      if (data.length < 12) throw new Error('Invalid head table');
      data.writeUInt32BE(0, 8);
    }
    const offset = cursor;
    const length = data.length;
    const checkSum = checksumTable(data);
    records.push({ tag: t.tag, checkSum, offset, length });
    chunks.push({ data, length });
    if (t.tag === 'head') headRecord = { offset, length };
    cursor += (length + 3) & ~3;
  }

  if (!headRecord) throw new Error('Missing head table after stripping');

  const out = Buffer.alloc(cursor, 0);
  out.writeUInt32BE(sfntVersion >>> 0, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(rangeShift, 10);

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const ro = 12 + i * 16;
    out.write(r.tag, ro, 4, 'ascii');
    out.writeUInt32BE(r.checkSum >>> 0, ro + 4);
    out.writeUInt32BE(r.offset >>> 0, ro + 8);
    out.writeUInt32BE(r.length >>> 0, ro + 12);
  }

  for (const c of chunks) {
    const rec = records[chunks.indexOf(c)];
    c.data.copy(out, rec.offset);
  }

  const total = checksumBuffer(out);
  const adjustment = u32(0xB1B0AFBA - total);
  out.writeUInt32BE(adjustment >>> 0, headRecord.offset + 8);

  return out;
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/strip-font-layout.js <input-font> <output-font>');
    process.exit(1);
  }

  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);
  const src = fs.readFileSync(absIn);
  const { sfntVersion, tables } = parseTables(src);
  const dst = rebuildFont(sfntVersion, tables);
  fs.writeFileSync(absOut, dst);
  const dropped = tables.map(t => t.tag).filter(tag => DROP_TABLES.has(tag));
  console.log(`Wrote ${absOut}`);
  console.log(`Dropped tables: ${dropped.length ? dropped.join(', ') : '(none)'}`);
}

main();
