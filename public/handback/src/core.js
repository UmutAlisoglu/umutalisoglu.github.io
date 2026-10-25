(function(root){
  'use strict';
  const LIMITS=Object.freeze({bytes:25000000,images:8,imageBytes:2000000,totalImageBytes:8000000});
  const e=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  function text(value,max,label){if(typeof value!=='string'||value.length>max)throw new Error(`${label} must be text, up to ${max.toLocaleString('en-US')} characters.`);return value;}
  function list(value,max,label,convert){if(!Array.isArray(value)||value.length>max)throw new Error(`${label}: up to ${max} items are supported.`);return value.map(convert);}
  function url(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error();return u.href;}catch{throw new Error('Use a complete http:// or https:// link without embedded credentials.');}}
  function imageBytes(data){
    if(typeof data!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('Screenshots must be embedded PNG, JPEG or WebP images.');
    const base=data.slice(data.indexOf(',')+1);
    if(base.length%4!==0)throw new Error('A screenshot has invalid base64 data.');
    return base.length/4*3-(base.endsWith('==')?2:base.endsWith('=')?1:0);
  }
  function project(input){
    if(!input||input.format!=='handback'||input.version!==1)throw new Error('Choose a Handback version 1 project JSON file.');
    let total=0;
    return {format:'handback',version:1,title:text(input.title,140,'Project title'),summary:text(input.summary,5000,'Summary'),from:text(input.from,160,'From'),to:text(input.to,160,'To'),
      notes:list(input.notes,30,'Notes',n=>({title:text(n.title,140,'Note title'),body:text(n.body,8000,'Note')})),
      tasks:list(input.tasks,100,'Next steps',t=>{if(typeof t.done!=='boolean')throw new Error('Task status must be true or false.');return {text:text(t.text,1000,'Task'),owner:text(t.owner,160,'Task owner'),due:text(t.due,10,'Due date'),done:t.done};}),
      decisions:list(input.decisions,50,'Decisions',d=>({title:text(d.title,200,'Decision'),reason:text(d.reason,5000,'Decision context')})),
      questions:list(input.questions,50,'Open questions',q=>({title:text(q.title,200,'Question'),context:text(q.context,5000,'Question context')})),
      links:list(input.links,60,'Links',l=>({label:text(l.label,200,'Link label'),url:text(l.url,2000,'Link URL')})),
      images:list(input.images,LIMITS.images,'Screenshots',im=>{const bytes=imageBytes(im.data);if(bytes>LIMITS.imageBytes)throw new Error('Each processed screenshot must be 2 MB or smaller.');total+=bytes;if(total>LIMITS.totalImageBytes)throw new Error('Screenshots can total up to 8 MB.');return {name:text(im.name,240,'Image name'),caption:text(im.caption,1000,'Caption'),data:im.data};})};
  }
  function parse(source){if(typeof source!=='string'||new TextEncoder().encode(source).length>LIMITS.bytes)throw new Error('Project JSON must be 25 MB or smaller.');let data;try{data=JSON.parse(source)}catch{throw new Error('That file is not valid JSON. Choose a saved Handback project.');}return project(data);}
  const populated=item=>Object.values(item).some(value=>typeof value==='string'&&value.trim());
  function analyze(input){
    const p=project(input),errors=[],warnings=[];
    if(!p.title.trim())errors.push('Give the handover a project title.');
    if(!p.summary.trim())warnings.push('Add a short summary so the next person has context.');
    if(!p.to.trim())warnings.push('Name the next owner, or leave “To” open for a reusable handover.');
    p.links.forEach((link,index)=>{if(!populated(link))return;try{url(link.url)}catch{errors.push(`Link ${index+1}: use a complete http:// or https:// URL without credentials.`);}});
    p.tasks.forEach((task,index)=>{if(!populated(task))return;if(!task.text.trim())errors.push(`Next step ${index+1} needs a task description.`);if(task.due&&!/^\d{4}-\d{2}-\d{2}$/.test(task.due))errors.push(`Next step ${index+1} needs a valid YYYY-MM-DD date.`);else if(task.due){const d=new Date(task.due+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==task.due)errors.push(`Next step ${index+1} has an invalid calendar date.`);}});
    const tasks=p.tasks.filter(populated);
    const pending=tasks.filter(task=>!task.done);
    if(pending.some(task=>!task.owner.trim()))warnings.push('Some open next steps have no owner yet.');
    return {errors,warnings,pending:pending.length,completed:tasks.length-pending.length,notes:p.notes.filter(populated).length,decisions:p.decisions.filter(populated).length,questions:p.questions.filter(populated).length,links:p.links.filter(populated).length,images:p.images.length};
  }
  function bodyHTML(p){
    const a=analyze(p);if(a.errors.length)throw new Error(a.errors.join(' '));
    const sections=[];
    if(p.summary.trim())sections.push(`<section><h2>The short version</h2><div class="prose">${e(p.summary)}</div></section>`);
    const tasks=p.tasks.filter(populated);
    if(tasks.length)sections.push(`<section><h2>Next steps <span>${a.pending} open · ${a.completed} done</span></h2><div class="tasks">${[...tasks.filter(t=>!t.done),...tasks.filter(t=>t.done)].map(t=>`<article class="task"><span class="badge ${t.done?'done':''}">${t.done?'Done':'Open'}</span><div><strong>${e(t.text)}</strong><p>${e(t.owner||'Owner not assigned')}${t.due?' · Due '+e(t.due):''}</p></div></article>`).join('')}</div></section>`);
    for(const [name,items,bodyKey] of [['Context & notes',p.notes,'body'],['Decisions & why',p.decisions,'reason'],['Open questions',p.questions,'context']]){
      const populatedItems=items.filter(populated);if(populatedItems.length)sections.push(`<section><h2>${name}</h2>${populatedItems.map(item=>`<article class="note">${item.title?`<h3>${e(item.title)}</h3>`:''}<div class="prose">${e(item[bodyKey])}</div></article>`).join('')}</section>`);
    }
    const links=p.links.filter(populated);if(links.length)sections.push(`<section><h2>Useful links</h2><ul class="links">${links.map(l=>`<li><a href="${e(url(l.url))}" target="_blank" rel="noopener noreferrer">${e(l.label||l.url)} ↗</a><small>${e(url(l.url))}</small></li>`).join('')}</ul></section>`);
    if(p.images.length)sections.push(`<section><h2>Screenshots & references</h2>${p.images.map((im,i)=>`<figure><img src="${im.data}" alt="${e(im.caption||'Screenshot '+(i+1))}">${im.caption?`<figcaption>${e(im.caption)}</figcaption>`:''}</figure>`).join('')}</section>`);
    return sections.join('');
  }
  function handoverHTML(input){const p=project(input),a=analyze(p);if(a.errors.length)throw new Error(a.errors.join(' '));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${e(p.title)} — Handover</title><style>*{box-sizing:border-box}body{margin:0;background:#f8f5ef;color:#3e3026;font:15px/1.85 system-ui,sans-serif}.wrap{width:min(900px,calc(100% - 40px));margin:auto}header{padding:55px 0 30px;border-bottom:1px solid #e5dbce}.eyebrow{font-size:10px;letter-spacing:1.8px;color:#8b735a}h1{font-size:42px;line-height:1.15;letter-spacing:-1.5px;overflow-wrap:anywhere}h2{font-size:23px;letter-spacing:-.5px;line-height:1.4}h2 span{font-size:12px;font-weight:400;color:#897562;margin-left:12px}h3{font-size:16px;line-height:1.5;margin:0 0 9px}.people{color:#786653;overflow-wrap:anywhere}.people strong{color:#3e3026}section{padding:30px 0;border-bottom:1px solid #e5dbce}.prose{white-space:pre-wrap;overflow-wrap:anywhere}.note{background:#fff;border:1px solid #e7dfd4;border-radius:14px;padding:22px;margin:14px 0}.task{display:flex;gap:17px;padding:18px 0;border-bottom:1px solid #ebe1d5}.task:last-child{border:0}.task strong{font-weight:550;white-space:pre-wrap;overflow-wrap:anywhere}.task p{font-size:12px;color:#7a6856;margin:5px 0 0}.badge{font-size:10px;border-radius:20px;background:#f5e7ce;color:#865c24;padding:3px 12px;align-self:start;white-space:nowrap}.badge.done{background:#e5eedf;color:#567442}.links{list-style:none;padding:0}.links li{margin:15px 0}.links a{color:#966039;overflow-wrap:anywhere}.links small{display:block;font-size:11px;color:#86715d;overflow-wrap:anywhere}figure{margin:25px 0}figure img{display:block;width:auto;max-width:100%;height:auto;max-height:900px;border:1px solid #ded4c5;border-radius:10px}figcaption{font-size:12px;color:#7a6856;margin-top:10px;white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:11px;color:#8b735a;padding:25px 0 40px}:focus-visible{outline:3px solid #b47d44;outline-offset:4px}@media(max-width:500px){h1{font-size:33px}.note{padding:18px}}@media print{body{background:white}.wrap{width:100%}header{padding-top:0}section{padding-block:20px}.note,.task,figure{break-inside:avoid}a{color:inherit}@page{margin:15mm}}</style></head><body><header class="wrap"><p class="eyebrow">PROJECT HANDOVER</p><h1>${e(p.title)}</h1><p class="people">${p.from?`From <strong>${e(p.from)}</strong>`:''}${p.from&&p.to?' → ':''}${p.to?`To <strong>${e(p.to)}</strong>`:''}</p><p class="people">${a.pending} open next steps · ${a.decisions} decisions · ${a.questions} open questions</p></header><main class="wrap">${bodyHTML(p)}</main><footer class="wrap">Made with Handback by Umut Alisoglu. This is a self-contained snapshot, not a live task board. Images are embedded and no scripts run. Links open external websites only when selected. Use Print to save a PDF. This file includes the shared project details; send it to the intended recipients.</footer></body></html>`;
  }
  function markdown(input){const p=project(input);const a=analyze(p);if(a.errors.length)throw new Error(a.errors.join(' '));const plain=v=>String(v).replace(/[\\`*_{}\[\]<>#!|]/g,'\\$&');let s=`# ${plain(p.title)}\n\n${p.from?'From: '+plain(p.from)+'\n':''}${p.to?'To: '+plain(p.to)+'\n':''}\n## The short version\n\n${plain(p.summary)}\n`;
    if(p.tasks.filter(populated).length)s+='\n## Next steps\n\n'+p.tasks.filter(populated).map(t=>`- [${t.done?'x':' '}] ${plain(t.text)}${t.owner?' — '+plain(t.owner):''}${t.due?' · Due '+t.due:''}`).join('\n')+'\n';
    for(const [title,items,key]of[['Context & notes',p.notes,'body'],['Decisions & why',p.decisions,'reason'],['Open questions',p.questions,'context']])if(items.filter(populated).length)s+=`\n## ${title}\n\n`+items.filter(populated).map(n=>`### ${plain(n.title||'Note')}\n\n${plain(n[key])}`).join('\n\n')+'\n';
    if(p.links.filter(populated).length)s+='\n## Links\n\n'+p.links.filter(populated).map(l=>`- ${plain(l.label||'Link')}: ${url(l.url)}`).join('\n')+'\n';
    if(p.images.length)s+='\n## Screenshots\n\nScreenshots are embedded in the HTML packet and project JSON, not this Markdown file.\n\n'+p.images.map((im,i)=>`- ${plain(im.caption||'Screenshot '+(i+1))}`).join('\n')+'\n';
    return s;
  }
  const api={LIMITS,project,parse,analyze,handoverHTML,markdown,safeURL:url,imageBytes,escapeHTML:e};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HandbackCore=Object.freeze(api);
})(globalThis);
