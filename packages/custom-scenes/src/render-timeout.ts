export function renderTimeouts(durationInFrames:number):{cancelMs:number;childMs:number}{
 if(!Number.isSafeInteger(durationInFrames)||durationInFrames<=0)throw Error('workbench: invalid render duration');
 // Allow 200ms per frame for longer courses; leave cleanup time before the 30-minute export lease.
 const cancelMs=Math.min(1710000,Math.max(570000,durationInFrames*200));
 return {cancelMs,childMs:cancelMs+30000};
}
