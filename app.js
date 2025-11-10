
/* ESP.EE v7 — UX melhorada + correções (pendente/horário) + PDF/XLSX + filtros + validações */
const SITE_ID='esparedes-my.sharepoint.com,540a0485-2578-481e-b4d8-220b41fb5c43,7335dc42-69c8-42d6-8282-151e3783162d';
const CFG_PATH='/Documents/GestaoAlunos-OneDrive/config_especial.json';
const REG_PATH='/Documents/GestaoAlunos-OneDrive/2registos_alunos.json';
const BACKUP_FOLDER='/Documents/GestaoAlunos-OneDrive/backup';
const ALLOWLIST=['biblioteca@esparedes.pt'];
const ESCOLA_TIMES=['08:15-09:05','09:10-10:00','10:15-11:05','11:15-12:05','12:10-13:00','13:05-13:55','14:00-14:50','15:00-15:50','16:05-16:55','17:00-17:50'];
const DIAS=['Segunda','Terça','Quarta','Quinta','Sexta'];

let msalApp,account,accessToken;
const state={config:{professores:[],alunos:[],disciplinas:[],oficinas:[],calendario:{}},reg:{versao:'v2',registos:[]},adminSel:{entity:'professores',index:-1}};
const $=s=>document.querySelector(s);
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));}
function toast(t){try{Swal.fire({toast:true,position:'top-end',timer:1600,showConfirmButton:false,title:t});}catch{}}
function todayISO(){ const d=new Date(); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function getEmail(){return (account?.username??'').trim().toLowerCase();}

// IDs e padrões
const RX_PROF_ID = /^\d{3}[A-Z]{2}\d{2}$/;               // ex.: 910EE07 (professor)
const RX_ALUNO   = /^\d[A-Z]\d+$/;                        // ex.: 9C1, 8J5
const FUNC_TAGS  = ['CA','PM','CJ'];                        // CApio, Produção Materiais, Coadjuvação (siglas)

function isAdmin(){
  const email=getEmail(); if(!email) return false;
  const cfg=state.config?.professores??[]; if(!Array.isArray(cfg)) return false;
  if(ALLOWLIST.includes(email)) return true;
  const p=cfg.find(x=>(x.email??'').toLowerCase()===email);
  const ok=p && String(p.role??'').toLowerCase()==='admin' && email.endsWith('@esparedes.pt');
  return !!ok;
}

const MSAL_CONFIG={auth:{clientId:'c5573063-8a04-40d3-92bf-eb229ad4701c',authority:'https://login.microsoftonline.com/d650692c-6e73-48b3-af84-e3497ff3e1f1',redirectUri:location.origin+location.pathname},cache:{cacheLocation:'localStorage',storeAuthStateInCookie:false}};
const MSAL_SCOPES={scopes:['Files.ReadWrite.All','User.Read','openid','profile','offline_access']};
async function initMsal(){ if(typeof msal==='undefined')return; msalApp=new msal.PublicClientApplication(MSAL_CONFIG); try{ const r=await msalApp.handleRedirectPromise(); if(r?.account){account=r.account; msalApp.setActiveAccount(account);} const accs=msalApp.getAllAccounts(); if(accs.length&&!account){account=accs[0]; msalApp.setActiveAccount(account);} }catch(e){console.warn('msal init',e);} updateAuth(); }
async function acquire(){ try{ const r=await msalApp.acquireTokenSilent(MSAL_SCOPES); accessToken=r.accessToken; return accessToken; }catch{ await msalApp.acquireTokenRedirect(MSAL_SCOPES);} }
function doLogin(){ msalApp?.loginRedirect(MSAL_SCOPES); }
async function doLogout(){ try{ const acc=msalApp.getActiveAccount(); localStorage.removeItem('esp_config'); localStorage.removeItem('esp_reg'); await msalApp.logoutRedirect({account:acc}); }catch(e){} }

async function gLoad(path){ if(!accessToken) await acquire(); const r=await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content`,{headers:{Authorization:`Bearer ${accessToken}`}}); if(r.ok){ const t=await r.text(); return t?JSON.parse(t):null } return null }
async function gSave(path,obj){ if(!accessToken) await acquire(); const r=await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content`,{method:'PUT',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(obj,null,2)}); if(!r.ok) throw new Error('save '+r.status); return await r.json(); }
function pdir(p){const i=p.lastIndexOf('/'); return i>0? p.slice(0,i):'/'; }
async function ensureFolder(folder){ if(!accessToken) await acquire(); const clean=(folder??'').replace(/^\/+|\/+$/g,''); if(!clean) return; const parts=clean.split('/'); let cur=''; for(const seg of parts){ cur+='/'+seg; const chk=await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${cur}`,{headers:{Authorization:`Bearer ${accessToken}`}}); if(chk.status===404){ const parent=cur.substring(0,cur.lastIndexOf('/'))||'/'; await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${parent}:/children`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({name:seg,folder:{},"@microsoft.graph.conflictBehavior":"replace"})}); } } }
async function gSaveWithParents(path,obj){ await ensureFolder(pdir(path)); return await gSave(path,obj); }

