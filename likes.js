(() => {
  const endpoint = (window.notfukudaLikesEndpoint || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : '')).replace(/\/$/,'');
  const ids = Array.from({length:25},(_,i)=>String(i+1).padStart(3,'0'));
  const state = {counts:null,liked:new Set(),pending:new Set(),available:false};
  let visitor,revision=0,refreshPromise;
  try {
    visitor=localStorage.getItem('nf-like-visitor');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor||'')){visitor=crypto.randomUUID();localStorage.setItem('nf-like-visitor',visitor)}
  } catch {visitor=crypto.randomUUID()}
  function update() {
    document.querySelectorAll('[data-action="like"]').forEach(button=>{
      const id=button.dataset.id,on=state.liked.has(id),busy=state.pending.has(id);
      button.classList.toggle('active',on);
      button.disabled=busy;
      button.setAttribute('aria-pressed',String(on));
      button.setAttribute('aria-busy',String(busy));
      button.setAttribute('aria-label',(button.dataset.name||'商品')+(on?'の購入希望のいいねを取り消す':'に購入希望のいいねをする')+(state.counts?'、'+state.counts[id]+'件':''));
      button.querySelector('.like-count').textContent=state.counts?state.counts[id].toLocaleString('ja-JP'):'—';
      button.title=state.available?'購入希望としていいね':'集計を読み込めません。押すと再接続します。';
    });
  }
  function accept(data) {
    if(!data||!Array.isArray(data.liked)||!data.counts||ids.some(id=>!Number.isSafeInteger(data.counts[id])||data.counts[id]<0)||data.liked.some(id=>!ids.includes(id)))throw Error('Invalid count response');
    state.counts=data.counts;state.liked=new Set(data.liked);state.available=true;
  }
  async function request(path,options={}) {
    if(!endpoint)throw Error('Endpoint unavailable');
    const response=await fetch(endpoint+path,{...options,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Vote service unavailable');
    return response.json();
  }
  async function refresh() {
    if(refreshPromise)return refreshPromise;
    const started=revision;
    refreshPromise=(async()=>{
      try{const data=await request('/v1/likes?visitor='+encodeURIComponent(visitor));if(started===revision&&!state.pending.size)accept(data)}
      catch{if(started===revision)state.available=false}
      finally{refreshPromise=null;update()}
    })();
    return refreshPromise;
  }
  // Serialize writes so an older snapshot cannot overwrite a newer vote.
  let writes=Promise.resolve();
  function toggle(id) {
    if(!ids.includes(id)||state.pending.has(id))return Promise.resolve(false);
    state.pending.add(id);revision++;update();
    const action=async()=>{
      try {
        if(!state.available){const data=await request('/v1/likes?visitor='+encodeURIComponent(visitor));accept(data)}
        const liked=!state.liked.has(id);
        const data=await request('/v1/likes/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor,liked})});
        accept(data);return true;
      } catch {
        state.available=false;
        document.dispatchEvent(new CustomEvent('nf-like-error'));
        return false;
      } finally {state.pending.delete(id);revision++;update()}
    };
    const result=writes.then(action);writes=result.catch(()=>{});return result;
  }
  window.notfukudaLikes={state,refresh,toggle,update};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.addEventListener('online',refresh);
  // Update counts when returning to a page; no continuous background polling.
  window.addEventListener('hashchange',()=>refresh());
  window.addEventListener('storage',e=>{if(e.key==='nf-like-visitor')location.reload()});
  refresh();
})();
