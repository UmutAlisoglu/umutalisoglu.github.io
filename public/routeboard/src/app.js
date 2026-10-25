(function(){
  'use strict';
  const C=RouteboardCore,$=s=>document.querySelector(s),clone=v=>JSON.parse(JSON.stringify(v));
  let data=C.project(clone(RouteboardSamples.printer)),selected=data.start,path=[data.start],dirty=false,importToken=0;
  const urls=new Set();
  function n(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function status(message){$('#status').textContent=message;}
  function changed(){dirty=true;$('#session-note').textContent='Working copy · Nothing is saved until you download a project.';status('Changes are in this tab only. Save project to keep them.');refresh();}
  function current(){return data.steps.find(step=>step.id===selected);}
  function acceptReplace(){return !dirty||confirm('Replace this working copy? Save project first if you want to keep your edits.');}
  function replace(next,example=false){data=C.project(next);selected=data.start;path=[data.start];dirty=false;$('#session-note').textContent=example?'Fictional example. Start a new guide or make this one your own.':'Working copy · Save project before closing the page.';renderEditor();refresh();}
  function option(select,value,label){const opt=n('option',label);opt.value=value;select.append(opt);}
  function refresh(){
    const list=$('#steps');list.replaceChildren();
    for(const step of data.steps){const button=n('button',undefined,'step-button');button.type='button';button.setAttribute('aria-pressed',String(step.id===selected));button.append(n('strong',step.title||'Untitled step'),n('span',step.id===data.start?'Starting step':step.choices.length?`${step.choices.length} choices`:'Ending'));button.addEventListener('click',()=>{selected=step.id;renderEditor();refresh();});list.append(button);}
    $('#step-count').textContent=`${data.steps.length}/80`;$('#add-step').disabled=data.steps.length>=80;$('#delete-step').disabled=data.steps.length===1;
    const start=$('#start-step');start.replaceChildren();data.steps.forEach(step=>option(start,step.id,step.title||'Untitled step'));start.value=data.start;
    const map=$('#route-map');map.replaceChildren();data.steps.forEach(step=>{const li=n('li');li.append(n('strong',step.title||'Untitled step'));li.append(n('span',step.choices.length?step.choices.map(choice=>`${choice.label||'?'} → ${data.steps.find(s=>s.id===choice.to)?.title||'Choose a destination'}`).join('\n'):'End of route'));map.append(li);});
    const a=C.analyze(data),validation=$('#validation');validation.replaceChildren();
    if(!a.errors.length)validation.append(n('p','Ready to export.','check-good'));
    a.errors.forEach(message=>validation.append(n('p',message,'check-error')));a.warnings.forEach(message=>validation.append(n('p',message,'check-warning')));
    renderPreview();
  }
  function renderEditor(){const step=current();$('#guide-title').value=data.title;$('#guide-summary').value=data.summary;$('#step-title').value=step.title;$('#step-body').value=step.body;renderChoices();}
  function renderChoices(){const panel=$('#choices'),step=current();panel.replaceChildren();
    step.choices.forEach((choice,index)=>{const row=n('div',undefined,'choice-editor');const label=n('label',`Choice ${index+1}`),input=document.createElement('input');input.value=choice.label;input.maxLength=120;input.placeholder='What can someone choose?';input.addEventListener('input',()=>{choice.label=input.value;changed();});label.append(input);
      const dest=n('label','Go to'),select=document.createElement('select');option(select,'','Choose a step');data.steps.forEach(s=>option(select,s.id,s.title||'Untitled step'));select.value=choice.to;select.addEventListener('change',()=>{choice.to=select.value;changed();});dest.append(select);
      const remove=n('button','×','remove-button');remove.type='button';remove.setAttribute('aria-label',`Remove choice ${index+1}`);remove.addEventListener('click',()=>{step.choices.splice(index,1);renderChoices();changed();});row.append(label,dest,remove);panel.append(row);
    });$('#add-choice').disabled=step.choices.length>=8;
  }
  function renderPreview(){const panel=$('#preview');panel.replaceChildren();path=path.filter(id=>data.steps.some(step=>step.id===id));if(!path.length)path=[data.start];const step=data.steps.find(step=>step.id===path.at(-1));if(!step)return;
    panel.append(n('p',step.choices.length?'YOUR NEXT STEP':'END OF THIS ROUTE','eyebrow'),n('h2',step.title||'Your step title'),n('p',step.body||'Instructions will appear here.','preview-body'));
    if(!step.choices.length)panel.append(n('p','You’ve reached the end of this route.','ending'));
    step.choices.forEach(choice=>{const button=n('button',`${choice.label||'Name this choice'} →`,'preview-choice');button.type='button';button.disabled=!data.steps.some(s=>s.id===choice.to);button.addEventListener('click',()=>{path.push(choice.to);if(path.length>300)path=path.slice(-300);renderPreview();});panel.append(button);});
    $('#preview-back').disabled=path.length<=1;$('#preview-progress').textContent=`${path.length} ${path.length===1?'step':'steps'} visited`;
  }
  $('#guide-title').addEventListener('input',event=>{data.title=event.target.value;changed();});$('#guide-summary').addEventListener('input',event=>{data.summary=event.target.value;changed();});$('#step-title').addEventListener('input',event=>{current().title=event.target.value;changed();});$('#step-title').addEventListener('change',renderChoices);$('#step-body').addEventListener('input',event=>{current().body=event.target.value;changed();});
  $('#start-step').addEventListener('change',event=>{data.start=event.target.value;path=[data.start];changed();});
  $('#add-step').addEventListener('click',()=>{let id;do{id='step-'+Math.random().toString(36).slice(2,11)}while(data.steps.some(step=>step.id===id));data.steps.push({id,title:'',body:'',choices:[]});selected=id;renderEditor();changed();$('#step-title').focus();});
  $('#delete-step').addEventListener('click',()=>{if(data.steps.length<=1)return;const incoming=data.steps.flatMap(step=>step.choices).filter(choice=>choice.to===selected).length;if(!confirm(`Remove this step? ${incoming} incoming choices will need a new destination.`))return;data.steps=data.steps.filter(step=>step.id!==selected);data.steps.forEach(step=>step.choices.forEach(choice=>{if(choice.to===selected)choice.to='';}));if(data.start===selected)data.start=data.steps[0].id;selected=data.start;path=[data.start];renderEditor();changed();});
  $('#add-choice').addEventListener('click',()=>{if(current().choices.length>=8)return;current().choices.push({label:'',to:''});renderChoices();changed();$('#choices .choice-editor:last-child input').focus();});
  $('#restart-preview').addEventListener('click',()=>{path=[data.start];renderPreview();});$('#preview-back').addEventListener('click',()=>{if(path.length>1)path.pop();renderPreview();});
  $('#new-project').addEventListener('click',()=>{if(!acceptReplace())return;importToken++;replace({format:'routeboard',version:1,title:'',summary:'',start:'first',steps:[{id:'first',title:'',body:'',choices:[]}]});status('New guide. Give it a title and write the first step.');$('#guide-title').focus();});
  $('#load-sample').addEventListener('click',()=>{if(!acceptReplace())return;importToken++;replace(clone(RouteboardSamples[$('#sample').value]),true);status('Fictional example loaded. Try the live walkthrough.');});
  $('#open-project').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;const token=++importToken;try{if(file.size>C.LIMITS.bytes)throw new Error('Choose project JSON up to 2 MB.');const next=C.parse(await file.text());if(token!==importToken||!acceptReplace())return;replace(next);status('Project opened. No file was uploaded.');}catch(error){status(error.message);}});
  function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));urls.add(url);const a=n('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},30000);}
  $('#save-project').addEventListener('click',()=>{try{download(JSON.stringify(C.project(data),null,2),'application/json','routeboard-project.json');dirty=false;status('Project download prepared. Keep the JSON file to edit this guide later.');}catch(error){status(error.message);}});
  $('#export-guide').addEventListener('click',()=>{try{download(C.guideHTML(data),'text/html;charset=utf-8','routeboard-guide.html');status('Guide download prepared. The HTML includes connected steps; save project separately for future editing.');}catch(error){status('Before exporting: '+error.message);$('#validation').scrollIntoView({block:'nearest'});}});
  renderEditor();refresh();
})();
