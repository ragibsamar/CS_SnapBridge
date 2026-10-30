/* ==========================================================
   CyberShop SnapBridge: flatscan.js
   FlatScan engine (from the original FlatScan app): auto-detect page corners,
   perspective flatten, scan/B&W/gray filters, export JPG/PNG/PDF.
   Wrapped in an IIFE so its variables never clash with app.js.
   Public API (window.FlatScan): load(file) hasResult() blob() format() name() refresh()
   Removed from the original: theme buttons, live camera, header/logo.
   ========================================================== */
(function(){

const $=id=>document.getElementById(id),cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const ed=$('ed'),ex=ed.getContext('2d'),res=$('res'),rx=res.getContext('2d'),MAX=2400;
let src=null,sd=null,q=[],auto=true,ratio=1,base=null,bg=null,bgk=1,drag=-1,ds=1,nm='scan',tm=0,tr=0;
const say=t=>$('msg').textContent=t,safe=f=>{try{f()}catch(e){say('Error: '+((e&&e.message)||e))}};

/* ---------- helpers ---------- */
function hs(d,o,s){const h=new Uint32Array(256);let n=0;for(let i=o;i<d.length;i+=s){h[d[i]|0]++;n++}return[h,n]}
function pct(d,k,p1,p2){const[h,n]=hs(d,k,16);let s=0,lo=0,hi=255;for(let v=0;v<256;v++){s+=h[v];if(s>=n*p1){lo=v;break}}s=0;for(let v=0;v<256;v++){s+=h[v];if(s>=n*p2){hi=v;break}}return[lo,Math.max(hi,lo+8)]}
function otsu(d,o,s){const[h,n]=hs(d,o,s);let sum=0;for(let v=0;v<256;v++)sum+=v*h[v];let sb=0,wb=0,mx=0,t=128;for(let v=0;v<256;v++){wb+=h[v];if(!wb)continue;const wf=n-wb;if(!wf)break;sb+=v*h[v];const mb=sb/wb,mf=(sum-sb)/wf,bv=wb*wf*(mb-mf)*(mb-mf);if(bv>mx){mx=bv;t=v}}return t}
function lev(d,ks,lo,hi){const f=255/(hi-lo);for(let i=0;i<d.length;i+=4)for(const k of ks)d[i+k]=(d[i+k]-lo)*f}
const full=m=>{const a=src.width*m,b=src.height*m,w=src.width-a,h=src.height-b;return[[a,b],[w,b],[w,h],[a,h]]};
const setWH=(w,h)=>{$('w').value=w;$('h').value=h;ratio=w/h};
function autoSize(){const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);let W=Math.max(d(q[0],q[1]),d(q[3],q[2])),H=Math.max(d(q[0],q[3]),d(q[1],q[2]));const s=Math.min(1,MAX/Math.max(W,H));setWH(Math.round(W*s),Math.round(H*s))}

/* ---------- load / layout ---------- */
function setSrc(c){src=c;sd=c.getContext('2d').getImageData(0,0,c.width,c.height);q=[];layout()}
function loadFile(f){
  if(!f||!/^image\//.test(f.type))return say('Please choose an image file.');
  nm=f.name.replace(/\.[^.]+$/,'')||'scan';const im=new Image();
  im.onload=()=>{const s=Math.min(1,MAX/Math.max(im.naturalWidth,im.naturalHeight)),c=cv(Math.round(im.naturalWidth*s),Math.round(im.naturalHeight*s));c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(im.src);setSrc(c);detect();say('Adjust the corners if needed, then download or share.')};
  im.onerror=()=>say('Could not open that image.');im.src=URL.createObjectURL(f);
}
function layout(){ed.hidden=false;$('empty').hidden=true;const cw=$('stage').clientWidth||320;ds=Math.min(cw/src.width,Math.min(innerHeight*.6,640)/src.height);ed.width=Math.round(src.width*ds);ed.height=Math.round(src.height*ds);draw()}
function draw(){
  if(!src)return;const w=ed.width,h=ed.height;ex.drawImage(src,0,0,w,h);if(q.length<4)return;
  const P=q.map(p=>[p[0]*ds,p[1]*ds]);
  ex.fillStyle='#0008';ex.beginPath();ex.rect(0,0,w,h);P.forEach((p,i)=>i?ex.lineTo(p[0],p[1]):ex.moveTo(p[0],p[1]));ex.closePath();ex.fill('evenodd');
  ex.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#2f6bff';ex.lineWidth=2;ex.beginPath();P.forEach((p,i)=>i?ex.lineTo(p[0],p[1]):ex.moveTo(p[0],p[1]));ex.closePath();ex.stroke();
  P.forEach(p=>{ex.beginPath();ex.arc(p[0],p[1],10,0,7);ex.fillStyle='#fff';ex.fill();ex.stroke()});
}

/* ---------- auto detect page edges ---------- */
function detect(){
  const s=Math.min(1,160/Math.max(src.width,src.height)),w=Math.round(src.width*s),h=Math.round(src.height*s),c=cv(w,h),x=c.getContext('2d');x.drawImage(src,0,0,w,h);
  const dd=x.getImageData(0,0,w,h).data,g=new Uint8Array(w*h),m=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)g[i]=.299*dd[i*4]+.587*dd[i*4+1]+.114*dd[i*4+2];
  const t=otsu(g,0,1);let e=0,n=0;
  for(let i=0;i<w*h;i++){m[i]=g[i]>t?1:0;const X=i%w,Y=(i/w)|0;if(X<w*.06||X>w*.94||Y<h*.06||Y>h*.94){n++;e+=m[i]}}
  if(e/n>.5)for(let i=0;i<w*h;i++)m[i]^=1;
  const b=[1e9,-1e9,-1e9,1e9],P=[];let cnt=0;
  for(let y=1;y<h-1;y++)for(let X=1;X<w-1;X++){const i=y*w+X;if(m[i]&&m[i-1]&&m[i+1]&&m[i-w]&&m[i+w]){cnt++;const a=X+y,d=X-y;
    if(a<b[0]){b[0]=a;P[0]=[X,y]}if(d>b[1]){b[1]=d;P[1]=[X,y]}if(a>b[2]){b[2]=a;P[2]=[X,y]}if(d<b[3]){b[3]=d;P[3]=[X,y]}}}
  let Q=P[0]&&P[1]&&P[2]&&P[3]&&cnt>w*h*.1?P.map(p=>[(p[0]+.5)/s,(p[1]+.5)/s]):null;
  if(Q){let A=0;for(let i=0;i<4;i++){const p=Q[i],r=Q[(i+1)%4];A+=p[0]*r[1]-r[0]*p[1]}if(Math.abs(A)/2<src.width*src.height*.2)Q=null}
  q=Q||full(.04);draw();changed();
}
function changed(){safe(()=>{if(auto)autoSize();warp()})}

/* ---------- corner dragging ---------- */
const pos=e=>{const r=ed.getBoundingClientRect(),k=ed.width/r.width/ds;return[(e.clientX-r.left)*k,(e.clientY-r.top)*k]};
ed.onpointerdown=e=>{if(q.length<4)return;const p=pos(e);let best=-1,bd=1e9;q.forEach((c,i)=>{const d=Math.hypot(c[0]-p[0],c[1]-p[1]);if(d<bd){bd=d;best=i}});if(bd*ds<44){drag=best;ed.setPointerCapture(e.pointerId)}};
ed.onpointermove=e=>{if(drag<0)return;const p=pos(e);q[drag]=[Math.max(0,Math.min(src.width,p[0])),Math.max(0,Math.min(src.height,p[1]))];draw()};
ed.onpointerup=()=>{if(drag>=0){drag=-1;changed()}};

/* ---------- perspective warp (flatten) ---------- */
function warp(){
  const W=Math.min(MAX,Math.max(50,+$('w').value||0)),H=Math.min(MAX,Math.max(50,+$('h').value||0));if(!src||q.length<4)return;
  const x=q.map(p=>p[0]),y=q.map(p=>p[1]),sx=x[0]-x[1]+x[2]-x[3],sy=y[0]-y[1]+y[2]-y[3],dx1=x[1]-x[2],dx2=x[3]-x[2],dy1=y[1]-y[2],dy2=y[3]-y[2],den=dx1*dy2-dx2*dy1;
  let gg=0,hh=0;if(Math.abs(den)>1e-9&&(Math.abs(sx)>1e-9||Math.abs(sy)>1e-9)){gg=(sx*dy2-dx2*sy)/den;hh=(dx1*sy-sx*dy1)/den}
  const a=x[1]-x[0]+gg*x[1],b=x[3]-x[0]+hh*x[3],c=x[0],d=y[1]-y[0]+gg*y[1],e=y[3]-y[0]+hh*y[3],f=y[0];
  const S=sd.data,SW=sd.width,SH=sd.height,out=new ImageData(W,H),O=out.data;
  for(let j=0;j<H;j++){const v=(j+.5)/H;for(let i=0;i<W;i++){const u=(i+.5)/W,t=gg*u+hh*v+1;let X=(a*u+b*v+c)/t-.5,Y=(d*u+e*v+f)/t-.5;
    X=X<0?0:X>SW-1.001?SW-1.001:X;Y=Y<0?0:Y>SH-1.001?SH-1.001:Y;
    const x0=X|0,y0=Y|0,fx=X-x0,fy=Y-y0,i0=(y0*SW+x0)*4,i1=i0+SW*4,o=(j*W+i)*4;
    for(let k=0;k<3;k++)O[o+k]=(S[i0+k]*(1-fx)+S[i0+4+k]*fx)*(1-fy)+(S[i1+k]*(1-fx)+S[i1+4+k]*fx)*fy;O[o+3]=255}}
  base=out;bg=null;render();
}

/* ---------- colour / scan look ---------- */
function bgOf(img){
  const W=img.width,H=img.height,s=Math.max(1,Math.max(W,H)/24),w=Math.max(2,Math.round(W/s)),h=Math.max(2,Math.round(H/s));
  let c=cv(W,H);c.getContext('2d').putImageData(img,0,0);let cw=W,ch=H;
  while(cw>w*2&&ch>h*2){const nw=Math.ceil(cw/2),nh=Math.ceil(ch/2),n=cv(nw,nh);n.getContext('2d').drawImage(c,0,0,nw,nh);c=n;cw=nw;ch=nh}
  const c2=cv(w,h),x2=c2.getContext('2d');x2.drawImage(c,0,0,w,h);const id=x2.getImageData(0,0,w,h),A=id.data,T=new Uint8ClampedArray(A.length),r=3;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=0;k<3;k++){let m=0;for(let i=-r;i<=r;i++){const xx=x+i;if(xx>=0&&xx<w){const v=A[(y*w+xx)*4+k];if(v>m)m=v}}T[(y*w+x)*4+k]=m}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){for(let k=0;k<3;k++){let m=0;for(let i=-r;i<=r;i++){const yy=y+i;if(yy>=0&&yy<h){const v=T[(yy*w+x)*4+k];if(v>m)m=v}}A[(y*w+x)*4+k]=m}A[(y*w+x)*4+3]=255}
  x2.putImageData(id,0,0);const c3=cv(W,H),x3=c3.getContext('2d');x3.imageSmoothingQuality='high';x3.drawImage(c2,0,0,W,H);return x3.getImageData(0,0,W,H).data;
}
/* flatten uneven lighting; strength drops automatically for pictures that are not mostly paper */
function flat(d,img){
  if(!bg){bg=bgOf(img);const hh=new Uint32Array(256);let n=0;for(let i=1;i<img.data.length;i+=16){hh[Math.min(255,(img.data[i]*255/Math.max(bg[i],1))|0)]++;n++}
    let s=0,med=255;for(let v=0;v<256;v++){s+=hh[v];if(s>=n/2){med=v;break}}bgk=Math.max(0,Math.min(1,(med/255-.55)/.3))}
  for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++){const o=d[i+k],nv=o*250/Math.max(bg[i+k],24);d[i+k]=o+(nv-o)*bgk}
}
function bl1(s,o,lines,len,ls,st,r){for(let l=0;l<lines;l++)for(let k=0;k<3;k++){const b=l*ls+k;let sum=0,cnt=0;for(let i=0;i<=r&&i<len;i++){sum+=s[b+i*st];cnt++}
  for(let i=0;i<len;i++){o[b+i*st]=sum/cnt;const a=i+r+1,z=i-r;if(a<len){sum+=s[b+a*st];cnt++}if(z>=0){sum-=s[b+z*st];cnt--}}}}
