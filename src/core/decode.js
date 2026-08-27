/**
 * Binary reader + a small raw-DEFLATE decoder.
 *
 * The city payload is gzipped at bake time. Modern Safari has
 * DecompressionStream, but a self-contained page shouldn't hard-fail on an
 * older one, so there's a pure-JS inflate behind it. No network either way.
 */

// ---------------------------------------------------------------------------
// inflate (RFC 1951) — fixed + dynamic Huffman, stored blocks
// ---------------------------------------------------------------------------
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** Build a canonical Huffman decode table from code lengths. */
function huffman(lengths) {
  let max = 0;
  for (const l of lengths) if (l > max) max = l;
  const blCount = new Int32Array(max + 1);
  for (const l of lengths) if (l) blCount[l]++;
  const nextCode = new Int32Array(max + 2);
  let code = 0;
  for (let bits = 1; bits <= max; bits++) {
    code = (code + blCount[bits - 1]) << 1;
    nextCode[bits] = code;
  }
  // counts[len] and symbols sorted by (len, symbol) — canonical order
  const offs = new Int32Array(max + 2);
  let total = 0;
  for (let bits = 1; bits <= max; bits++) { offs[bits] = total; total += blCount[bits]; }
  const symbols = new Int32Array(total);
  const cursor = offs.slice();
  for (let sym = 0; sym < lengths.length; sym++) {
    const l = lengths[sym];
    if (l) symbols[cursor[l]++] = sym;
  }
  return { counts: blCount, symbols, max };
}

class BitReader {
  constructor(buf) { this.b = buf; this.pos = 0; this.bit = 0; this.val = 0; }
  bits(n) {
    while (this.bit < n) {
      this.val |= this.b[this.pos++] << this.bit;
      this.bit += 8;
    }
    const out = this.val & ((1 << n) - 1);
    this.val >>>= n; this.bit -= n;
    return out;
  }
  decode(tree) {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= tree.max; len++) {
      code |= this.bits(1);
      const count = tree.counts[len];
      if (code - first < count) return tree.symbols[index + (code - first)];
      index += count; first = (first + count) << 1; code <<= 1;
    }
    throw new Error('bad huffman code');
  }
}

export function inflateRaw(input) {
  const br = new BitReader(input);
  let out = new Uint8Array(1 << 18);
  let len = 0;
  const grow = (need) => {
    if (len + need <= out.length) return;
    let cap = out.length;
    while (cap < len + need) cap *= 2;
    const n = new Uint8Array(cap); n.set(out.subarray(0, len)); out = n;
  };

  let fixedLit = null, fixedDist = null;
  for (;;) {
    const final = br.bits(1);
    const type = br.bits(2);

    if (type === 0) {
      br.val = 0; br.bit = 0;
      const l = input[br.pos] | (input[br.pos + 1] << 8);
      br.pos += 4;
      grow(l);
      out.set(input.subarray(br.pos, br.pos + l), len);
      len += l; br.pos += l;
    } else {
      let lit, dist;
      if (type === 1) {
        if (!fixedLit) {
          const ll = new Uint8Array(288);
          for (let i = 0; i < 144; i++) ll[i] = 8;
          for (let i = 144; i < 256; i++) ll[i] = 9;
          for (let i = 256; i < 280; i++) ll[i] = 7;
          for (let i = 280; i < 288; i++) ll[i] = 8;
          fixedLit = huffman(ll);
          fixedDist = huffman(new Uint8Array(30).fill(5));
        }
        lit = fixedLit; dist = fixedDist;
      } else if (type === 2) {
        const hlit = br.bits(5) + 257;
        const hdist = br.bits(5) + 1;
        const hclen = br.bits(4) + 4;
        const clen = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clen[CLEN_ORDER[i]] = br.bits(3);
        const ctree = huffman(clen);
        const lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < lens.length;) {
          const sym = br.decode(ctree);
          if (sym < 16) lens[i++] = sym;
          else if (sym === 16) { const p = lens[i - 1], r = 3 + br.bits(2); for (let j = 0; j < r; j++) lens[i++] = p; }
          else if (sym === 17) { const r = 3 + br.bits(3); i += r; }
          else { const r = 11 + br.bits(7); i += r; }
        }
        lit = huffman(lens.subarray(0, hlit));
        dist = huffman(lens.subarray(hlit));
      } else throw new Error('bad deflate block type');

      for (;;) {
        const sym = br.decode(lit);
        if (sym < 256) { grow(1); out[len++] = sym; }
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const l = LEN_BASE[li] + br.bits(LEN_EXTRA[li]);
          const di = br.decode(dist);
          const d = DIST_BASE[di] + br.bits(DIST_EXTRA[di]);
          grow(l);
          let from = len - d;
          for (let i = 0; i < l; i++) out[len++] = out[from++];
        }
      }
    }
    if (final) break;
  }
  return out.subarray(0, len);
}

/** Strip the gzip envelope and inflate the deflate stream inside. */
export function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('not gzip');
  const flg = bytes[3];
  let p = 10;
  if (flg & 4) { p += 2 + (bytes[p] | (bytes[p + 1] << 8)); }
  if (flg & 8) { while (bytes[p]) p++; p++; }
  if (flg & 16) { while (bytes[p]) p++; p++; }
  if (flg & 2) p += 2;
  return inflateRaw(bytes.subarray(p));
}

/** Prefer the platform decoder, fall back to ours. */
export async function gunzipFast(bytes) {
  if (typeof DecompressionStream === 'function') {
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch (e) {
      /* fall through to the JS path */
    }
  }
  return gunzip(bytes);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// varint reader matching build/bake.mjs
// ---------------------------------------------------------------------------
export class Reader {
  constructor(bytes) { this.b = bytes; this.p = 0; this.dec = new TextDecoder(); }
  u8() { return this.b[this.p++]; }
  v() {
    let x = 0, s = 0, c;
    do { c = this.b[this.p++]; x |= (c & 127) << s; s += 7; } while (c & 128);
    return x >>> 0;
  }
  z() { const x = this.v(); return (x & 1) ? -((x + 1) >>> 1) : (x >>> 1); }
  s() { const n = this.v(); const out = this.dec.decode(this.b.subarray(this.p, this.p + n)); this.p += n; return out; }
}