async function loadAll(){ setSync('🔁 sincronizando...'); const cfg=await gLoad(CFG_PATH); if(cfg && Array.isArray(cfg.professores)) state.config=cfg; const reg=await gLoad(REG_PATH); if(reg && Array.isArray(reg.registos)) state.reg=reg; localStorage.setItem('esp_config',JSON.stringify(state.config)); localStorage.setItem('esp_reg',JSON.stringify(state.reg)); setSync('💾 guardado'); updateAuth(); renderAdminGrid(); renderProfessor(); diag(); }
function setSync(t){ const el=$('#syncIndicator'); if(el) el.textContent=t; }

function updateAuth(){
  const email=getEmail();
  const prof=(state.config.professores??[]).find(p=>(p.email??'').toLowerCase()===email);
  const banner=$('#profBanner');
  banner && (banner.textContent = account?`Sessão: ${(account.name??account.username)}${prof?` • ${prof.id} · ${prof.nome}`:''}`:'Sessão: não iniciada');
  $('#btnMsLogin')?.classList.toggle('hidden',!!account);
  $('#btnMsLogout')?.classList.toggle('hidden',!account);
  const admin=isAdmin();
  $('#admin')?.classList.toggle('hidden',!admin);
  $('#secExportBackup')?.classList.toggle('hidden',!admin);
  // Painel Professor visível para qualquer utilizador autenticado
  $('#secProfessor')?.classList.toggle('hidden',!account);
}

const ADMIN_SCHEMAS={
  professores:[
    {key:'id',label:'ID (ex.: 910EE07)',type:'text',required:true,rx:'profId',help:'3 dígitos + 2 letras + 2 dígitos'},
    {key:'nome',label:'Nome',type:'text',required:true},
    {key:'email',label:'Email',type:'email',required:true},
    {key:'role',label:'Role',type:'select',options:['','admin']},
    {key:'_hor',label:'Horário',type:'button'}
  ],
  alunos:[
    {key:'id',label:'ID (ex.: 9C1)',type:'text',required:true,rx:'aluno',help:'Ano(1) + Turma(1 letra) + Nº(>=1)'},
    {key:'nome',label:'Nome',type:'text',required:true},
    {key:'numero',label:'Número',type:'text'},
    {key:'turma',label:'Turma',type:'text'}
  ],
  disciplinas:[
    {key:'id',label:'ID',type:'text',required:true},
    {key:'nome',label:'Nome',type:'text',required:true}
  ],
  oficinas:[
    {key:'id',label:'ID da Aula (auto-sugerido)',type:'text',required:true,help:'Será sugerido com base no professor, dia/tempo, disciplina e alunos/serviço'},
    {key:'professorId',label:'Professor',type:'select',required:true,optionsFrom:'professores'},
    {key:'disciplinaId',label:'Disciplina',type:'select',required:true,optionsFrom:'disciplinas'},
    {key:'alunoIds',label:'Alunos/Serviço (IDs ou siglas, vírgulas)',type:'textarea',required:true},
    {key:'diaSemana',label:'Dia da semana (1..5 ou texto)',type:'text',required:true},
    {key:'horaInicio',label:'Hora início',type:'select',required:true,options:ESCOLA_TIMES.map(t=>t.split('-')[0])},
    {key:'horaFim',label:'Hora fim',type:'select',required:true,options:ESCOLA_TIMES.map(t=>t.split('-')[1])},
    {key:'sala',label:'Sala',type:'text'}
  ]
};

function g(e){const c=state.config; if(e==='professores')return c.professores; if(e==='alunos')return c.alunos; if(e==='disciplinas')return c.disciplinas; if(e==='oficinas')return c.oficinas; return []}
function s(e,d){if(e==='professores')state.config.professores=d; if(e==='alunos')state.config.alunos=d; if(e==='disciplinas')state.config.disciplinas=d; if(e==='oficinas')state.config.oficinas=d;}

// Aula ID generator: prefixa com profId para que possamos extrair o professorId a partir do id da aula se necessário
function genAulaId(profId, diaSemana, horaInicio, disciplinaId, alunoIds){
  const HHMM = (horaInicio||'00:00').replace(':','');
  const D = String(diaSemana);
  let tag='';
  const arr = Array.isArray(alunoIds)? alunoIds.filter(Boolean):[];
  const allFuncs = arr.length>0 && arr.every(x=>FUNC_TAGS.includes(String(x).toUpperCase()));
  if(arr.length===0){ tag='FUNC'; }
  else if(allFuncs){ tag='FUNC-'+arr.join('+'); }
  else {
    const nAlunos = arr.filter(x=>RX_ALUNO.test(String(x))).length;
    tag = 'AL'+nAlunos;
  }
  const disc = String(disciplinaId||'DISC');
  return `${profId}-${D}-${HHMM}-${disc}-${tag}`;
}

function deriveProfessorIdFromAulaId(aulaId){
  const s=String(aulaId??'').trim();
  const m=s.match(RX_PROF_ID); // extrai prefixo se o ID da aula começar com o ID do professor
  return m? m[0] : '';
}

function normDia(v){ const s=String(v??'').trim(); if(/^\d+$/.test(s)) return Number(s); const i=DIAS.findIndex(d=> d.toLowerCase()===s.toLowerCase()); return i>=0? i+1 : 0; }

