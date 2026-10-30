export function assemblyCaptionLines(text:string):string[]{
 const chars=Array.from(text.replace(/[\r\n]+/g,' '));
 if(chars.length>96)throw Error('assembly_caption: cue exceeds two-line safe area');
 if(chars.length<=48)return chars.length?[chars.join('')]:[];
 let split=Math.ceil(chars.length/2);
 if(/^[，。！？：；、”’）》】]$/.test(chars[split]))split++;
 return [chars.slice(0,split).join(''),chars.slice(split).join('')];
}
