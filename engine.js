// Local NLP engine: zero dependencies, nothing leaves the machine.
const D='monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun';
const R={
 deadline:new RegExp(`\\b(today|tonight|tomorrow|eod|eow|deadline|due|by (?:${D}|\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)?)|before \\d{1,2}|\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)|\\d{1,2}[\\/\\-.]\\d{1,2}(?:[\\/\\-.]\\d{2,4})?|(?:${D})|next week|this week|in \\d+ (?:hours?|mins?|minutes?|days?))\\b`,'i'),
 urgent:/\b(urgent|asap|immediately|important|critical|emergency|last chance|right now|hurry|must|mandatory|compulsory|priority)\b|!{2,}/i,
 action:/\b(please|pls|plz|kindly|need to|needs to|have to|make sure|don'?t forget|remember to|submit|send|bring|prepare|complete|finish|upload|fill|register|reply|confirm|review|share|update|check|call|pay|book|carry)\b/i,
 decision:/\b(decided|finali[sz]ed|confirmed|agreed|approved|let'?s go with|it'?s final|settled|selected|go ahead|sorted)\b/i,
 change:/\b(postponed|rescheduled|cancel+ed|changed|moved|shifted|delayed|preponed|venue|new time|no longer)\b/i,
 question:/\?\s*$|\b(can you|could you|will you|are you|did you|do you|who can|anyone)\b/i,
};
const STOP=new Set('the a an and or to of in on at for is are was were be been it this that with as by from we you i he she they my your our will can not no yes ok okay hi hello hey all guys please pls just so but if then there their have has had do does did get got let lets also everyone team what when where who how which about'.split(' '));
const NOISE=/^(ok+|okay|k|lol|haha+|hmm+|yes|yeah|yep|thanks|thank you|thx|nice|cool|👍|😂|noted|sure|hi|hello|gm|good morning)\W*$/i;

function parse(text){
 const out=[];
 const wa=/^\[?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:[ap]m)?)\]?\s*[-–]?\s*([^:]{1,40}?):\s(.*)$/i;
 const plain=/^([^:\n]{1,30}):\s+(.+)$/;
 for(const line of text.split(/\r?\n/)){
  if(!line.trim())continue;
  let m=line.match(wa);
  if(m)out.push({who:m[3].trim(),text:m[4].trim(),time:m[1]+' '+m[2]});
  else if(m=line.match(plain))out.push({who:m[1].trim(),text:m[2].trim(),time:''});
  else if(out.length)out[out.length-1].text+=' '+line.trim();
 }
 return out.filter(x=>!/omitted|end-to-end encrypted|deleted this message/i.test(x.text));
}

function analyze({text,me='',unread=0}){
 let msgs=parse(text);
 if(!msgs.length)throw new Error('Could not find any messages. Use "Name: message" lines or a WhatsApp export.');
 if(unread>0)msgs=msgs.slice(-unread);
 const names=me.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
 const items=msgs.map((m,i)=>{
  const t=m.text,low=t.toLowerCase(),tags=[],why=[];let s=0;
  const mine=names.some(n=>new RegExp('(^|\\W)@?'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\W|$)','i').test(t));
  const bcast=/@(all|everyone)|\b(everyone|all of you|guys|team)\b/i.test(t);
  const dl=t.match(R.deadline);
  if(NOISE.test(t.trim()))return{i,...m,score:0,level:'low',tags:[],why:[]};
  if(mine&&!names.includes(m.who.toLowerCase())){s+=4;tags.push('mention');why.push('mentions you')}
  else if(bcast){s+=1}
  if(R.urgent.test(t)){s+=3;tags.push('urgent');why.push('urgent language')}
  if(dl){s+=3;tags.push('deadline');why.push('time: '+dl[0])}
  if(R.change.test(t)){s+=3;tags.push('change');why.push('plan changed')}
  if(R.decision.test(t)){s+=3;tags.push('decision');why.push('decision made')}
  if(R.action.test(t)){s+=2;tags.push('task');why.push('action required')}
  if(R.question.test(t)&&(mine||bcast)){s+=2;tags.push('question');why.push('awaits reply')}
  if(t.length<15&&s<4)s=Math.max(0,s-1);
  const level=s>=9?'critical':s>=6?'high':s>=3?'medium':'low';
  return{i,...m,score:s,level,tags,why,due:dl?dl[0]:null};
 });
 const words={};
 msgs.forEach(m=>m.text.toLowerCase().match(/[a-z]{4,}/g)?.forEach(w=>{if(!STOP.has(w))words[w]=(words[w]||0)+1}));
 const topics=Object.entries(words).sort((a,b)=>b[1]-a[1]).slice(0,7).map(e=>e[0]);
 const people={};msgs.forEach(m=>people[m.who]=(people[m.who]||0)+1);
 const important=items.filter(x=>x.score>=3);
 const top=[...important].sort((a,b)=>b.score-a.score).slice(0,4).sort((a,b)=>a.i-b.i);
 const has=t=>important.filter(x=>x.tags.includes(t)).length;
 const words_total=msgs.reduce((n,m)=>n+m.text.split(/\s+/).length,0);
 const summary=`${msgs.length} messages from ${Object.keys(people).length} people about ${topics.slice(0,3).join(', ')}. `+
  `${has('mention')} mention you, ${has('task')} tasks, ${has('deadline')} deadlines, ${has('decision')} decisions, ${has('change')} changes.`;
 const stats={total:msgs.length,important:important.length,critical:items.filter(x=>x.level==='critical').length,
  noise:Math.round(100*items.filter(x=>x.level==='low').length/msgs.length),
  readMin:Math.max(1,Math.round(words_total/200)),briefSec:15};
 return{stats,summary,topics,people,items,top};
}
module.exports={analyze,parse};
