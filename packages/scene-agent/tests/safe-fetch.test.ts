import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedAddress,publicAddress,safeFetch} from '../src/provider/safe-fetch';
import {ProviderError} from '../src/provider/types';

const answers=(...addresses:string[])=>async()=>addresses.map(address=>({address,family:address.includes(':')?6:4}));

test('only public addresses pass, including the IPv4 inside a mapped IPv6 address',()=>{
 for(const a of ['8.8.8.8','93.184.216.34','2606:4700::1111'])assert.equal(publicAddress(a),true,a);
 for(const a of ['127.0.0.1','10.0.0.1','172.16.5.5','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','198.18.0.66','224.0.0.1',
  '::1','::','fd00::1','fe80::1','::ffff:127.0.0.1','::ffff:10.0.0.1','2001:db8::1','not-an-ip'])assert.equal(publicAddress(a),false,a);
});

test('a name with any private answer is refused before connecting; a declared fake-IP range is accepted',async()=>{
 await assert.rejects(checkedAddress('evil.example',answers('8.8.8.8','10.0.0.1'),{}),(e:unknown)=>e instanceof ProviderError&&e.code==='destination');
 await assert.rejects(checkedAddress('api.deepseek.com',answers('198.18.0.66'),{}),(e:unknown)=>e instanceof ProviderError&&e.code==='destination');
 assert.equal((await checkedAddress('api.deepseek.com',answers('198.18.0.66'),{LLM_FAKE_IP_CIDR:'198.18.0.0/15'})).address,'198.18.0.66');
 await assert.rejects(checkedAddress('x.example',answers('10.0.0.1'),{LLM_FAKE_IP_CIDR:'198.18.0.0/15'}));
 await assert.rejects(checkedAddress('x.example',answers('8.8.8.8'),{LLM_FAKE_IP_CIDR:'nonsense'}));
});

test('the fetch refuses plain http and private destinations without sending anything',async()=>{
 let resolved=0;
 const fetch=safeFetch(async()=>{resolved++;return [{address:'127.0.0.1',family:4}];},{});
 await assert.rejects(fetch('http://api.example.com/v1/chat/completions',{method:'POST'}),(e:unknown)=>e instanceof ProviderError&&e.code==='destination');
 assert.equal(resolved,0);
 await assert.rejects(fetch('https://api.example.com/v1/chat/completions',{method:'POST',body:'{}'}),(e:unknown)=>e instanceof ProviderError&&e.code==='destination');
 assert.equal(resolved,1);
});
