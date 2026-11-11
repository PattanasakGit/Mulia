const {chromium}=require('/tmp/pw/node_modules/playwright');const fs=require('fs');const path=require('path');
const axe=fs.readFileSync('/tmp/pw/node_modules/axe-core/axe.min.js','utf8');
const base='file://'+path.resolve('html/R45.html');
const jobs=[['desk-dark-playing',1440,810,'theme=dark&state=playing'],['desk-dark-paused',1440,810,'theme=dark&state=paused'],['desk-dark-empty',1440,810,'theme=dark&state=empty'],['desk-light-playing',1440,810,'theme=light&state=playing'],['desk-light-paused',1440,810,'theme=light&state=paused'],['desk-light-empty',1440,810,'theme=light&state=empty'],['mob-dark-playing',390,844,'theme=dark&state=playing'],['mob-dark-paused',390,844,'theme=dark&state=paused'],['mob-dark-empty',390,844,'theme=dark&state=empty'],['mob-light-playing',390,844,'theme=light&state=playing'],['mob-light-paused',390,844,'theme=light&state=paused'],['mob-light-empty',390,844,'theme=light&state=empty'],['desk-dark-scroll',1440,810,'state=playing&n=6'],['desk-dark-tap',1440,810,'state=tap'],['desk-dark-hidden',1440,810,'state=hidden'],['mob-dark-full',390,844,'state=playing',true],['mob-dark-empty-full',390,844,'state=empty',true]];
(async()=>{const b=await chromium.launch();const res={};
for(const [n,w,h,qs,full] of jobs){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
await p.goto(base+'?'+qs);await p.addStyleTag({content:'*{animation-play-state:paused!important;transition:none!important}'});await p.waitForTimeout(400);
await p.screenshot({path:`png/${n}.png`,fullPage:!!full});
if(full){continue}
const r=await p.evaluate(async()=>{const pe=document.querySelector('[data-player]')||document.querySelector('.player');const mounted=!!document.querySelector('[data-player]');const pl=pe.getBoundingClientRect();const out={player:[pl.x,pl.y,pl.width,pl.height].map(Math.round)};
let foreign=0;for(let x=pl.x+2;x<pl.right-1;x+=6)for(let y=pl.y+2;y<pl.bottom-1;y+=6){const e=document.elementFromPoint(x,y);if(!e||!e.closest('[data-player]'))foreign++}out.foreign=mounted?foreign:'n/a (not mounted)';const Q=document.querySelector('.q').getBoundingClientRect(),PP=document.querySelector('.tr .pp').getBoundingClientRect(),QL=document.querySelector('.qlist');out.panel={top:Q.top,bottom:Q.bottom,leftBottom:PP.bottom,aligned:Math.abs(Q.bottom-PP.bottom)<=1,h:Q.height,scrolls:QL?QL.scrollHeight>QL.clientHeight:null};
const H=document.documentElement,arm=[...document.querySelectorAll('.arm')].find(a=>a.style.display!=='none');out.armHit={};
for(const s of ['play','mid','rest']){H.dataset.arm=s;const rs=[...arm.querySelectorAll('rect,circle,path')].map(e=>e.getBoundingClientRect());const a={left:Math.min(...rs.map(r=>r.left)),top:Math.min(...rs.map(r=>r.top)),right:Math.max(...rs.map(r=>r.right)),bottom:Math.max(...rs.map(r=>r.bottom))};a.x=a.left;a.y=a.top;out.armHit[s]=!(a.right<=pl.left||a.left>=pl.right||a.bottom<=pl.top||a.top>=pl.bottom);out['arm_'+s]=[a.x,a.y,a.right,a.bottom].map(Math.round)}
out.small=[...document.querySelectorAll('button,a')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&getComputedStyle(e).visibility!=='hidden'&&(r.width<44||r.height<44)}).map(e=>e.textContent.trim().slice(0,20)||e.getAttribute('aria-label'));
out.hScroll=document.documentElement.scrollWidth>innerWidth;
const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)};
out.rects={vinyl:(e=>[e.offsetLeft,e.offsetTop,e.offsetWidth])(document.querySelector('.vinyl')),ttl:R('.ttl'),meta:R('.meta'),wave:R('.wave'),times:R('.times'),pp:R('.tr .pp'),paste:R('.paste'),add:R('.add'),q:R('.q'),row1:R('.row'),thumb:R('.row img'),div:R('.div'),hdr:R('.hdr')};
const rg=document.createRange();const t=document.querySelector('.ttl');rg.selectNodeContents(t);const tr=rg.getClientRects();out.ttlInk=[...tr].map(r=>[r.x,r.y,r.width,r.height].map(Math.round));
const m=document.querySelector('.meta');rg.selectNodeContents(m);out.metaInk=[...rg.getClientRects()].map(r=>[r.x,r.y,r.width,r.height].map(Math.round));return out});
await p.addScriptTag({content:axe});r.axe=await p.evaluate(async()=>{const x=await axe.run({runOnly:['wcag2a','wcag2aa']});return x.violations.map(v=>v.id+':'+v.nodes.length)});
res[n]=r;await p.close()}
fs.writeFileSync('checks.json',JSON.stringify(res,null,1));
for(const[k,v]of Object.entries(res))console.log(k,'panel',JSON.stringify(v.panel),'player',v.player,'foreign',v.foreign,'armHit',JSON.stringify(v.armHit),'small',v.small.length?v.small:0,'hs',v.hScroll,'axe',v.axe.join(','));
console.log(JSON.stringify(res['desk-dark-playing'].rects),res['desk-dark-playing'].ttlInk,res['desk-dark-playing'].metaInk);await b.close()})();