function boxBlur(d,W,H,r){const t=new Uint8ClampedArray(d.length);bl1(d,t,H,W,W*4,4,r);bl1(t,d,W,H,4,W*4,r)}
function fitRes(){if(!base)return;const W=res.width,H=res.height,s=Math.min(1,($('rst').clientWidth||320)/W,640/H);res.style.width=Math.round(W*s)+'px';res.style.height=Math.round(H*s)+'px'}
function render(){
  if(!base)return;const W=base.width,H=base.height,m=document.querySelector('.seg .on').dataset.m,br=+$('br').value*2.55,ct=1+$('ct').value/50,sa=1+$('sa').value/100,bl=+$('bl').value,sp=+$('sp').value*.08,d=new Uint8ClampedArray(base.data);
  if(m==='scan'||m==='bw')flat(d,base);
  if(m==='gray'||m==='bw')for(let i=0;i<d.length;i+=4){const l=.299*d[i]+.587*d[i+1]+.114*d[i+2];d[i]=d[i+1]=d[i+2]=l}
  if(m==='auto')for(let k=0;k<3;k++){const[lo,hi]=pct(d,k,.005,.995);lev(d,[k],lo,hi)}
  if(m==='gray'){const[lo,hi]=pct(d,0,.01,.99);lev(d,[0,1,2],lo,hi)}
  if(m==='scan'){const[lo]=pct(d,1,.01,.99);lev(d,[0,1,2],Math.min(lo,120),255)}
  let sh=0;if(m==='bw'){sh=128-otsu(d,0,16)}
  if(m!=='orig'||br||ct!==1)for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)d[i+k]=(d[i+k]+sh-128)*ct+128+br;
  if(sa!==1&&m!=='gray'&&m!=='bw')for(let i=0;i<d.length;i+=4){const l=.299*d[i]+.587*d[i+1]+.114*d[i+2];for(let k=0;k<3;k++)d[i+k]=l+(d[i+k]-l)*sa}
  if(bl)boxBlur(d,W,H,Math.max(1,Math.round(bl*Math.max(W,H)/1500)));
  if(sp){const c=d.slice(),R=W*4;for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=(y*W+x)*4;for(let k=0;k<3;k++){const v=4*c[p+k]-c[p+k-4]-c[p+k+4]-c[p+k-R]-c[p+k+R];d[p+k]=c[p+k]+sp*v}}}
  if(m==='bw')for(let i=0;i<d.length;i+=4){const v=d[i]>128?255:0;d[i]=d[i+1]=d[i+2]=v}
  res.width=W;res.height=H;rx.putImageData(new ImageData(d,W,H),0,0);fitRes();$('grid').hidden=!$('gd').checked;$('info').textContent=`${W} × ${H} px`;
}