function renderAdminGrid(){
  const entity=$('#adminEntity')?.value??'professores';
  state.adminSel.entity=entity; state.adminSel.index=-1;
  const t=$('#adminGrid'); if(!t) return; const data=g(entity)??[];
  const schema=ADMIN_SCHEMAS[entity]??[]; const vis=schema.filter(x=>x.key!=='_hor');
  const th=vis.map(x=>`<th>${esc(x.label)}</th>`).join('');
  const rows=data.map((row,i)=>`<tr data-index='${i}'>${vis.map(x=>`<td>${esc(Array.isArray(row[x.key])?row[x.key].join(', '):(row[x.key]??''))}</td>`).join('')}${entity==='professores'?"<td><button class='btn btn-hor' data-hor='"+i+"'>Horário</button></td>":''}</tr>`).join('');
  t.innerHTML=`<div style='overflow:auto'><table class='table'><thead><tr>${th}${entity==='professores'?'<th>Horário</th>':''}</tr></thead><tbody>${rows||`<tr><td colspan='${vis.length+(entity==='professores'?1:0)}' class='muted'>Sem registos</td></tr>`}</tbody></table></div>`;
  t.querySelectorAll('tbody tr[data-index]').forEach(tr=>{tr.addEventListener('click',ev=>{ if(ev.target?.hasAttribute('data-hor')) return; t.querySelectorAll('tbody tr').forEach(x=>x.classList.remove('selected')); tr.classList.add('selected'); state.adminSel.index=Number(tr.getAttribute('data-index')); updateAdminBtns(); });});
  t.querySelectorAll('[data-hor]').forEach(b=> b.addEventListener('click',()=> openHorarioEditor(Number(b.getAttribute('data-hor'))) ));
  updateAdminBtns();
}
function updateAdminBtns(){ const on=state.adminSel.index>=0; $('#btnAdminEditar')?.toggleAttribute('disabled',!on); $('#btnAdminApagar')?.toggleAttribute('disabled',!on); }

function makeAutocomplete(input, options){
  const wrap=document.createElement('div'); wrap.style.position='relative'; input.parentNode.insertBefore(wrap,input); wrap.appendChild(input);
  const list=document.createElement('div'); list.style.cssText='position:absolute;left:0;right:0;background:var(--card);border:1px solid var(--primary-border);border-radius:10px;box-shadow:var(--shadow-sm);max-height:220px;overflow:auto'; list.classList.add('hidden'); wrap.appendChild(list);
  function render(q){ list.innerHTML=''; const s=q.trim().toLowerCase(); if(!s){ list.classList.add('hidden'); return; }
    const filtered=options.filter(o=> (o.id+' '+(o.nome??o.id)).toLowerCase().includes(s)).slice(0,30);
    if(!filtered.length){ list.classList.add('hidden'); return; }
    filtered.forEach(o=>{ const item=document.createElement('div'); item.className='ac-item'; item.textContent=`${o.id} · ${o.nome??o.id}`; item.addEventListener('click',()=>{ input.value=o.id; list.classList.add('hidden'); input.dispatchEvent(new Event('change')); }); list.appendChild(item); });
    list.classList.remove('hidden');
  }
  input.addEventListener('input',()=>render(input.value));
  input.addEventListener('blur',()=> setTimeout(()=>list.classList.add('hidden'),200));
}

