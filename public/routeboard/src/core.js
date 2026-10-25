(function(root){
  'use strict';
  const LIMITS = Object.freeze({ steps:80, choices:8, body:6000, bytes:2000000 });
  const e = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  function text(value, max, label) { if(typeof value !== 'string' || value.length > max) throw new Error(`${label} must be text, up to ${max.toLocaleString('en-US')} characters.`); return value; }
  function project(input) {
    if(!input || input.format !== 'routeboard' || input.version !== 1) throw new Error('Choose a Routeboard version 1 project JSON file.');
    if(!Array.isArray(input.steps) || !input.steps.length || input.steps.length > LIMITS.steps) throw new Error('A guide needs 1–80 steps.');
    const ids = new Set();
    const steps = input.steps.map((step,index) => {
      if(!step || typeof step.id!=='string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(step.id) || ids.has(step.id)) throw new Error(`Step ${index+1} has an invalid or repeated ID.`);
      ids.add(step.id);
      if(!Array.isArray(step.choices) || step.choices.length > LIMITS.choices) throw new Error('Each step can have up to 8 choices.');
      return { id:step.id, title:text(step.title,120,'Step title'), body:text(step.body,6000,'Step instructions'), choices:step.choices.map(choice => ({label:text(choice.label,120,'Choice label'),to:text(choice.to,64,'Next step')})) };
    });
    return { format:'routeboard', version:1, title:text(input.title,120,'Guide title'), summary:text(input.summary,800,'Guide summary'), start:text(input.start,64,'Starting step'), steps };
  }
  function parse(source) {
    if(typeof source !== 'string' || new TextEncoder().encode(source).length > LIMITS.bytes) throw new Error('Project JSON must be 2 MB or smaller.');
    let value;try{value=JSON.parse(source)}catch{throw new Error('That file is not valid JSON. Choose a saved Routeboard project.');}
    return project(value);
  }
  function analyze(input) {
    const data = project(input), errors=[],warnings=[],reachable=new Set(),active=new Set(),cycles=new Set();
    const map = new Map(data.steps.map(step => [step.id,step]));
    if(!data.title.trim()) errors.push('Give your guide a title.');
    if(!map.has(data.start)) errors.push('Choose an existing starting step.');
    function walk(id) {
      if(active.has(id)){cycles.add(id);return;}
      if(reachable.has(id)||!map.has(id))return;
      reachable.add(id);active.add(id);
      const step=map.get(id),name=step.title.trim()||'Untitled step';
      if(!step.title.trim())errors.push(`A connected step needs a title (${id}).`);
      if(!step.body.trim())warnings.push(`${name} has no instructions yet.`);
      for(const choice of step.choices){
        if(!choice.label.trim())errors.push(`${name} has a choice without a label.`);
        if(!map.has(choice.to))errors.push(`${name}: “${choice.label||'Unnamed choice'}” needs an existing destination.`);
        else walk(choice.to);
      }
      active.delete(id);
    }
    walk(data.start);
    const unused=data.steps.filter(step=>!reachable.has(step.id));
    if(unused.length)warnings.push(`${unused.length} unconnected ${unused.length===1?'step is':'steps are'} left out of the shared guide. Project JSON keeps every step.`);
    if(cycles.size)warnings.push('This guide contains a loop. Readers can revisit a step; check that this is intentional.');
    const endings=data.steps.filter(step=>reachable.has(step.id)&&!step.choices.length).length;
    if(reachable.size&&!endings)warnings.push('No connected step is an ending. Add a step with no choices if readers should finish somewhere.');
    return { errors:[...new Set(errors)], warnings:[...new Set(warnings)], reachable:[...reachable], endings };
  }
  function guideHTML(input) {
    const data=project(input), analysis=analyze(data);
    if(analysis.errors.length)throw new Error(analysis.errors.join(' '));
    const start=`step-${data.start}`;
    const sections=analysis.reachable.map(id=>{
      const step=data.steps.find(step=>step.id===id);
      return `<article id="step-${e(id)}"${id===data.start?' class="start"':''} aria-labelledby="title-${e(id)}"><p class="eyebrow">${step.choices.length?'NEXT STEP':'END OF THIS ROUTE'}</p><h2 id="title-${e(id)}">${e(step.title)}</h2><div class="instructions">${e(step.body)}</div>${step.choices.length?`<nav aria-label="Choose your next step">${step.choices.map(choice=>`<a class="choice" href="#step-${e(choice.to)}">${e(choice.label)} <span aria-hidden="true">→</span></a>`).join('')}</nav>`:'<p class="finished">You’ve reached the end of this route.</p>'}<a class="restart" href="#${e(start)}">Start again ↺</a></article>`;
    }).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${e(data.title)}</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3f5fa;color:#24304a;font:16px/1.8 system-ui,sans-serif}.wrap{width:min(760px,calc(100% - 40px));margin:auto}header{padding:52px 0 28px}h1{font-size:38px;line-height:1.2;letter-spacing:-1.4px}h2{font-size:28px;line-height:1.3;letter-spacing:-.8px}header p,footer{color:#626c80}.eyebrow{font-size:10px;letter-spacing:1.5px;color:#68769a}.instructions{white-space:pre-wrap;overflow-wrap:anywhere}article{display:none;background:#fff;border:1px solid #dce1ed;border-radius:22px;padding:36px;scroll-margin-top:25px}article.start,article:target{display:block}main:has(article:target)>article.start:not(:target){display:none}nav{display:grid;gap:12px;margin:28px 0}.choice{display:flex;justify-content:space-between;gap:20px;text-decoration:none;background:#edf1ff;color:#29458e;border:1px solid #dce3fa;border-radius:12px;padding:15px 18px;overflow-wrap:anywhere}.choice:hover{background:#e2e9ff}.restart{display:inline-block;font-size:13px;color:#536a9d;margin-top:20px}.finished{padding:16px;background:#eef5e8;border-radius:10px;margin-top:28px}footer{font-size:12px;padding:28px 0 40px}footer p{margin:8px 0}h1,header p{overflow-wrap:anywhere}:focus-visible{outline:3px solid #516fce;outline-offset:4px}@media(max-width:500px){header{padding-top:30px}h1{font-size:30px}article{padding:25px}h2{font-size:24px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{article,article.start,main:has(article:target)>article.start:not(:target){display:block}article{break-inside:avoid;margin-bottom:20px}nav a::after{content:' (' attr(href) ')';font-size:11px}.restart{display:none}}</style></head><body><header class="wrap"><p class="eyebrow">AN INTERACTIVE GUIDE</p><h1>${e(data.title)}</h1><p>${e(data.summary)}</p></header><main class="wrap">${sections}</main><footer class="wrap"><p>Choose an answer to move through the guide. Use your browser’s Back button to revisit your previous choice.</p><p>Made with Routeboard by Umut Alisoglu. This file works offline without scripts. Only connected steps are included; the editable project is saved separately.</p></footer></body></html>`;
  }
  const api={LIMITS,project,parse,analyze,guideHTML,escapeHTML:e};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RouteboardCore=Object.freeze(api);
})(globalThis);
