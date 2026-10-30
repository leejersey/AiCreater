import React from 'react';
import {interpolate, Easing} from 'remotion';

export type WalletSceneProps = {
  frame:number; fps:number; width:number; height:number;
  theme:{background:string; foreground:string; muted:string; accent:string; secondary:string};
};

export default function WalletScene(props:WalletSceneProps) {
  const {theme:t,width,height}=props;
  const f=Math.max(0,Math.min(539,props.frame*30/props.fps));
  const motion=(start:number,end:number,from=0,to=1)=>interpolate(f,[start,end],[from,to],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic),
  });
  const stage=f<180?'loading':f<360?'blocked':'filtered';
  const filter=motion(360,438), release=motion(390,470);
  const crowded=motion(110,168)*(1-release);
  const full=f>=235&&f<425;
  const volume=interpolate(f,[0,35,170,360,480],[0,0.125,1,1,0.375],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const headline=f<180?'信息装入，容量有限':f<360?'无关信息，挤占预算':'移出无关，留下所需';
  const papers=[
    {id:'code',label:'相关代码',x:720,y:490,start:28,angle:-5,keep:true},
    {id:'task',label:'当前任务',x:950,y:505,start:62,angle:3,keep:true},
    {id:'noise-a',label:'旧的日志',x:1120,y:480,start:96,angle:-8,keep:false},
    {id:'noise-b',label:'无关文档',x:1220,y:505,start:124,angle:9,keep:false},
    {id:'extra',label:'更多信息',x:1490,y:490,start:190,angle:4,keep:false},
  ];
  const paperViews=papers.map((p,i)=>{
    const extra=p.id==='extra';
    const enter=motion(p.start,p.start+42);
    const exit=p.keep?0:motion(372+i*9,434+i*9);
    const settle=p.keep?motion(438,482):0;
    const bounce=extra?interpolate(f,[230,246,260,274],[0,-24,0,-7],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
    const x=extra?1735+(p.x-1735)*enter+bounce:(220+i*65)+(p.x-220-i*65)*enter;
    const destX=1570+(i-2)*22;
    const px=x+(destX-x)*exit+(p.id==='task'?50:10)*settle;
    const py=p.y-70*(1-enter)+(720-p.y)*exit-210*Math.sin(exit*Math.PI);
    const angle=p.angle*enter+(14-p.angle)*exit-p.angle*settle;
    const color=p.keep?t.accent:t.secondary;
    const location=exit>=1?'removed':exit>0?'exiting':extra&&enter===1?'blocked':enter===1?'wallet':'incoming';
    return <g key={p.id} data-paper={p.id} data-location={location}
      transform={`translate(${px} ${py}) rotate(${angle} 90 110) scale(${1-exit*0.3})`} opacity={enter}>
      <path d="M0 0 H145 L180 35 V225 H0 Z" fill={t.background} stroke={color} strokeWidth={2.5}/>
      <path d="M145 0 V35 H180" fill="none" stroke={color} strokeWidth={1.5}/>
      <path d="M8 8 H136 M8 8 V215 H171" fill="none" stroke={color} opacity={0.2}/>
      <text x={18} y={48} fontSize={21} fill={color}>{p.label}</text>
      {p.id==='code'?<g fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <text x={18} y={101} fontSize={35} fill={color} stroke="none" fontFamily="monospace">{'</>'}</text>
        <path d="M20 127 H105 M32 148 H145 M32 169 H114 M20 190 H70"/>
        <path d="M120 91 H151 M137 78 V104" strokeWidth={1.5} opacity={0.45}/>
      </g>:p.keep?<g stroke={color} fill="none" strokeWidth={2}>
        <path d="M18 83 H34 V99 H18 Z M22 90 L26 94 L32 86 M48 90 H148 M18 125 H34 V141 H18 Z M48 133 H132 M18 170 H148 M18 190 H112"/>
      </g>:<g stroke={color} strokeWidth={2} opacity={0.65}>
        {[0,1,2,3,4,5].map(n=><path key={n} d={`M18 ${82+n*20} H${n%2?126:154}`}/>)}
        <path d="M114 155 L151 192 M151 155 L114 192" strokeWidth={3}/>
      </g>}
      {p.keep&&<circle cx={153} cy={201} r={8} fill={t.accent}/>}
    </g>;
  });
  return <svg width={width} height={height} viewBox="0 0 1920 1080"
    data-stage={stage} style={{display:'block',background:t.background,fontFamily:'"Noto Sans SC", sans-serif',fontWeight:400}}
    role="img" aria-label={`上下文预算：${headline}`}>
    <defs>
      <pattern id="wallet-grid" width={48} height={48} patternUnits="userSpaceOnUse">
        <path d="M48 0 H0 V48" fill="none" stroke={t.muted} strokeWidth={0.7} opacity={0.11}/>
      </pattern>
      <linearGradient id="wallet-leather" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={t.muted} stopOpacity={0.17}/><stop offset="1" stopColor={t.muted} stopOpacity={0.035}/>
      </linearGradient>
      <linearGradient id="wallet-scan"><stop stopColor={t.accent} stopOpacity={0}/><stop offset="1" stopColor={t.accent} stopOpacity={0.2}/></linearGradient>
    </defs>
    <rect width={1920} height={1080} fill={t.background}/>
    <rect x={80} y={320} width={1760} height={620} fill="url(#wallet-grid)"/>
    <g stroke={t.muted} fill="none" strokeWidth={1} opacity={0.4}>
      <path d="M80 350 V320 H110 M1810 320 H1840 V350 M80 910 V940 H110 M1810 940 H1840 V910"/>
      <path d="M595 925 H1445 M620 914 V936 M1420 914 V936 M620 920 L628 925 L620 930 M1420 920 L1412 925 L1420 930"/>
    </g>
    <text x={122} y={212} fill={t.foreground} fontSize={88}>上下文预算</text>
    <text x={128} y={275} fill={t.muted} fontSize={30}>{headline}</text>
    <g data-wallet-assembly="visible">
      <path d="M620 681 V629 Q620 599 654 599 H1386 Q1420 599 1420 633 V862 Q1420 888 1394 888 H648 Q620 888 620 860 Z"
        fill={t.background} stroke={t.muted} strokeWidth={3}/>
      <path d="M635 645 H1405" stroke={t.accent} strokeWidth={2} opacity={0.6}/>
      {paperViews}
      <g data-wallet="body" transform={`translate(0 ${crowded*4})`}>
        <path d="M620 670 Q808 690 1020 670 Q1230 650 1420 670 V865 Q1420 898 1385 898 H655 Q620 898 620 865 Z"
          fill={t.background} stroke={t.accent} strokeWidth={3}/>
        <path d="M620 670 Q808 690 1020 670 Q1230 650 1420 670 V865 Q1420 898 1385 898 H655 Q620 898 620 865 Z" fill="url(#wallet-leather)"/>
        <path d="M638 694 Q830 711 1020 692 Q1230 674 1402 692 V860 Q1402 879 1382 879 H658 Q638 879 638 859 Z"
          fill="none" stroke={t.muted} strokeWidth={1.5} strokeDasharray="5 7" opacity={0.7}/>
        <text x={673} y={780} fill={t.foreground} fontSize={26}>CONTEXT</text>
        <text x={675} y={815} fill={t.muted} fontSize={18} fontFamily="monospace">FINITE BY DESIGN</text>
        <g data-wallet="clasp">
          <path d="M1315 748 H1442 Q1458 748 1458 764 V813 Q1458 830 1442 830 H1315 Q1295 830 1295 810 V768 Q1295 748 1315 748Z"
            fill={t.background} stroke={t.accent} strokeWidth={2.5}/>
          <circle cx={1329} cy={789} r={11} fill="none" stroke={t.accent} strokeWidth={2}/>
          <circle cx={1329} cy={789} r={3} fill={t.accent}/>
          <path d="M1384 760 V818" stroke={t.muted} strokeDasharray="4 5"/>
        </g>
      </g>
    </g>
    <g data-capacity={full?'blocked':'available'}>
      <path d="M1450 462 V684 M1441 462 H1459 M1441 684 H1459" fill="none" stroke={full?t.secondary:t.muted} strokeWidth={full?3:1.5}/>
      <g opacity={motion(186,215)*(1-release)}>
        <path d="M1468 575 H1490 M1474 568 L1467 575 L1474 582" stroke={t.secondary} fill="none" strokeWidth={2}/>
        <circle cx={1564} cy={427} r={18} stroke={t.secondary} fill={t.background} strokeWidth={2}/>
        <path d="M1552 440 L1576 414" stroke={t.secondary} strokeWidth={2}/>
        <text x={1490} y={391} fill={t.secondary} fontSize={23}>容量受阻</text>
      </g>
    </g>
    <g opacity={motion(365,392)}>
      <path d="M1532 781 V911 H1800 V781 M1520 781 H1812" fill="none" stroke={t.secondary} strokeWidth={2}/>
      <path d="M1544 902 H1788" stroke={t.secondary} opacity={0.4}/>
      <text x={1542} y={965} fill={t.secondary} fontSize={24}>无关内容移出</text>
    </g>
    <g data-filter={f>=360&&f<450?'active':'idle'} opacity={motion(355,368)*(1-motion(440,458))}>
      <rect x={640+filter*770-60} y={453} width={60} height={437} fill="url(#wallet-scan)"/>
      <path d={`M${640+filter*770} 443 V902`} stroke={t.accent} strokeWidth={3}/>
      <path d={`M${632+filter*770} 443 H${648+filter*770} M${632+filter*770} 902 H${648+filter*770}`} stroke={t.accent} strokeWidth={3}/>
      <text x={640+filter*770} y={423} textAnchor="middle" fill={t.accent} fontSize={22}>相关性筛选</text>
    </g>
    <g transform="translate(128 475)" opacity={motion(8,30)}>
      <text y={65} fill={full?t.secondary:t.accent} fontSize={40}>{f<180?'有限容量':f<360?'噪声挤占':'只留所需'}</text>
      <g data-volume-band="uncalibrated" aria-label="上下文占用示意，无刻度">
        <rect y={99} width={268} height={12} fill={t.muted} opacity={0.18}/>
        <rect y={99} width={268*volume} height={12} fill={full?t.secondary:t.accent}/>
      </g>
      <path d="M0 147 H268" stroke={t.muted} opacity={0.4}/>
      <text y={188} fill={t.muted} fontSize={23}>{f<360?'信息有取舍，容量有边界':'相关代码 + 当前任务'}</text>
    </g>
  </svg>;
}