async function openForm(entity, initial){
  const schema=ADMIN_SCHEMAS[entity]??[]; let html=''; let rxForField={}, helpMsgs={};
  for(const f of schema){ if(f.type==='button') continue; const val=(initial?.[f.key]??''); if(f.rx==='profId') rxForField[f.key]=RX_PROF_ID; if(f.rx==='aluno') rxForField[f.key]=RX_ALUNO; if(f.help) helpMsgs[f.key]=f.help;
    if(f.type==='select'&&f.optionsFrom){ const list=g(f.optionsFrom).map(x=>({id:x.id,nome:x.nome??x.id})); const opts=list.map(o=>`<option value='${esc(o.id)}' ${String(val)===String(o.id)?'selected':''}>${esc(o.nome)}</option>`).join(''); html+=`<label style='display:block;text-align:left'>${esc(f.label)}<select id='fld_${esc(f.key)}' class='swal2-input'>${opts}</select></label>`; }
    else if(f.type==='select'&&f.options){ const opts=f.options.map(o=>`<option value='${esc(o)}' ${String(val)===String(o)?'selected':''}>${esc(o)}</option>`).join(''); html+=`<label style='display:block;text-align:left'>${esc(f.label)}<select id='fld_${esc(f.key)}' class='swal2-input'>${opts}</select></label>`; }
    else if(f.type==='textarea'){ const v=Array.isArray(val)?val.join(', '):(val??''); html+=`<label style='display:block;text-align:left'>${esc(f.label)}<textarea id='fld_${esc(f.key)}' class='swal2-textarea'>${esc(v)}</textarea><div id='tags_${esc(f.key)}' class='tagbar'></div><input id='ac_${esc(f.key)}' class='swal2-input' placeholder='Adicionar aluno (ID) ou serviço (CA/PM/CJ)…'></label>`; }
    else { html+=`<label style='display:block;text-align:left'>${esc(f.label)}<input id='fld_${esc(f.key)}' class='swal2-input' type='${esc(f.type)}' value='${esc(val)}' placeholder='${esc(helpMsgs[f.key]??'')}'></label>`; }
  }
  html += `<div id='valMsg' class='validation'></div>`;
  const res=await Swal.fire({title:(initial?'Editar':'Novo')+` em ${entity}`, html, width: 760, showCancelButton:true, confirmButtonText:'Guardar', focusConfirm:false, didOpen:()=>{
    const valMsg=document.getElementById('valMsg'); function showErr(msg){ valMsg.textContent=msg??''; }
    function setInvalid(id,on){ const el=document.getElementById(id); if(!el) return; el.style.borderColor= on? '#ff5a5a': '' }
    Swal.__validateForm=()=>{ showErr(''); let ok=true; for(const k in rxForField){ const el=document.getElementById('fld_'+k); const rx=rxForField[k]; if(el && el.value){ if(!rx.test(el.value.trim())){ ok=false; showErr(`Formato inválido em ${k}. ${helpMsgs[k]??''}`); setInvalid('fld_'+k,true); } else setInvalid('fld_'+k,false); } } return ok; };
    if(entity==='oficinas'){
      const ac=document.getElementById('ac_alunoIds'); const area=document.getElementById('fld_alunoIds'); const tags=document.getElementById('tags_alunoIds');
      const alunos=(state.config.alunos??[]).map(a=>({id:a.id,nome:a.nome??a.id}));
      if(ac){ makeAutocomplete(ac,alunos); ac.addEventListener('change',()=>{ const id=ac.value.trim(); if(!id) return; const cur=area.value? area.value.split(',').map(s=>s.trim()).filter(Boolean):[]; if(!cur.includes(id)){ cur.push(id); area.value=cur.join(', '); const tg=document.createElement('span'); tg.className='tag'; tg.innerHTML=`${esc(id)} <span class='x' title='remover'>×</span>`; tg.querySelector('.x').addEventListener('click',()=>{ tg.remove(); const rest=(area.value.split(',').map(s=>s.trim()).filter(Boolean)).filter(z=>z!==id); area.value=rest.join(', '); }); tags.appendChild(tg);} ac.value=''; }); }
      // Render tags existentes quando editar
      const exist=(area.value? area.value.split(',').map(s=>s.trim()).filter(Boolean):[]);
      exist.forEach(id=>{ const tg=document.createElement('span'); tg.className='tag'; tg.innerHTML=`${esc(id)} <span class='x' title='remover'>×</span>`; tg.querySelector('.x').addEventListener('click',()=>{ tg.remove(); const rest=(area.value.split(',').map(s=>s.trim()).filter(Boolean)).filter(z=>z!==id); area.value=rest.join(', '); }); tags.appendChild(tg); });
    }
  }, preConfirm:()=>{ if(Swal.__validateForm && Swal.__validateForm()===false) return false; const out={}; let ok=true; for(const f of (ADMIN_SCHEMAS[entity]??[])){ if(f.type==='button') continue; const el=document.getElementById('fld_'+f.key); let v=(el?.value??'').trim(); if(f.required && !v){ ok=false; document.getElementById('valMsg').textContent='Preenche todos os campos obrigatórios'; el?.focus(); break; } if(entity==='oficinas'&&f.key==='alunoIds'){ v=v? v.split(',').map(s=>s.trim()).filter(Boolean):[]; } out[f.key]=v; } if(!ok) return false; if(entity==='oficinas'){ out.diaSemana=normDia(out.diaSemana); if(!out.professorId){ // tentar extrair do id da aula se começar com profId
      out.professorId = deriveProfessorIdFromAulaId(out.id); }
    // validação leve dos alunos/serviço
    const arr=Array.isArray(out.alunoIds)? out.alunoIds:[]; const invalid=arr.filter(x=> !RX_ALUNO.test(String(x)) && !FUNC_TAGS.includes(String(x).toUpperCase()));
    if(invalid.length){ document.getElementById('valMsg').textContent='IDs inválidos: '+invalid.join(', '); return false; }
  }
  return out; } });
  return res.value; }

async function adminNovo(){ const e=$('#adminEntity')?.value??'professores'; const list=g(e).slice(); const obj=await openForm(e,null); if(!obj) return; if(!obj.id){Swal.fire('Erro','Campo ID é obrigatório.','error');return;} if(list.some(r=> String(r.id)===String(obj.id))){Swal.fire('Erro','ID duplicado.','error');return;} list.push(obj); s(e,list); await saveCfg(); renderAdminGrid(); toast('Criado'); }
async function adminEditar(){ const e=state.adminSel.entity; const idx=state.adminSel.index; if(idx<0) return; const list=g(e); const obj=await openForm(e,list[idx]); if(!obj) return; if(!obj.id){Swal.fire('Erro','Campo ID é obrigatório.','error');return;} if(list.some((r,i)=> i!==idx && String(r.id)===String(obj.id))){Swal.fire('Erro','ID já existe.','error');return;} list[idx]=obj; s(e,list); await saveCfg(); renderAdminGrid(); toast('Atualizado'); }
async function adminApagar(){ const e=state.adminSel.entity; const idx=state.adminSel.index; if(idx<0) return; const list=g(e).slice(); const row=list[idx]; const ok=await Swal.fire({title:`Apagar ${e}`,text:`Confirma apagar ${row?.id}?`,icon:'warning',showCancelButton:true,confirmButtonText:'Apagar'}); if(!ok.isConfirmed) return; list.splice(idx,1); s(e,list); await saveCfg(); renderAdminGrid(); toast('Removido'); }

