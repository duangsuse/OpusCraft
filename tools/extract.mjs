// One-off: move a line range of the main <script type="module"> in index.html into its own deferred file.
// usage: node tools/extract.mjs <fromLine> <toLine> <out.js> <title>
import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire('/tmp/split/node_modules/');
const acorn = require('acorn'), escope = require('eslint-scope'), MagicString = require('magic-string').default ?? require('magic-string');
const [from, to, outFile, title] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const html = fs.readFileSync('index.html', 'utf8'), L = html.split('\n');
const sOpen = L.findIndex((l, i) => i > 900 && l === '<script type="module">'), sClose = L.findIndex((l, i) => i > sOpen && l === '</script>');
const code = L.slice(sOpen + 1, sClose).join('\n'), base = sOpen + 2; // line number of code line 1
const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', ranges: true, locations: true });
const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
const lineOf = (n) => n.loc.start.line + base - 1;
const moved = (n) => lineOf(n) >= from && lineOf(n) <= to;
const declNames = (n) => n.type === 'VariableDeclaration' ? n.declarations.flatMap(d => d.id.type === 'Identifier' ? [d.id.name] : d.id.properties.map(p => p.value.name)) : n.id ? [n.id.name] : [];
const top = ast.body, mv = top.filter(moved), rest = top.filter(n => !moved(n));
const isGG = (n) => n.type === 'VariableDeclaration' && n.declarations.some(d => d.init && d.init.type === 'Identifier' && d.init.name === 'gg');
const ggImports = new Set(rest.filter(isGG).flatMap(declNames)); // `const {...} = gg;` lines
const movedNames = new Set(mv.flatMap(declNames)), mainNames = new Set(rest.filter(n => !isGG(n)).flatMap(declNames));
const mod = sm.acquire(ast) ? sm.scopes.find(s => s.type === 'module') : null;
const shorthand = new Set();
(function walk(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'Property' && n.shorthand) shorthand.add(n.value.start); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); } })(ast);
const ms = new MagicString(code), need = new Set(), mainNeeds = new Set(), eager = [];
const inMoved = (pos) => mv.some(n => pos >= n.start && pos < n.end);
for (const v of mod.variables) for (const r of v.references) {
  const name = v.name, pos = r.identifier.start, im = inMoved(pos);
  if (im && mainNames.has(name) && !movedNames.has(name)) {
    if (r.from.type === 'module') eager.push(name + '@' + (r.identifier.loc.start.line + base - 1));
    ms.overwrite(pos, r.identifier.end, shorthand.has(pos) ? `${name}: gg.${name}` : `gg.${name}`); need.add('gg.' + name);
  } else if (im && ggImports.has(name)) need.add(name);
  else if (!im && movedNames.has(name)) mainNeeds.add(name);
}
const body = mv.length ? ms.slice(mv[0].start, mv[mv.length - 1].end) : '';
// leading comment before first moved stmt (section header) comes along: take raw text from the from-line
const lead = code.split('\n').slice(from - base, lineOf(mv[0]) - base).join('\n');
const imp = [...need].filter(n => !n.startsWith('gg.')).sort();
const lazy = [...need].filter(n => n.startsWith('gg.')).map(n => n.slice(3)).sort();
const out = `/* ${outFile} — ${title}. Shares window.gg (see index.html); loaded deferred before the main module,
   so main-module systems (${lazy.join(', ')}) are read lazily as gg.X at call time. */
(() => {
'use strict';
const { THREE } = gg;
const { ${imp.join(', ')} } = gg;

${lead ? lead + '\n' : ''}${body}

Object.assign(gg, { ${[...movedNames].join(', ')} });
})();
`;
fs.writeFileSync(outFile, out);
// rewrite index.html: drop moved lines (from..end line of last moved stmt), extend import destructure
const lastLine = mv[mv.length - 1].loc.end.line + base - 1;
const NL = L.slice(0, from - 1).concat(L.slice(lastLine));
fs.writeFileSync('index.html', NL.join('\n'));
console.log(JSON.stringify({ moved: [...movedNames], mainNeeds: [...mainNeeds], lazy, eager, lastLine }, null, 1));
