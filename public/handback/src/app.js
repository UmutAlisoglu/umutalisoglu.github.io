(function(){
  'use strict';
  const C=HandbackCore,$=s=>document.querySelector(s),clone=v=>JSON.parse(JSON.stringify(v));
  let data=C.project(clone(HandbackSamples.website)),tab='overview',dirty=false,token=0;
  const urls=new Set();
  const tabs={overview:['The short version.',''],tasks:['What happens next?','Add a next step'],notes:['Keep the context.','Add a note'],decisions:['The choice. And the why.','Add a decision'],questions:['What’s still open?','Add a question'],links:['The useful places.','Add a link'],images:['A little visual context.','']};
  const limits={tasks:100,notes:30,decisions:50,questions:50,links:60};
  const empty={tasks:()=>({text:'',owner:'',due:'',done:false}),notes:()=>({title:'',body:''}),decisions:()=>({title:'',reason:''}),questions:()=>({title:'',context:''}),links:()=>({label:'',url:''})};
  function n(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function status(message){$('#status').textContent=message;}
  function changed(){dirty=true;$('#session-note').textContent='Working copy · Save project before closing this tab.';status('Changes are in this tab only. Save project to keep them.');renderPreview();}
  function acceptReplace(){return !dirty||confirm('Replace this working copy? Save project first to keep your edits.');}
  function replace(next,example=false){data=C.project(next);token++;dirty=false;tab='overview';$('#session-note').textContent=example?'Fictional example. Start a new handover or make this one your own.':'Working copy · Nothing is saved until you download a project.';renderEditor();renderPreview();}
  function field(container,labelText,value,onChange,options={}){
    const label=n('label',labelText,'field');let input;
    if(options.area){input=document.createElement('textarea');input.rows=options.rows||4;}else{input=document.createElement('input');input.type=options.type||'text';}
    input.value=value;input.maxLength=options.max||5000;if(options.placeholder)input.placeholder=options.placeholder;
    input.addEventListener('input',()=>{onChange(input.value);changed();});label.append(input);container.append(label);return input;
  }
  function renderEditor(){
    document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===tab)));
    $('#section-title').textContent=tabs[tab][0];$('#add-item').hidden=!tabs[tab][1];$('#add-item').textContent='+ '+tabs[tab][1];$('#add-item').disabled=Boolean(limits[tab]&&data[tab].length>=limits[tab]);
    const panel=$('#fields');panel.replaceChildren();
    if(tab==='overview'){
      field(panel,'Project title',data.title,v=>data.title=v,{max:140,placeholder:'What is being handed over?'});
      const people=n('div',undefined,'people-fields');panel.append(people);field(people,'From',data.from,v=>data.from=v,{max:160,placeholder:'Person or team'});field(people,'To',data.to,v=>data.to=v,{max:160,placeholder:'The next owner'});
      field(panel,'Summary',data.summary,v=>data.summary=v,{area:true,rows:7,max:5000,placeholder:'Where things stand, what is ready, and what the next person needs to know.'});
      panel.append(n('p','Keep it short enough to read first. Put the deeper context in Notes.','field-hint'));return;
    }
    if(tab==='images'){renderImages(panel);return;}
    if(!data[tab].length)panel.append(n('p','Nothing here yet. Add only what the next person needs.','empty-note'));
    data[tab].forEach((item,index)=>{
      const card=n('article',undefined,'edit-card'),heading=n('div',undefined,'edit-card-heading');heading.append(n('span',`${tab==='tasks'?'Next step':tab==='links'?'Link':'Item'} ${index+1}`));
      const remove=n('button','Remove','quiet-button danger');remove.type='button';remove.setAttribute('aria-label',`Remove ${tab} item ${index+1}`);remove.addEventListener('click',()=>{data[tab].splice(index,1);renderEditor();changed();});heading.append(remove);card.append(heading);
      if(tab==='tasks'){
        field(card,'Next step',item.text,v=>item.text=v,{max:1000,area:true,rows:2});const row=n('div',undefined,'people-fields');card.append(row);field(row,'Owner',item.owner,v=>item.owner=v,{max:160});field(row,'Due (optional)',item.due,v=>item.due=v,{type:'date',max:10});
        const label=n('label',undefined,'check'),check=document.createElement('input');check.type='checkbox';check.checked=item.done;check.addEventListener('change',()=>{item.done=check.checked;changed();});label.append(check,n('span','Already done'));card.append(label);
      }else if(tab==='links'){field(card,'Label',item.label,v=>item.label=v,{max:200});field(card,'URL',item.url,v=>item.url=v,{max:2000,placeholder:'https://…'});}
      else{field(card,tab==='decisions'?'Decision':tab==='questions'?'Question':'Title',item.title,v=>item.title=v,{max:tab==='notes'?140:200});const key=tab==='notes'?'body':tab==='decisions'?'reason':'context';field(card,tab==='decisions'?'Why this choice?':'Context',item[key],v=>item[key]=v,{area:true,max:tab==='notes'?8000:5000});}
      panel.append(card);
    });
  }
  function renderImages(panel){
    const label=n('label',undefined,'image-drop');label.append(n('strong','Choose screenshots'),n('span','PNG, JPEG or WebP · 5 MB each · Up to 8 images'));const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.setAttribute('aria-label','Choose screenshots');input.addEventListener('change',()=>addImages([...input.files]));label.append(input);panel.append(label,n('p','Images are resized and re-encoded on your device. Check them for details you don’t want to share.','field-hint'));
    data.images.forEach((image,index)=>{const card=n('article',undefined,'edit-card');const img=document.createElement('img');img.src=image.data;img.alt=image.caption||'Screenshot '+(index+1);img.className='image-thumb';card.append(img);field(card,'Caption',image.caption,v=>{image.caption=v;img.alt=v||'Screenshot '+(index+1);},{area:true,rows:2,max:1000});const remove=n('button','Remove screenshot','quiet-button danger');remove.type='button';remove.addEventListener('click',()=>{data.images.splice(index,1);token++;renderEditor();changed();});card.append(remove);panel.append(card);});
  }
  async function addImages(files){const loadToken=token;
    for(const file of files){
      try{
        if(loadToken!==token)return;if(data.images.length>=8)throw new Error('Up to 8 screenshots can be included.');if(file.size>5000000)throw new Error(`${file.name}: choose a source image up to 5 MB.`);
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPEG or WebP screenshots. SVG and other attachments are not supported.');
        const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
        const png=head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71&&head[4]===13&&head[5]===10&&head[6]===26&&head[7]===10;
        const jpeg=head[0]===255&&head[1]===216&&head[2]===255;
        const webp=String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP';
        if(!png&&!jpeg&&!webp)throw new Error('The file contents are not a PNG, JPEG or WebP image.');
        const bitmap=await createImageBitmap(file);if(loadToken!==token){bitmap.close();return;}
        if(bitmap.width*bitmap.height>30000000){bitmap.close();throw new Error('Choose an image up to 30 megapixels.');}
        const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
        const image={name:file.name.slice(0,240),caption:'',data:canvas.toDataURL('image/jpeg',.88)};C.project({...data,images:[...data.images,image]});
        if(loadToken!==token)return;data.images.push(image);dirty=true;renderEditor();changed();status('Screenshot added locally. It is embedded in the HTML packet and project JSON.');
      }catch(error){status(error.message||'That image could not be decoded. Try another PNG, JPEG or WebP.');}
    }
  }
  function renderPreview(){const panel=$('#preview');panel.replaceChildren();const a=C.analyze(data);
    panel.append(n('h2',data.title||'Your project title'),n('p',[data.from?`From ${data.from}`:'',data.to?`To ${data.to}`:''].filter(Boolean).join(' → '),'preview-people'),n('p',data.summary||'The short version will appear here.','preview-summary'));
    const stats=n('div',undefined,'mini-stats');for(const [value,label]of[[a.pending,'open steps'],[a.decisions,'decisions'],[a.questions,'questions']]){const stat=n('div');stat.append(n('strong',String(value)),n('span',label));stats.append(stat);}panel.append(stats);
    const tasks=data.tasks.filter(task=>task.text.trim());if(tasks.length){panel.append(n('h3','Next steps'));tasks.forEach(task=>{const item=n('div',undefined,'preview-task');item.append(n('span',task.done?'Done':'Open',task.done?'badge done':'badge'),n('div',task.text));if(task.owner||task.due)item.append(n('small',[task.owner,task.due].filter(Boolean).join(' · ')));panel.append(item);});}
    for(const [title,items,key]of[['Context & notes',data.notes,'body'],['Decisions & why',data.decisions,'reason'],['Open questions',data.questions,'context']]){const filled=items.filter(item=>item.title.trim()||item[key].trim());if(!filled.length)continue;panel.append(n('h3',title));filled.forEach(item=>{const card=n('article',undefined,'preview-note');if(item.title)card.append(n('strong',item.title));card.append(n('p',item[key]));panel.append(card);});}
    if(data.links.some(link=>link.label||link.url)){panel.append(n('h3','Useful links'));data.links.forEach(link=>{if(!link.label&&!link.url)return;const label=n('p',link.label||link.url,'preview-link');try{const u=C.safeURL(link.url);const a=n('a',link.label||u);a.href=u;a.target='_blank';a.rel='noopener noreferrer';label.replaceChildren(a,n('small',u));}catch{label.append(n('small','Add a complete http:// or https:// link.'));}panel.append(label);});}
    if(data.images.length){panel.append(n('h3','Screenshots & references'));data.images.forEach((image,index)=>{const figure=n('figure'),img=document.createElement('img');img.src=image.data;img.alt=image.caption||'Screenshot '+(index+1);figure.append(img);if(image.caption)figure.append(n('figcaption',image.caption));panel.append(figure);});}
    $('#readiness').textContent=a.errors.length?'Needs a little work':'Ready to export';const checks=$('#validation');checks.replaceChildren();a.errors.forEach(message=>checks.append(n('p',message,'check-error')));a.warnings.forEach(message=>checks.append(n('p',message,'check-warning')));if(!a.errors.length&&!a.warnings.length)checks.append(n('p','The key details are in place. Read the packet before sending it.','check-good'));
  }
  $('#tabs').addEventListener('click',event=>{const button=event.target.closest('[data-tab]');if(!button)return;tab=button.dataset.tab;renderEditor();});
  $('#add-item').addEventListener('click',()=>{if(!empty[tab]||data[tab].length>=limits[tab])return;data[tab].push(empty[tab]());renderEditor();changed();$('#fields .edit-card:last-child input, #fields .edit-card:last-child textarea')?.focus();});
  $('#load-sample').addEventListener('click',()=>{if(!acceptReplace())return;replace(clone(HandbackSamples[$('#sample').value]),true);status('Fictional example loaded. Edit a section or export a sample packet.');});
  $('#new-project').addEventListener('click',()=>{if(!acceptReplace())return;replace({format:'handback',version:1,title:'',summary:'',from:'',to:'',notes:[],tasks:[],decisions:[],questions:[],links:[],images:[]});status('New handover. Start with the project title and short summary.');$('#fields input').focus();});
  $('#open-project').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;const loadToken=++token;try{if(file.size>C.LIMITS.bytes)throw new Error('Choose project JSON up to 25 MB.');const next=C.parse(await file.text());if(loadToken!==token||!acceptReplace())return;replace(next);status('Project opened locally. No file was uploaded.');}catch(error){status(error.message);}});
  function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));urls.add(url);const a=n('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},30000);}
  $('#save-project').addEventListener('click',()=>{try{download(JSON.stringify(C.project(data),null,2),'application/json','handback-project.json');dirty=false;status('Project download prepared. The JSON includes every detail and screenshot for future editing.');}catch(error){status(error.message);}});
  $('#export-packet').addEventListener('click',()=>{try{download(C.handoverHTML(data),'text/html;charset=utf-8','handback-packet.html');status('Packet download prepared. It includes your project details and embedded screenshots.');}catch(error){status('Before exporting: '+error.message);}});
  $('#export-markdown').addEventListener('click',()=>{try{download(C.markdown(data),'text/markdown;charset=utf-8','handback-notes.md');status('Markdown download prepared. Screenshots are in the HTML packet and project JSON, not the Markdown.');}catch(error){status(error.message);}});
  renderEditor();renderPreview();
})();