async function saveCfg(){ try{ setSync('🔁 sincronizando...'); await gSaveWithParents(CFG_PATH,state.config); localStorage.setItem('esp_config',JSON.stringify(state.config)); setSync('💾 guardado'); }catch(e){ console.warn('save',e); setSync('⚠ offline'); localStorage.setItem('esp_config',JSON.stringify(state.config)); }}

async function openHorarioEditor(idx){ const prof=(state.config.professores??[])[idx]; if(!prof){ Swal.fire('Erro','Professor inválido','error'); return; }
  const head=`<div style='margin-bottom:8px'><strong>${esc(prof.nome)}</strong> <span class='muted'>${esc(prof.id)} • ${esc(prof.email??'')}</span></div>`;
  const gridHead=`<div style='display:grid;grid-template-columns:120px repeat(5,1fr);gap:8px;font-weight:600'><div></div>${DIAS.map(d=>`<div>${esc(d)}</div>`).join('')}</div>`;
  const rows=ESCOLA_TIMES.map((t,ti)=>`<div style='display:grid;grid-template-columns:120px repeat(5,1fr);gap:8px'><div class='muted'>${esc(t)}</div>${DIAS.map((d,di)=>`<div class='cell' data-ti='${ti}' data-di='${di+1}' title='Adicionar aula neste tempo'>+</div>`).join('')}</div>`).join('');
  await Swal.fire({title:'Definir Horário', html: head+gridHead+rows, width:900, showConfirmButton:false, showCloseButton:true, didOpen:()=>{
    document.querySelectorAll('.swal2-container .cell').forEach(cell=>{ cell.addEventListener('click', async ()=>{
      const ti=Number(cell.getAttribute('data-ti')); const di=Number(cell.getAttribute('data-di'));
      const discOpts=(state.config.disciplinas??[]).map(x=>`<option value='${esc(x.id)}'>${esc(x.nome??x.id)}</option>`).join('');
      const html = `
        <label style='display:block;text-align:left'>Disciplina<select id='a_disc' class='swal2-input'>${discOpts}</select></label>
        <label style='display:block;text-align:left'>Alunos/Serviço (IDs ou CA/PM/CJ)<textarea id='a_alunos' class='swal2-textarea' placeholder='9C1,8J5 ou CA,PM'></textarea></label>
        <label style='display:block;text-align:left'>Sala<input id='a_sala' class='swal2-input' placeholder='Sala'></label>
        <div class='muted'>Dia: ${DIAS[di-1]} • Tempo: ${ESCOLA_TIMES[ti]}</div>`;
      const res=await Swal.fire({title:'Nova Aula', html, showCancelButton:true, confirmButtonText:'Adicionar', preConfirm:()=>({ disciplinaId:document.getElementById('a_disc').value, alunoIds:(document.getElementById('a_alunos').value??'').split(',').map(s=>s.trim()).filter(Boolean), sala:document.getElementById('a_sala').value.trim() })});
      if(!res.isConfirmed) return;
      const pId=prof.id; const horaI=ESCOLA_TIMES[ti].split('-')[0]; const horaF=ESCOLA_TIMES[ti].split('-')[1];
      const aulaId = genAulaId(pId, di, horaI, res.value.disciplinaId, res.value.alunoIds);
      const aula={ id:aulaId, professorId:pId, disciplinaId: res.value.disciplinaId, alunoIds: res.value.alunoIds, diaSemana: di, horaInicio: horaI, horaFim: horaF, sala: res.value.sala };
      const map=new Map((state.config.oficinas??[]).map(x=>[String(x.id),x])); map.set(String(aula.id), aula); state.config.oficinas=[...map.values()]; await saveCfg(); renderAdminGrid(); toast('Aula adicionada');
    }); });
  }});
}

function exportXlsx(rows,name){ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Registos'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=`${name}_${todayISO()}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); }
function exportPdf(rows,title){ if(!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)){ Swal.fire('Erro','jsPDF/autoTable não disponível','error'); return; } const doc=new window.jspdf.jsPDF({unit:'pt',format:'a4'}); doc.text(title,40,40); const head=[['Data','Aluno/Serviço','Professor','Disciplina','Nº','Sumário','Estado']]; const body=rows.map(r=>[r.data??'',r.alunoId??'',r.professorId??'',r.disciplinaId??'',r.numeroLicao??'',(r.sumario??'').slice(0,160),r.status??'']); doc.autoTable({startY:60, head, body, styles:{fontSize:9,cellWidth:'wrap'}, columnStyles:{5:{cellWidth:220}}}); doc.save(title.replace(/\s+/g,'_')+`.pdf`); }

