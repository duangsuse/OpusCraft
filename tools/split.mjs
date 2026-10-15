import fs from 'fs'; import * as acorn from 'acorn'; import * as escope from 'eslint-scope'; import MagicString from 'magic-string';
const src=fs.readFileSync('/tmp/b2.js','utf8');
const ast=acorn.parse(src,{ecmaVersion:2022,sourceType:'script',ranges:true});
const sm=escope.analyze(ast,{ecmaVersion:2022,sourceType:'script'});
const secStarts=[...src.matchAll(/^   (\d+)\. /gm)].map(m=>({n:+m[1],pos:m.index}));
const sec=p=>{let s=1;for(const x of secStarts)if(x.pos<=p)s=x.n;return s};
const FILE_OF_SEC={1:'core',2:'core',3:'core',4:'res',5:'res',7:'gen',8:'gls',9:'gls',17:'gls'};
const OVERRIDE={MOB_TYPES:'res',SHEEP_COLOR_WEIGHTS:'res'};
const ORDER=['core','res','gen','gls','game'];
// statement -> file
const stmts=ast.body.map(n=>{let names=[];
  if(n.type==='VariableDeclaration')names=n.declarations.map(d=>d.id.name);else if(n.id)names=[n.id.name];
  let f=FILE_OF_SEC[sec(n.start)]||'game'; for(const k of names)if(OVERRIDE[k])f=OVERRIDE[k];
  return {n,names,f}});
// attach leading comments: statement covers from prev end
const defFile={}; for(const s of stmts)for(const k of s.names)defFile[k]=s.f;
const fileAt=pos=>{for(const s of stmts)if(pos>=s.n.start&&pos<s.n.end)return s.f;return null};
const shorthand=new Set();
(function walk(n){if(!n||typeof n.type!=='string')return; if(n.type==='Property'&&n.shorthand)shorthand.add(n.value.start);
  for(const k in n){const v=n[k]; if(Array.isArray(v))v.forEach(walk); else if(v&&typeof v.type==='string')walk(v);}})(ast);
const ms=new MagicString(src);
const imports={}; ORDER.forEach(f=>imports[f]=new Set());
const gscope=sm.globalScope;
const refs=[...gscope.through]; for(const v of gscope.variables)refs.push(...v.references);
const unknown=new Set();
for(const r of refs){const name=r.identifier.name, df=defFile[name]; const uf=fileAt(r.identifier.start); if(!uf)continue;
  if(!df){unknown.add(name);continue} if(df===uf)continue;
  if(ORDER.indexOf(df)<ORDER.indexOf(uf)){imports[uf].add(name);continue}
  const s=r.identifier.start,e=r.identifier.end;
  ms.overwrite(s,e,shorthand.has(s)?`${name}: gg.${name}`:`gg.${name}`);
}
console.error('unresolved globals:',[...unknown].sort().join(' '));
const out={}; ORDER.forEach(f=>out[f]=[]);
let prevEnd=0;
for(const s of stmts){out[s.f].push(ms.slice(prevEnd,s.n.end)); prevEnd=s.n.end;}
for(const f of ORDER){const names=stmts.filter(s=>s.f===f).flatMap(s=>s.names);
  const imp=[...imports[f]].sort();
  const head=imp.length?`const { ${imp.join(', ')} } = gg;\n`:'';
  fs.writeFileSync(`/tmp/sec/${f}.js`, head+out[f].join('').replace(/^\s*'use strict';\s*/,'')+`\nObject.assign(gg, { ${names.join(', ')} });\n`);
  console.error(f,names.length,'defs',imp.length,'imports');}
