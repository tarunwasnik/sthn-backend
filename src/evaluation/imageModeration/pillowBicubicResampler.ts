const P=22,S=2**P,B=2**(P-1);
type Row={start:number;weights:number[]};
const kernel=(x:number)=>{x=Math.abs(x);return x<1?1.5*x*x*x-2.5*x*x+1:x<2?-0.5*x*x*x+2.5*x*x-4*x+2:0};
const rows=(input:number,output:number):Row[]=>{const scale=input/output,fs=Math.max(scale,1),support=2*fs;return Array.from({length:output},(_,i)=>{const center=(i+.5)*scale;const start=Math.max(0,Math.floor(center-support+.5)),end=Math.min(input,Math.floor(center+support+.5));let w=Array.from({length:end-start},(_,j)=>kernel((j+start-center+.5)/fs)),sum=w.reduce((a,b)=>a+b,0);if(sum)w=w.map(x=>x/sum);return{start,weights:w.map(x=>x<0?Math.trunc(x*S-.5):Math.trunc(x*S+.5))}})};
const clip=(v:number)=>v<0?0:v>255?255:v;
const pass=(src:Uint8Array,sw:number,sh:number,r:Row[],horizontal:boolean)=>{const ow=horizontal?r.length:sw,oh=horizontal?sh:r.length,out=new Uint8Array(ow*oh*3);for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const q=horizontal?r[x]:r[y];for(let c=0;c<3;c++){let a=B;for(let k=0;k<q.weights.length;k++){const sx=horizontal?q.start+k:x,sy=horizontal?y:q.start+k;a+=src[(sy*sw+sx)*3+c]*q.weights[k]}out[(y*ow+x)*3+c]=clip(Math.floor(a/S))}}return out};
export const pillowBicubicResizeRgb=(src:Uint8Array,w:number,h:number,ow:number,oh:number)=>{if(!Number.isInteger(w)||!Number.isInteger(h)||!Number.isInteger(ow)||!Number.isInteger(oh)||w<1||h<1||ow<1||oh<1||src.length!==w*h*3)throw Error('invalid RGB resize input');const x=rows(w,ow),y=rows(h,oh);return pass(pass(src,w,h,x,true),ow,h,y,false)};
export const pillowCoefficientRows=rows;
export const pillowSignedExtract=(value:number)=>Math.floor(value/S);