function pickFiltersAndExport(context){ const cfg=state.config; const alunos=(cfg.alunos??[]).map(a=>({id:a.id,nome:a.nome??a.id})); const discs=(cfg.disciplinas??[]).map(d=>({id:d.id,nome:d.nome??d.id})); const profs=(cfg.professores??[]).map(p=>({id:p.id,nome:p.nome??p.id})); const html=`<div class='stack gap'>
  <label style='text-align:left'>De <input id='fltDe' type='date' class='swal2-input' style='width:220px'></label>
  <label style='text-align:left'>Até <input id='fltAte' type='date' class='swal2-input' style='width:220px'></label>
  <label style='text-align:left'>Filtrar por <select id='fltTipo' class='swal2-input'><option value=''>—</option><option value='aluno'>Aluno</option><option value='disc'>Disciplina</option><option value='prof'>Professor</option></select></label>
  <label style='text-align:left'>ID/Nome <input id='fltId' class='swal2-input' placeholder='começa a escrever…'></label>
  <label style='text-align:left'>Formato <select id='fltFmt' class='swal2-input'><option value='pdf'>PDF</option><option value='xlsx'>XLSX</option></select></label>`;
  Swal.fire({title:'Exportar filtrado', html, showCancelButton:true, confirmButtonText:'Exportar', didOpen:()=>{ const inp=document.getElementById('fltId'); const tipo=document.getElementById('fltTipo'); function attach(){ const t=tipo.value; inp.value=''; if(t==='aluno') makeAutocomplete(inp, alunos); else if(t==='disc') makeAutocomplete(inp, discs); else if(t==='prof') makeAutocomplete(inp, profs); } attach(); tipo.addEventListener('change', attach); }, preConfirm:()=>{ const de=document.getElementById('fltDe').value; const ate=document.getElementById('fltAte').value; const tipo=document.getElementById('fltTipo').value; const fld=document.getElementById('fltId').value.trim(); const fmt=document.getElementById('fltFmt').value; return {de,ate,tipo,fld,fmt}; }}).then(res=>{ if(!res.isConfirmed) return; const {de,ate,tipo,fld,fmt}=res.value; let rows=(state.reg.registos??[]); function inRange(d){ if(de && d<de) return false; if(ate && d>ate) return false; return true; } if(context==='prof'){ const email=getEmail(); const prof=(state.config.professores??[]).find(p=>(p.email??'').toLowerCase()===email); rows=rows.filter(r=> r.professorId===(prof?.id??'')); } if(de||ate) rows=rows.filter(r=> inRange(r.data??'')); if(tipo==='aluno'&&fld) rows=rows.filter(r=> (r.alunoId??'')===fld); if(tipo==='disc'&&fld) rows=rows.filter(r=> (r.disciplinaId??'')===fld); if(tipo==='prof'&&fld) rows=rows.filter(r=> (r.professorId??'')===fld); if(fmt==='xlsx') exportXlsx(rows, `registos_${context??'all'}`); else exportPdf(rows, `Registos ${context==='prof'?'(meus)':''}`); });
}

function nextNL(al,disc,prof){ if(!RX_ALUNO.test(String(al))) return ''; const nums=(state.reg.registos??[]).filter(r=> r.alunoId===al && r.disciplinaId===disc && r.professorId===prof).map(r=>parseInt(r.numeroLicao,10)).filter(n=>!isNaN(n)); return (nums.length? Math.max(...nums)+1:1).toString(); }
function keyOf(r){ return `${r.data}\n${r.professorId}\n${r.disciplinaId}\n${r.alunoId}\n${r.sessaoId??''}`; }

async function saveOne(aulaId, alunoId, data, profId){ const a=(state.config.oficinas??[]).find(x=> String(x.id)===String(aulaId)); if(!a){ toast('Aula inválida'); return; }
  const sum=($(`.sumario[data-a='${CSS.escape(aulaId)}'][data-al='${CSS.escape(alunoId)}']`)??{}).value??'';
  const nlec=($(`.nlec[data-a='${CSS.escape(aulaId)}'][data-al='${CSS.escape(alunoId)}']`)??{}).value?? nextNL(alunoId,a.disciplinaId, profId);
  const sts=($(`.sts[data-a='${CSS.escape(aulaId)}'][data-al='${CSS.escape(alunoId)}']`)??{}).value??'P';
  const rec={ id:'R'+crypto.randomUUID(), data, professorId: profId, disciplinaId:a.disciplinaId, alunoId: alunoId, sessaoId:aulaId, numeroLicao:nlec, sumario:sum, status:sts, criadoEm:new Date().toISOString() };
  const idx=(state.reg.registos??[]).findIndex(r=> keyOf(r)===keyOf(rec));
  if(idx>=0) state.reg.registos[idx]={...state.reg.registos[idx], ...rec}; else state.reg.registos.push(rec);
  await saveReg(); toast('Registo guardado'); renderProfessor();
}

