const q=new URLSearchParams(location.search),H=document.documentElement;
const st=q.get('state')||'playing';H.dataset.theme=q.get('theme')||'dark';
const empty=st==='empty';if(empty)H.dataset.empty='';
H.dataset.state=empty?'paused':st;
const playing=st==='playing';
H.dataset.arm=q.get('arm')||(playing?'play':'rest');
document.querySelectorAll('.disc,.label').forEach(e=>e.classList.toggle('is-spinning',playing));
// live hillPath (progress.tsx:24-80)
function hs(v){let h=2166136261;for(const c of v){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function mb(seed){let s=seed>>>0;return()=>{s|=0;s=(s+0x6d2b79f5)|0;let n=Math.imul(s^(s>>>15),1|s);n=(n+Math.imul(n^(n>>>7),61|n))^n;return((n^(n>>>14))>>>0)/4294967296}}
const GILT=[{crown:"#e7c277",body:"#f6e2b0",bloom:"#f0cd82"},{crown:"#efa44c",body:"#f8cf96",bloom:"#f4b25e"},{crown:"#c9794a",body:"#efc1a0",bloom:"#dd935f"}];
const sm=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t)};
const HILLS=[{c:[.48,.62],w:[.2,.27],h:[.66,.8]},{c:[.64,.76],w:[.11,.16],h:[.86,1]},{c:[.34,.5],w:[.13,.19],h:[.5,.66]}];
const bt=([l,h],r)=>l+(h-l)*r;
function hill(seed,i){const S=HILLS[i],r=mb(hs(`${seed}:hill:${i}`));const c=bt(S.c,r()),w=bt(S.w,r()),h=bt(S.h,r());const ea=c-w*(1.1+r()*.5),eh=h*(.18+r()*.16);let p="M0 100";
for(let k=0;k<=64;k++){const t=k/64;const cr=Math.exp(-(((t-c)/w)**2));const e=Math.exp(-(((t-ea)/(w*.8))**2))*(eh/h);const f=sm(0,.22,t)*(1-sm(.88,1,t));p+=` L${(t*1000).toFixed(1)} ${(100-Math.min(1,cr+e)*h*f*100).toFixed(2)}`}return p+" L1000 100 Z"}
const seed=q.get('seed')||'kJQP7kiw5Fk',ratio=empty?0:103/282,swell=.35+sm(0,.22,ratio)*.65;
const P=document.querySelector('.progress');P.style.setProperty('--play',ratio*100+'%');P.style.setProperty('--swell',swell.toFixed(3));
if(playing)P.classList.add('is-running');if(empty)P.classList.add('is-idle');
const hp=[0,1,2].map(i=>hill(seed,i));
P.innerHTML=`<span class="wave-rest"></span><div class="wave-art" aria-hidden="true"><svg class="wave-bloom" viewBox="0 0 1000 100" preserveAspectRatio="none">${hp.map((d,i)=>`<path d="${d}" fill="${GILT[i].bloom}"/>`).join('')}</svg><svg class="wave-hills" viewBox="0 0 1000 100" preserveAspectRatio="none"><defs>${GILT.map((g,i)=>`<linearGradient id="h${i}" x1="0" x2="0" y1="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${g.crown}" stop-opacity="1"/><stop offset="55%" stop-color="${g.body}" stop-opacity=".9"/><stop class="wave-base" offset="100%"/></linearGradient>`).join('')}</defs>${hp.map((d,i)=>`<g class="wave-hill wave-hill-${i}"><path d="${d}" fill="url(#h${i})"/></g>`).join('')}</svg></div><span class="wave-line"></span><span class="wave-thumb"></span>`;
const PLAY='<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>';
const pp=document.querySelector('.tr .pp');
if(!playing){pp.setAttribute('aria-label','เล่น');pp.innerHTML=PLAY;document.querySelector('.ytpp').textContent='▶'}
// extra rows for scroll check
const n=+q.get('n')||0;const L=document.querySelector('.qlist');for(let i=0;i<n;i++){const c=L.children[1+(i%2)].cloneNode(true);c.classList.remove('on');L.appendChild(c)}
if(empty){
 L.replaceWith(Object.assign(document.createElement('p'),{className:'qempty',textContent:'ยังไม่มีเพลงรอ เพลงที่เพิ่มจะต่อจากเพลงนี้'}));
 document.querySelector('.qh span').remove();
 const pl=document.querySelector('.player');pl.removeAttribute('data-player');pl.removeAttribute('title');pl.className='player is-empty';pl.innerHTML='<span>ยังไม่มีเพลงที่กำลังเล่น</span>';
 document.querySelector('.label').innerHTML='<div class="monogram"><span>M</span></div>';
 document.querySelector('.ttl').textContent='ห้องรับดูทีวีสือ';document.querySelector('.meta').textContent='ยังไม่มีเพลงในห้อง';
 document.querySelector('.times').innerHTML='<span>0:00</span><span>—</span>';
 document.querySelectorAll('.tr button').forEach((b,i)=>{if(i>0&&i<4)b.disabled=true});
}
const mob=matchMedia('(max-width:600px)');const sw=()=>document.querySelectorAll('.arm').forEach(a=>a.style.display=(a.classList.contains('marm')===mob.matches)?'':'none');sw();mob.onchange=sw;
