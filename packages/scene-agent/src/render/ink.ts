// Measures how much of a rendered frame differs from the background, so an empty picture cannot pass as clean.
// Minimal PNG reader for what Chrome screenshots produce: 8-bit RGB/RGBA, non-interlaced.
import {inflateSync} from 'node:zlib';

export type DecodedPng={width:number;height:number;channels:3|4;pixels:Buffer};

export function decodePng(data:Buffer):DecodedPng{
 if(data.length<8||data.readUInt32BE(0)!==0x89504e47)throw Error('png: bad signature');
 let offset=8,width=0,height=0,channels:3|4=4;
 const idat:Buffer[]=[];
 while(offset<data.length){
  const length=data.readUInt32BE(offset),type=data.toString('latin1',offset+4,offset+8),body=data.subarray(offset+8,offset+8+length);
  if(type==='IHDR'){
   width=body.readUInt32BE(0);height=body.readUInt32BE(4);
   const depth=body[8],color=body[9],interlace=body[12];
   if(depth!==8||(color!==2&&color!==6)||interlace!==0)throw Error(`png: unsupported format (depth ${depth}, color ${color}, interlace ${interlace})`);
   channels=color===6?4:3;
  }else if(type==='IDAT')idat.push(body);
  else if(type==='IEND')break;
  offset+=12+length;
 }
 const raw=inflateSync(Buffer.concat(idat));
 const stride=width*channels,pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  const out=pixels.subarray(y*stride,(y+1)*stride),prev=y?pixels.subarray((y-1)*stride,y*stride):undefined;
  for(let x=0;x<stride;x++){
   const a=x>=channels?out[x-channels]:0,b=prev?prev[x]:0,c=prev&&x>=channels?prev[x-channels]:0;
   let v=line[x];
   if(filter===1)v+=a;
   else if(filter===2)v+=b;
   else if(filter===3)v+=(a+b)>>1;
   else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   else if(filter!==0)throw Error(`png: bad filter ${filter}`);
   out[x]=v&255;
  }
 }
 return{width,height,channels,pixels};
}

/** Fraction of pixels whose RGB differs from `background` by more than `tolerance` (sum of channel differences). */
export function inkCoverage(png:DecodedPng,background:string,tolerance=48):number{
 const bg=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
 let ink=0;
 const count=png.width*png.height;
 for(let i=0;i<count;i++){
  const o=i*png.channels;
  if(Math.abs(png.pixels[o]-bg[0])+Math.abs(png.pixels[o+1]-bg[1])+Math.abs(png.pixels[o+2]-bg[2])>tolerance)ink++;
 }
 return count?ink/count:0;
}
