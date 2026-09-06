import fs from 'node:fs';
import path from 'node:path';

// The compatibility tables in README.md and website/docs/support-policy.md,
// the adapter README (the one npm shows), and the guidelines' support line all
// state the Node floor and the peer ranges as literals. Those literals ship to
// users, so a stale one is a release defect (guidelines §6), and the Node 20
// sunset showed how easily one lags: it moved `engines` and left a page or two
// behind in sibling repos. This check pins every one of them to the manifests
// — `engines.node` (which the workspace root and both packages must agree on),
// the adapter's `@nestjs/*` peer range, and the core's `drizzle-orm` peer
// range. Inside a Markdown table cell `|` is written `\|`.

const repoRoot = process.cwd();

const manifests = {
  root: readJson('package.json'),
  core: readJson('packages/core/package.json'),
  adapter: readJson('packages/nestjs/package.json'),
};

const nodeFloor = agree(
  Object.entries(manifests).map(([label, manifest]) => [label, manifest.engines?.node]),
  'engines.node',
);
const nestRange = agree(
  [
    ['@nestjs/common', manifests.adapter.peerDependencies?.['@nestjs/common']],
    ['@nestjs/core', manifests.adapter.peerDependencies?.['@nestjs/core']],
  ],
  'packages/nestjs/package.json peer range',
);
const drizzleRange = manifests.core.peerDependencies?.['drizzle-orm'];
if (typeof drizzleRange !== 'string') {
  throw new Error('packages/core/package.json declares no drizzle-orm peer range');
}

// Each check names a Markdown file, how to find the region that states the
// literal, and the literal it must state (in backticks, so prose that merely
// mentions "22" is never mistaken for the support line).
const checks = [
  ...compatibilityTable('README.md'),
  ...compatibilityTable('website/docs/support-policy.md'),
  {
    file: 'GUIDELINES_NEST_LOCKOUT.md',
    region: listItemStartingWith('- Support line:'),
    literals: [nodeFloor, nestRange],
  },
  {
    file: 'packages/nestjs/README.md',
    region: paragraphContaining('supports **NestJS'),
    literals: [nodeFloor, nestRange],
  },
];

const failures = [];

for (const { file, region, literals } of checks) {
  const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const { label, content } = region(text);

  if (content === undefined) {
    failures.push(`${file}: ${label} not found`);
    continue;
  }

  for (const literal of literals) {
    if (!content.includes(`\`${literal}\``)) {
      failures.push(`${file}: ${label} does not state \`${literal}\` (found: ${content.trim()})`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Compatibility table drift detected:\n${failures.join('\n')}`);
}

console.log(
  `Compatibility tables OK: ${checks.length} regions state Node.js ${nodeFloor}, NestJS ${nestRange}, drizzle-orm ${drizzleRange}.`,
);

function compatibilityTable(file) {
  return [
    { file, region: tableRow('Node.js'), literals: [nodeFloor] },
    { file, region: tableRow('NestJS'), literals: [nestRange] },
    { file, region: tableRow('`drizzle-orm`'), literals: [drizzleRange] },
  ];
}

// `| <label> … | <cells> |` — the first cell starts with the label; the rest of
// the row is the region, with `\|` unescaped so the literal compares as written
// in package.json.
function tableRow(labelPrefix) {
  return text => {
    const row = text.split('\n').find(line => {
      const cells = line.split(/(?<!\\)\|/);
      return cells.length > 2 && cells[1].trim().startsWith(labelPrefix);
    });
    return {
      label: `table row "${labelPrefix}"`,
      content: row?.replace(/\\\|/g, '|'),
    };
  };
}

// A Markdown list item that starts with the prefix, including its wrapped
// continuation lines (indented, non-blank, not the next `- ` item).
function listItemStartingWith(prefix) {
  return text => {
    const lines = text.split('\n');
    const start = lines.findIndex(line => line.startsWith(prefix));
    if (start === -1) {
      return { label: `list item "${prefix}"`, content: undefined };
    }
    let end = start + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end])) {
      end += 1;
    }
    return { label: `list item "${prefix}"`, content: lines.slice(start, end).join('\n') };
  };
}

function paragraphContaining(needle) {
  return text => ({
    label: `paragraph containing "${needle}"`,
    content: text.split(/\n\s*\n/).find(paragraph => paragraph.includes(needle)),
  });
}

function agree(entries, what) {
  const values = new Set(entries.map(([, value]) => value));
  if (values.size !== 1 || values.has(undefined)) {
    throw new Error(
      `${what} disagrees across manifests: ${entries.map(([label, value]) => `${label}=${value ?? '<missing>'}`).join(', ')}`,
    );
  }
  return entries[0][1];
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}
