import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblyCaptionLines} from '../src/assembly-captions';
test('caption display normalizes source newlines without introducing extra timing',()=>{
 assert.deepEqual(assemblyCaptionLines('甲\n乙\r\n丙\n丁'),['甲 乙 丙 丁']);
 assert.deepEqual(assemblyCaptionLines('字'.repeat(90)),['字'.repeat(45),'字'.repeat(45)]);
 assert.throws(()=>assemblyCaptionLines('字'.repeat(97)),/safe area/);
});
test('long cues balance both lines instead of leaving a lone punctuation line',()=>{
 const text='为什么？因为代码是精确的东西。一个函数叫什么名字，你就该精确地找到它，而不是找个“意思差不多”的。';
 const lines=assemblyCaptionLines(text);
 assert.equal(lines.join(''),text);
 assert.equal(lines.length,2);
 assert.ok(Math.abs(lines[0].length-lines[1].length)<=2);
 assert.ok(!/^[，。！？：；、”’）》】]/.test(lines[1]));
 const punctuationAtSplit='字'.repeat(48)+'，'+'字'.repeat(47);
 const bounded=assemblyCaptionLines(punctuationAtSplit);
 assert.ok(bounded.every(s=>Array.from(s).length<=49));
 assert.ok(!bounded[1].startsWith('，'));
});
