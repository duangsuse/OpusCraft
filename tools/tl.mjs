import fs from 'fs'; import * as acorn from 'acorn';
const src=fs.readFileSync('/tmp/b2.js','utf8');
const ast=acorn.parse(src,{ecmaVersion:'latest',locations:true});
const secStarts=[...src.matchAll(/^   (\d+)\. /gm)].map(m=>({n:+m[1],pos:m.index}));
const sec=p=>{let s=0;for(const x of secStarts)if(x.pos<=p)s=x.n;return s};
const out={};
for(const n of ast.body){let names=[];
 if(n.type==='VariableDeclaration')for(const d of n.declarations){if(d.id.type==='Identifier')names.push(d.id.name);else names.push('PATTERN')}
 else if(n.id)names.push(n.id.name); else names.push('<'+n.type+'>');
 (out[sec(n.start)]??=[]).push(...names)}
for(const k in out)console.log(k,out[k].join(' '));
