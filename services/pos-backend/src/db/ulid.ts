// ULIDs, the id format for every row (see docs/product.md, "Column
// conventions"). A ULID is 128 bits in 26 Crockford base32 characters: the
// first 48 bits are the millisecond timestamp, the last 80 are random. They
// sort lexicographically by creation time, which keeps indexes dense.

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LENGTH = ENCODING.length;
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

function encodeTime(time: number): string {
  let out = "";
  let remaining = time;
  for (let i = 0; i < TIME_LENGTH; i++) {
    out = ENCODING[remaining % ENCODING_LENGTH] + out;
    remaining = Math.floor(remaining / ENCODING_LENGTH);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    out += ENCODING[bytes[i] % ENCODING_LENGTH];
  }
  return out;
}

/** Generate a ULID, optionally pinned to a timestamp (used in tests). */
export function ulid(time: number = Date.now()): string {
  return encodeTime(time) + encodeRandom();
}