/* ---------- controls ---------- */
$('empty').onclick=()=>$('file').click();
$('file').onchange=e=>{loadFile(e.target.files[0]);e.target.value=''};
['dragover','drop'].forEach(t=>$('scanPanel').addEventListener(t,e=>{e.preventDefault();e.stopPropagation();if(t==='drop')loadFile(e.dataTransfer.files[0])}));
$('ad').onclick=()=>src&&detect();
$('fu').onclick=()=>{if(src){q=full(0);draw();changed()}};
$('ro').onclick=()=>{if(!src)return;const c=cv(src.height,src.width),x=c.getContext('2d');x.translate(c.width,0);x.rotate(Math.PI/2);x.drawImage(src,0,0);setSrc(c);detect()};
addEventListener('resize',()=>{if(src)layout();fitRes()});
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{document.querySelector('.seg .on').classList.remove('on');b.classList.add('on');safe(render)});
['br','ct','sa','bl','sp'].forEach(i=>{const el=$(i),o=el.nextElementSibling,f=()=>o.textContent=el.value;f();el.oninput=()=>{f();clearTimeout(tr);tr=setTimeout(()=>safe(render),50)}});
const sched=()=>{clearTimeout(tm);tm=setTimeout(()=>safe(warp),150)};
$('w').oninput=()=>{auto=false;$('pr').value='c';const W=+$('w').value;if($('lk').checked)$('h').value=Math.round(W/ratio);else ratio=W/+$('h').value;sched()};
$('h').oninput=()=>{auto=false;$('pr').value='c';const H=+$('h').value;if($('lk').checked)$('w').value=Math.round(H*ratio);else ratio=+$('w').value/H;sched()};
$('pr').onchange=e=>{const v=e.target.value;if(v==='auto'){auto=true;if(src)autoSize()}else if(v!=='c'){auto=false;const r=+v;let W=+$('w').value||1000,H=Math.round(W/r);if(H>MAX){H=MAX;W=Math.round(H*r)}setWH(W,H)}sched()};