function renderProfessor(){
  const email=getEmail(); const prof=(state.config.professores??[]).find(p=>(p.email??'').toLowerCase()===email);
  const sec=$('#secProfessor'); if(!account){ sec?.classList.add('hidden'); return; } sec?.classList.remove('hidden');
  const info=$('#profInfo'); const data=$('#profData')?.value??todayISO(); if($('#profData')) $('#profData').value=data; if(info) info.textContent = prof? `ID: ${prof.id} • ${prof.nome} • Data: ${data}` : `Professor não reconhecido • Data: ${data}`;
  const tbodyHoje=$('#tblHoje tbody'); tbodyHoje.innerHTML=''; if(!prof){ tbodyHoje.innerHTML='<tr><td colspan="7" class="muted">Sem correspondência do seu email nos Professores.</td></tr>'; return; }
  const dow=(new Date(data).getDay()+6)%7+1; const aulas=(state.config.oficinas??[]).filter(a=> a.professorId===prof.id && Number(a.diaSemana)===Number(dow));
  const disc=Object.fromEntries((state.config.disciplinas??[]).map(d=>[String(d.id),d]));
  const aluno=Object.fromEntries((state.config.alunos??[]).map(a=>[String(a.id),a]));
  if(!aulas.length){ tbodyHoje.innerHTML='<tr><td colspan="7" class="muted">Sem aulas para este dia.</td></tr>'; }
  aulas.forEach(a=>{
    const ids = Array.isArray(a.alunoIds)? a.alunoIds:[];
    ids.forEach(al=>{
      const tr=document.createElement('tr');
      const next=nextNL(al,a.disciplinaId,prof.id);
      const isAluno = RX_ALUNO.test(String(al));
      tr.innerHTML = `
        <td>${esc(a.horaInicio)}–${esc(a.horaFim)}</td>
        <td>${esc(disc[a.disciplinaId]?.nome??a.disciplinaId)}</td>
        <td>${esc(al)} ${isAluno?('· '+esc(aluno[al]?.nome??al)) : ''}</td>
        <td><input class='input nlec' value='${esc(next)}' data-al='${esc(al)}' data-a='${esc(a.id)}' ${next?'' : 'disabled'}></td>
        <td><input class='input sumario' placeholder='Sumário' data-al='${esc(al)}' data-a='${esc(a.id)}'></td>
        <td><select class='input sts' data-al='${esc(al)}' data-a='${esc(a.id)}'><option value='P'>P</option><option value='A'>A</option><option value='J'>J</option></select></td>
        <td class='actions-cell'><input type='checkbox' class='chk sel' data-al='${esc(al)}' data-a='${esc(a.id)}'><button class='btn btn-save' data-al='${esc(al)}' data-a='${esc(a.id)}'>Guardar</button></td>`;
      tbodyHoje.appendChild(tr);
    });
  });
  tbodyHoje.querySelectorAll('.btn-save').forEach(btn=> btn.addEventListener('click',()=> saveOne(btn.dataset.a, btn.dataset.al, data, prof.id) ) );
  $('#btnSalvarSelecionados')?.addEventListener('click',()=>{ tbodyHoje.querySelectorAll('.sel:checked').forEach(chk=> saveOne(chk.dataset.a, chk.dataset.al, data, prof.id)); });
  renderPendentes(prof, data);
}

function renderPendentes(prof, today){
  const tbody=$('#tblPend tbody'); tbody.innerHTML='';
  const start=state.config?.calendario?.anoLetivoInicio ?? (new Date().getFullYear()+'-09-01');
  const have=new Set((state.reg.registos??[]).map(r=> keyOf(r) ));
  const aulas=(state.config.oficinas??[]).filter(a=> a.professorId===prof.id);
  const aluno=Object.fromEntries((state.config.alunos??[]).map(a=>[String(a.id),a]));
  aulas.forEach(a=>{ let d=new Date(start); const end=new Date(today); for(; d<=end; d.setDate(d.getDate()+1)){
    const dow=(d.getDay()+6)%7+1; if(Number(a.diaSemana)!==dow) continue; const ds=d.toISOString().slice(0,10);
    const ids = Array.isArray(a.alunoIds)? a.alunoIds:[];
    ids.forEach(al=>{ const k=keyOf({data:ds,professorId:prof.id,disciplinaId:a.disciplinaId,alunoId:al,sessaoId:a.id}); if(!have.has(k)){
      const tr=document.createElement('tr'); tr.innerHTML = `<td>${esc(ds)}</td><td>${esc(a.disciplinaId)}</td><td>${esc(al)} ${RX_ALUNO.test(String(al))?('· '+esc(aluno[al]?.nome??al)) : ''}</td><td><button class='btn btn-pendente' data-a='${esc(a.id)}' data-al='${esc(al)}' data-d='${esc(ds)}'>Registar</button></td>`; tbody.appendChild(tr);
    }});
  }});
  if(!tbody.children.length){ tbody.innerHTML='<tr><td colspan="4" class="muted">Sem pendentes.</td></tr>'; }
  tbody.querySelectorAll('.btn-pendente').forEach(btn=> btn.addEventListener('click',async ()=>{ const aulaId=btn.dataset.a; const al=btn.dataset.al; const data=btn.dataset.d; const a=(state.config.oficinas??[]).find(x=> String(x.id)===String(aulaId)); if(!a) return; const next=nextNL(al,a.disciplinaId,prof.id); const html = `<label style='display:block;text-align:left'>Nº Lição<input id='p_n' class='swal2-input' value='${esc(next)}' ${next?'':'disabled'}></label><label style='display:block;text-align:left'>Sumário<input id='p_s' class='swal2-input' placeholder='Sumário'></label><label style='display:block;text-align:left'>Presença<select id='p_st' class='swal2-input'><option value='P'>P</option><option value='A'>A</option><option value='J'>J</option></select></label>`; const r=await Swal.fire({title:`Registar ${esc(data)}`, html, showCancelButton:true, confirmButtonText:'Guardar'}); if(!r.isConfirmed) return; const rec={ id:'R'+crypto.randomUUID(), data, professorId: prof.id, disciplinaId:a.disciplinaId, alunoId: al, sessaoId:aulaId, numeroLicao: (document.getElementById('p_n').value??next), sumario: (document.getElementById('p_s').value??''), status: (document.getElementById('p_st').value??'P'), criadoEm:new Date().toISOString() }; const idx=(state.reg.registos??[]).findIndex(rr=> keyOf(rr)===keyOf(rec)); if(idx>=0) state.reg.registos[idx]={...state.reg.registos[idx], ...rec}; else state.reg.registos.push(rec); await saveReg(); toast('Registo criado'); renderProfessor(); }) );
}

