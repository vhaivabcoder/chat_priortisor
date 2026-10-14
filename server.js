const http=require('http'),fs=require('fs'),path=require('path');
const {analyze}=require('./engine');
const DB=path.join(__dirname,'data.json');
const load=()=>{try{return JSON.parse(fs.readFileSync(DB))}catch{return{history:[]}}};
const save=d=>fs.writeFileSync(DB,JSON.stringify(d));
async function llm(prompt){ // optional: local Ollama, still on-device
 try{const r=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',body:JSON.stringify({model:process.env.MODEL||'llama3.2',prompt,stream:false}),signal:AbortSignal.timeout(60000)});
 return (await r.json()).response?.trim()||null}catch{return null}}
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};
http.createServer(async(req,res)=>{
 const u=req.url.split('?')[0];
 if(req.method==='GET'&&!u.startsWith('/api')){
  const f=u==='/'?'index.html':u.slice(1);const p=path.join(__dirname,'public',path.normalize(f).replace(/^(\.\.[\/\\])+/,''));
  return fs.readFile(p,(e,b)=>e?(res.writeHead(404),res.end('404')):(res.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':'text/plain'}),res.end(b)));
 }
 let body='';for await(const c of req)body+=c;
 let j={};try{j=JSON.parse(body||'{}')}catch{}
 const db=load();
 try{
  if(u==='/api/analyze'){
   const r=analyze(j);
   if(j.useLLM){const a=await llm('Write a 3-sentence "what did I miss" briefing for '+(j.me||'the user')+' from these key chat messages:\n'+r.top.map(x=>x.who+': '+x.text).join('\n'));if(a)r.summary=a;r.ai=!!a}
   const rec={id:Date.now().toString(36),ts:Date.now(),me:j.me||'',title:r.topics.slice(0,3).join(' · ')||'Chat',result:r,done:[]};
   db.history.unshift(rec);db.history=db.history.slice(0,30);save(db);return send(res,200,rec);
  }
  if(u==='/api/history')return send(res,200,db.history.map(({id,ts,title,result})=>({id,ts,title,n:result.stats.total,c:result.stats.critical})));
  if(u==='/api/get'){const r=db.history.find(x=>x.id===j.id);return r?send(res,200,r):send(res,404,{error:'not found'})}
  if(u==='/api/done'){const r=db.history.find(x=>x.id===j.id);if(!r)return send(res,404,{});
   r.done=j.done?[...new Set([...r.done,j.i])]:r.done.filter(x=>x!==j.i);save(db);return send(res,200,r.done)}
  if(u==='/api/delete'){db.history=db.history.filter(x=>x.id!==j.id);save(db);return send(res,200,{ok:1})}
  send(res,404,{error:'no route'});
 }catch(e){send(res,400,{error:e.message})}
}).listen(3000,'127.0.0.1',()=>console.log('CatchUp running -> http://localhost:3000 (local only)'));