/* ---------- download ---------- */
const hosted=!!(window.claude&&window.claude.use);let dls=null;
if(hosted)window.claude.use('downloads').then(d=>dls=d).catch(()=>{});
async function blobOf(){
  const f=$('fm').value;
  if(f==='pdf'){const J=window.jspdf&&window.jspdf.jsPDF;if(!J)throw new Error('PDF library not loaded.');const W=res.width,H=res.height,p=new J({orientation:W>H?'l':'p',unit:'px',format:[W,H],hotfixes:['px_scaling']});p.addImage(res.toDataURL('image/jpeg',.92),'JPEG',0,0,W,H);return p.output('blob')}
  return new Promise(r=>res.toBlob(r,f==='png'?'image/png':'image/jpeg',.92));
}
$('dl').onclick=async()=>{
  if(!base)return say('Open an image first.');
  try{const b=await blobOf(),name=`${nm}-scan.${$('fm').value}`;
    if(hosted){if(!dls)return say('Downloads are not available in this view – use the standalone HTML file.');await dls.save({filename:name,data:b})}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
    say('✔ '+name)}
  catch(e){say(e&&e.code==='declined'?'Download cancelled.':'Download failed: '+((e&&e.message)||'unavailable here'))}
};
$('gd').onchange=()=>{$('grid').hidden=!base||!$('gd').checked};
$('gc').onchange=()=>{const r=$('gc').value==='red',g=$('grid').style;g.setProperty('--g',r?'#ff2b2b':'#00e5ff');g.setProperty('--g2',r?'#ff2b2b66':'#00e5ff80')};$('gc').onchange();
/* clear / reset */
$('clr').onclick=()=>{
  clearTimeout(tm);clearTimeout(tr);
  src=sd=base=bg=null;q=[];auto=true;ratio=1;drag=-1;nm='scan';
  ed.hidden=true;$('empty').hidden=false;ex.clearRect(0,0,ed.width,ed.height);
  res.width=2;res.height=2;res.style.width=res.style.height='';rx.clearRect(0,0,2,2);$('grid').hidden=true;$('info').textContent='—';
  $('w').value='';$('h').value='';$('pr').value='auto';$('lk').checked=true;
  ['br','ct','sa','bl','sp'].forEach(i=>{const s=$(i);s.value=0;s.nextElementSibling.textContent='0'});
  document.querySelector('.seg .on').classList.remove('on');document.querySelector('.seg [data-m="scan"]').classList.add('on');
  say('Cleared – open an image to begin.');
};

/* ---------- public API used by app.js ---------- */
window.FlatScan={load:loadFile,hasResult:()=>!!base,blob:blobOf,format:()=>$('fm').value,name:()=>nm,refresh:()=>{if(src)layout();fitRes()}};
})();
