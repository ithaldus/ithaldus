// bun run decode.ts < input.txt

function extractStringLiteralStartingWith6(raw: string): string {
  const start = raw.indexOf('"6:');
  if (start === -1) throw new Error('Could not find string literal starting with "6:');

  let i = start + 1; // skip first quote
  let escaped = false;

  for (; i < raw.length; i++) {
    const c = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (c === '\\') {
      escaped = true;
      continue;
    }

    if (c === '"') {
      // closing quote reached
      return raw.slice(start, i + 1);
    }
  }

  throw new Error("Unterminated JSON string literal");
}

function normalize(v: any): any {
  if (v === "$undefined") return null;
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const [k, val] of Object.entries(v)) o[k] = normalize(val);
    return o;
  }
  return v;
}

async function main() {
  const raw = await Bun.stdin.text();

  // 1️⃣ grab the JSON string literal that begins with "6:
  const literal = extractStringLiteralStartingWith6(raw);

  // 2️⃣ parse the JSON string literal -> JS string
  const innerText: string = JSON.parse(literal);

  // 3️⃣ parse THAT string -> JS object
  const inner = JSON.parse(innerText);

  // 4️⃣ unwrap ["$", "...", null, {...}]
  const data =
    Array.isArray(inner) && inner.length >= 4 && inner[0] === "$"
      ? inner[3]
      : inner;

  // 5️⃣ normalize markers
  console.log(JSON.stringify(normalize(data), null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
// bun run decode.ts < input.txt

/**
 * Find the JSON string literal that follows 6:
 * e.g. 6:"[...]"
 * and return the string literal INCLUDING its quotes.
 */
function extractStringLiteralAfter6(raw: string): string {
  const re = /6:\s*("(?:(?:\\.)|[^"\\])*")/s;
  const m = raw.match(re);
  if (!m) throw new Error(`Could not find JSON string literal after 6:`);
  return m[1]; // this is a valid JSON string literal
}

/**
 * Normalize special React markers
 */
function normalize(v: any): any {
  if (v === "$undefined") return null;
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const [k, val] of Object.entries(v)) o[k] = normalize(val);
    return o;
  }
  return v;
}

async function main() {
  const raw = await Bun.stdin.text();

  // 1) grab the JSON string literal after 6:
  const stringLiteral = extractStringLiteralAfter6(raw);

  // 2) parse the literal into a JS string (handles all escapes)
  const innerJsonText: string = JSON.parse(stringLiteral);

  // 3) parse the decoded JSON text
  const inner = JSON.parse(innerJsonText);

  // 4) unwrap ["$", "...", null, {...}]
  const data =
    Array.isArray(inner) && inner.length >= 4 && inner[0] === "$"
      ? inner[3]
      : inner;

  console.log(JSON.stringify(normalize(data), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