async function saveReg(){ try{ setSync('🔁 sincronizando...'); await gSaveWithParents(REG_PATH,state.reg); localStorage.setItem('esp_reg',JSON.stringify(state.reg)); setSync('💾 guardado'); }catch(e){ setSync('⚠ offline'); localStorage.setItem('esp_reg',JSON.stringify(state.reg)); }}

function diag(){ const el=$('#diagInfo'); const why=$('#adminGateInfo'); const email=getEmail(); if(el) el.innerHTML=`SITE_ID: <code>${esc(SITE_ID)}</code><br>CFG_PATH: <code>${esc(CFG_PATH)}</code><br>REG_PATH: <code>${esc(REG_PATH)}</code>`; if(why){ let reason='não admin'; if(ALLOWLIST.includes(email)) reason='allow-list'; else { const prof=(state.config?.professores??[]).find(p=> (p.email??'').toLowerCase()===email); if(prof && String(prof.role??'').toLowerCase()==='admin') reason='role=admin (config)'; } why.textContent=`Utilizador: ${email??'-'} • Perfil: ${isAdmin()?'Admin':'Professor'} • Gate: ${reason}`; } }

$('#btnDiagCreateFolders')?.addEventListener('click',async()=>{ try{ await ensureFolder(pdir(CFG_PATH)); await ensureFolder(pdir(REG_PATH)); toast('Pastas OK'); }catch(e){ Swal.fire('Erro','Falha ao criar pastas: '+e.message,'error'); } });
$('#btnDiagListFolder')?.addEventListener('click',async()=>{ try{ if(!accessToken) await acquire(); const folder=pdir(CFG_PATH); const r=await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${folder}:/children`,{headers:{Authorization:`Bearer ${accessToken}`}}); const j=await r.json(); Swal.fire({title:'Conteúdo da pasta',html:`<pre style='text-align:left;white-space:pre-wrap'>${esc(JSON.stringify(j,null,2))}</pre>`,width:800}); }catch(e){ Swal.fire('Erro','Listagem falhou: '+e.message,'error'); } });

$('#adminEntity')?.addEventListener('change',()=>renderAdminGrid());
$('#btnAdminNovo')?.addEventListener('click',()=>adminNovo());
$('#btnAdminEditar')?.addEventListener('click',()=>adminEditar());
$('#btnAdminApagar')?.addEventListener('click',()=>adminApagar());
$('#btnAdminExportLista')?.addEventListener('click',()=>{ const e=$('#adminEntity')?.value??'professores'; exportXlsx(g(e),(e==='oficinas'?'Aulas':e)); });
$('#btnExportRegXlsx')?.addEventListener('click',()=> exportXlsx((state.reg.registos??[]),'registos') );
$('#btnExportRegPdf')?.addEventListener('click',()=> exportPdf((state.reg.registos??[]),'Registos') );
$('#btnExportFiltrado')?.addEventListener('click',()=> pickFiltersAndExport('admin'));
$('#profData')?.addEventListener('change',()=>renderProfessor());
$('#btnProfHoje')?.addEventListener('click',()=>{ if($('#profData')) $('#profData').value=todayISO(); renderProfessor(); });
$('#btnProfExportXLSX')?.addEventListener('click',()=>{ const email=getEmail(); const prof=(state.config.professores??[]).find(p=>(p.email??'').toLowerCase()===email); if(!prof) return toast('Sem professor associado'); const rows=(state.reg.registos??[]).filter(r=> r.professorId===prof.id); exportXlsx(rows,`meus_registos_${prof.id}`); });
$('#btnProfExportPDF')?.addEventListener('click',()=>{ const email=getEmail(); const prof=(state.config.professores??[]).find(p=>(p.email??'').toLowerCase()===email); if(!prof) return toast('Sem professor associado'); const rows=(state.reg.registos??[]).filter(r=> r.professorId===prof.id); exportPdf(rows,`Meus registos ${prof.id}`); });
$('#btnProfExportFiltros')?.addEventListener('click',()=> pickFiltersAndExport('prof'));
$('#btnMsLogin')?.addEventListener('click',()=>doLogin());
$('#btnMsLogout')?.addEventListener('click',()=>doLogout());

(async function(){ await initMsal(); const c=localStorage.getItem('esp_config'); if(c) try{ state.config=JSON.parse(c);}catch{} const r=localStorage.getItem('esp_reg'); if(r) try{ state.reg=JSON.parse(r);}catch{} await loadAll(); })();
