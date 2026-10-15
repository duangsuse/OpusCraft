import fs from 'fs';
const P='/home/aa/Proj/mc/';
const html=fs.readFileSync(P+'bridge-mind.html','utf8').split('\n').slice(0,240).join('\n')
 .replace(/<script src="https:\/\/cdnjs[^\n]*\n<script src="https:\/\/cdnjs[^\n]*\n<script>/,'');
const rd=f=>fs.readFileSync('/tmp/sec/'+f+'.js','utf8');
const wrap=(f,body)=>`/* ${f} — shares window.gg (see index.html) */\n(() => {\n'use strict';\nconst { THREE, JSZip } = gg;\n${body}\n})();\n`;
fs.writeFileSync(P+'res_vam.js',wrap('res_vam.js',rd('res')));
fs.writeFileSync(P+'gen.js',wrap('gen.js',rd('gen')));
fs.writeFileSync(P+'gls.js',wrap('gls.js',rd('gls')));
const head=`<script type="importmap">{"imports":{
 "three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
 "tweakpane":"https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.js",
 "jszip":"https://esm.sh/jszip@3.10.1"}}</script>
<script type="module">
import * as THREE from 'three';
import { Pane } from 'tweakpane';
import JSZip from 'jszip';
const gg = window.gg = { THREE, Pane, JSZip };
THREE.ColorManagement.enabled = false;
${rd('core')}
</script>
<script defer src="res_vam.js"></script>
<script defer src="gen.js"></script>
<script defer src="gls.js"></script>
<script type="module">
const { THREE, JSZip } = gg;
${rd('game')}
</script>
</body>
</html>
`;
fs.writeFileSync(P+'index.html',html.replace(/<\/div>\s*$/,'</div>\n')+'\n'+head);
