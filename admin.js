(() => {
'use strict';

/* ================================================================
   S&S STREETWEAR — ADMINISTRATOR / MEDIA STUDIO
   Local image manager: the browser reads images selected from a
   computer folder and stores optimized copies as data URLs.
   This can later be replaced by a Python/SQLite upload endpoint.
   ================================================================ */

const PRODUCTS_KEY='ss_products_v3';
const CONFIG_KEY='ss_config_v3';
const ACTIVITY_KEY='ss_activity_v3';
const MEDIA_KEY='ss_media_v4';
const CART_KEY='ss_cart_v3';
const FAV_KEY='ss_fav_v3';

const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>[...p.querySelectorAll(s)];
const money=n=>`Bs ${Number(n||0).toLocaleString('es-BO')}`;
const read=(k,f)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??f}catch{return f}};
const uid=(prefix='img')=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
function normalizeProduct(p){const x={...p};x.images=Array.isArray(x.images)&&x.images.length?x.images.filter(Boolean):[x.image].filter(Boolean);x.image=x.images[0]||x.image||'';x.sizes=Array.isArray(x.sizes)&&x.sizes.length?x.sizes:['S','M','L','XL'];x.colors=Array.isArray(x.colors)&&x.colors.length?x.colors:['Black'];return x}

const DEFAULT_MEDIA={
  hero:'',
  hero2:'',
  hero3:'',
  hero4:'',
  hero5:'',
  categoryPoleras:'',
  categorySudadera:'',
  categoryPantalones:'',
  categoryTenis:'',
  categoryGorras:'',
  editorial:'',
  dropTall:'',
  dropMono:'',
  dropStreet:'',
  gallery01:'',
  gallery02:'',
  gallery03:'',
  gallery04:''
};

let products=[];
let config={...window.SS_DEFAULT_CONFIG,...read(CONFIG_KEY,{})};
let media=read(MEDIA_KEY,[]);
let storeMedia={...DEFAULT_MEDIA};
let activity=read(ACTIVITY_KEY,[
  {text:'Panel administrativo inicializado',time:'Ahora'},
  {text:'Catálogo sincronizado con la tienda',time:'Ahora'}
]);
let selectedMediaTarget=null;

let editingGallery=[];
function save(){
  // Copia local solo como comodidad: lo importante vive en el servidor.
  // Si el navegador se queda sin espacio, no debe romper el panel.
  try{
    localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
    localStorage.setItem(ACTIVITY_KEY,JSON.stringify(activity.slice(0,15)));
    localStorage.setItem(MEDIA_KEY,JSON.stringify(media));
  }catch(e){console.warn('Almacenamiento local lleno',e)}
}
async function loadProductsFromAPI(){
    try {
        const response = await fetch('/api/productos?all=1', {credentials:'include', cache:'no-store'});
        if(response.status===401 || response.status===403){
            window.location.href='/user/?login=admin';
            return;
        }

        if (!response.ok) {
            throw new Error('No se pudieron obtener los productos');
        }

        const data = await response.json();

        products = data.map(p => normalizeProduct({
            id: String(p.id),
            name: p.nombre,
            sku: p.sku || String(p.id),
            description: p.descripcion || '',
            price: Number(p.precio || 0),
            oldPrice: 0,
            category: (p.categoria || '').toLowerCase(),
            sizes: p.talla ? String(p.talla).split(',').map(x=>x.trim()).filter(Boolean) : [],
            colors: p.color ? String(p.color).split(',').map(x=>x.trim()).filter(Boolean) : [],
            stock: Number(p.stock || 0),
            image: p.imagen || '',
            images: Array.isArray(p.galeria) && p.galeria.length ? p.galeria : (p.imagen ? [p.imagen] : []),
            tag: p.etiqueta || '',
            priority: Number(p.prioridad || 0),
            material: p.material || '',
            fit: p.fit || '',
            featured: Number(p.destacado) === 1,
            active: Number(p.activo) !== 0
        }));

        renderAll();

        console.log('Productos cargados desde SQLite:', products);

    } catch (error) {
        console.error('Error conectando con Flask:', error);

        toast('No se pudo conectar con la base de datos');
    }
}

const DB_API='/api';
async function loadCustomers(){
  const el=$('#customersTable'); if(!el)return;
  try{
    const r=await fetch(`${DB_API}/clientes`); if(!r.ok)throw new Error();
    const rows=await r.json();
    el.innerHTML=rows.length?rows.map(c=>`<tr><td>#${c.id}</td><td><strong>${escapeHtml(c.nombre)}</strong></td><td>${escapeHtml(c.correo||'—')}</td><td>${escapeHtml(c.telefono||'—')}</td><td>${escapeHtml(c.direccion||'—')}</td><td>${Number(c.cantidad_pedidos||0)}</td><td><strong>${money(c.total_compras)}</strong></td><td>${escapeHtml(c.fecha_registro||'—')}</td></tr>`).join(''):'<tr><td colspan="8" class="table-empty">Todavía no hay clientes registrados.</td></tr>';
  }catch(e){el.innerHTML='<tr><td colspan="8" class="table-empty">No se pudo conectar con Flask.</td></tr>'}
}
async function loadOrders(){
  const el=$('#ordersTable'); if(!el)return;
  try{
    const r=await fetch(`${DB_API}/pedidos`); if(!r.ok)throw new Error();
    const rows=await r.json();
    el.innerHTML=rows.length?rows.map(o=>`<tr><td>#${o.id}</td><td><strong>${escapeHtml(o.cliente_nombre||'—')}</strong></td><td>${escapeHtml(o.cliente_correo||'—')}</td><td>${escapeHtml(o.cliente_telefono||'—')}</td><td>${escapeHtml(o.fecha||'—')}</td><td>${Number(o.descuento||0)>0?'− '+money(o.descuento):'—'}</td><td><strong>${money(o.total)}</strong></td><td><select class="order-status" data-order-status="${Number(o.id)}"><option ${o.estado==='Pendiente'?'selected':''}>Pendiente</option><option ${o.estado==='Confirmado'?'selected':''}>Confirmado</option><option ${o.estado==='Enviado'?'selected':''}>Enviado</option><option ${o.estado==='Entregado'?'selected':''}>Entregado</option><option ${o.estado==='Cancelado'?'selected':''}>Cancelado</option></select></td></tr>`).join(''):'<tr><td colspan="7" class="table-empty">Todavía no hay pedidos registrados.</td></tr>';
    $$('[data-order-status]').forEach(s=>s.addEventListener('change',async()=>{
      try{
        const r=await fetch(`/api/pedidos/${s.dataset.orderStatus}/estado`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({estado:s.value})});
        const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'No se pudo actualizar');
        toast('Estado del pedido actualizado'); addActivity(`Pedido #${s.dataset.orderStatus}: ${s.value}`);
      }catch(e){toast(e.message);loadOrders();}
    }));
  }catch(e){el.innerHTML='<tr><td colspan="7" class="table-empty">No se pudo conectar con Flask.</td></tr>'}
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function toast(t){const x=$('#toast');x.textContent=t;x.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.remove('show'),2400)}
function addActivity(text){activity.unshift({text,time:new Date().toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})});save();renderActivity()}
function activeProducts(){return products.filter(p=>p.active!==false)}
function renderMetrics(){const active=activeProducts();$('#metricProducts').textContent=active.length;$('#metricStock').textContent=active.reduce((s,p)=>s+Number(p.stock||0),0);$('#metricValue').textContent=money(active.reduce((s,p)=>s+Number(p.stock||0)*Number(p.price||0),0));$('#metricLow').textContent=active.filter(p=>Number(p.stock)<=5).length}
function renderBars(){

    const cats = [
        'sudadera',
        'poleras',
        'pantalones',
        'gorras',
        'tenis'
    ];

    const labels = {
        sudadera: 'Sudadera',
        poleras: 'Poleras',
        pantalones: 'Pantalones',
        gorras: 'Gorras',
        tenis: 'Tenis'
    };

    const counts = cats.map(c =>
        products.filter(
            p => p.category === c && p.active !== false
        ).length
    );

    const max = Math.max(...counts, 1);

    $('#categoryBars').innerHTML = cats.map((c, i) => `
        <div class="bar-item">
            <div class="bar-track">
                <i
                    class="bar-fill"
                    style="height:${Math.max(5, counts[i] / max * 100)}%"
                ></i>
            </div>

            <strong>${counts[i]}</strong>

            <small>${labels[c]}</small>
        </div>
    `).join('');
}
function renderActivity(){$('#activityList').innerHTML=activity.slice(0,6).map((a,i)=>`<div class="activity"><div class="activity-icon">${i===0?'✓':'•'}</div><div><strong>${a.text}</strong><p>Acción del sistema</p><time>${a.time}</time></div></div>`).join('')}
function status(p){if(p.active===false)return '<span class="status off">Oculto</span>';if(p.stock<=5)return '<span class="status low">Stock bajo</span>';return '<span class="status ok">Activo</span>'}
function rowProduct(p,actions=true){return `<tr><td><div class="table-product"><img src="${escapeHtml(p.image||'')}" alt=""><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.sku||p.id)}</small></div></div></td><td>${escapeHtml(p.category)}</td><td>${money(p.price)}</td><td>${Number(p.stock||0)}</td><td>${escapeHtml(p.tag||'—')}</td><td>${status(p)}</td>${actions?`<td><div class="row-actions"><button data-edit="${escapeHtml(p.id)}">Editar</button><button data-toggle="${escapeHtml(p.id)}">${p.active===false?'Mostrar':'Ocultar'}</button><button data-duplicate="${escapeHtml(p.id)}">Duplicar</button><button class="danger" data-delete="${escapeHtml(p.id)}">Eliminar</button></div></td>`:''}</tr>`}
function renderFeatured(){const list=[...activeProducts()].sort((a,b)=>(b.featured?1:0)-(a.featured?1:0)).slice(0,5);$('#featuredTable').innerHTML=list.map(p=>rowProduct(p,false)).join('')}
function renderProducts(){const q=($('#productSearch')?.value||'').toLowerCase();const filter=$('#productFilter')?.value||'all';let list=products.filter(p=>(p.name+' '+p.category+' '+(p.description||'')).toLowerCase().includes(q));if(filter==='active')list=list.filter(p=>p.active!==false);if(filter==='inactive')list=list.filter(p=>p.active===false);if(filter==='low')list=list.filter(p=>p.stock<=5);if(filter==='featured')list=list.filter(p=>p.featured);$('#productsTable').innerHTML=list.map(p=>rowProduct(p,true)).join('');$$('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));$$('[data-toggle]').forEach(b=>b.onclick=()=>toggleProduct(b.dataset.toggle));$$('[data-duplicate]').forEach(b=>b.onclick=()=>duplicateProduct(b.dataset.duplicate));$$('[data-delete]').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete))}
function renderInventory(){const list=[...activeProducts()].sort((a,b)=>a.stock-b.stock);$('#inventoryGrid').innerHTML=list.map(p=>{const percent=Math.min(100,Math.max(2,p.stock/25*100));return `<article class="inventory-card"><div class="inventory-card-head"><img src="${escapeHtml(p.image||'')}" alt=""><div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.category)} · ${money(p.price)}</p></div></div><div class="inventory-number"><span>Stock disponible</span><strong>${p.stock} unidades</strong></div><div class="inventory-bar"><i style="width:${percent}%"></i></div></article>`}).join('')}
function renderAll(){renderMetrics();renderBars();renderActivity();renderFeatured();renderProducts();renderInventory();renderMedia();renderStoreMedia();renderSettingsMedia()}

/* ---------- Image processing ---------- */
function optimizeImage(file,maxSize=1400,quality=.82){
  return new Promise((resolve,reject)=>{
    if(!file||!file.type.startsWith('image/'))return reject(new Error('Archivo no válido'));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('No se pudo leer el archivo'));
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const scale=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight));
        const w=Math.max(1,Math.round(img.naturalWidth*scale));
        const h=Math.max(1,Math.round(img.naturalHeight*scale));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
        // JPEG siempre, bajando la calidad hasta que quepa en el límite del servidor (~1 MB).
        let q=quality,url=canvas.toDataURL('image/jpeg',q);
        while(url.length>1300000&&q>.45){q-=.08;url=canvas.toDataURL('image/jpeg',q)}
        resolve({dataUrl:url,width:w,height:h,type:'image/jpeg'});
      };
      img.onerror=()=>reject(new Error('La imagen no pudo procesarse'));
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function importFiles(fileList,source='library'){
  const files=[...fileList].filter(f=>f.type.startsWith('image/'));
  if(!files.length){toast('Selecciona archivos de imagen');return []}
  const added=[];
  for(const file of files){
    try{
      const optimized=await optimizeImage(file);
      const item={id:uid(),name:file.name.replace(/\.[^.]+$/,''),originalName:file.name,dataUrl:optimized.dataUrl,width:optimized.width,height:optimized.height,type:optimized.type,size:file.size,source,createdAt:new Date().toISOString(),usedIn:[]};
      media.unshift(item);added.push(item);
    }catch(err){console.warn(err);toast(`No se pudo procesar ${file.name}`)}
  }
  if(added.length){save();renderMedia();renderPicker();addActivity(`${added.length} imagen${added.length>1?'es':''} agregada${added.length>1?'s':''} desde la carpeta`);toast(`${added.length} imagen${added.length>1?'es':' es'} lista${added.length>1?'s':''}`)}
  return added;
}
function findMedia(id){return media.find(m=>m.id===id)}
function markUsed(mediaId,label){const m=findMedia(mediaId);if(!m)return;m.usedIn=[...(m.usedIn||[]).filter(x=>x!==label),label];}
function removeUsage(label){media.forEach(m=>{m.usedIn=(m.usedIn||[]).filter(x=>x!==label)})}

/* ---------- Product editor / complete catalog management ---------- */
function setProductPreview(src){const box=$('#productImagePreview');box.innerHTML=src?`<img src="${escapeHtml(src)}" alt="Vista previa">`:'<span>Sin imagen</span>'}
function renderProductGallery(){const el=$('#productGalleryPreview');if(!el)return;$('#galleryCount').textContent=`${editingGallery.length} foto${editingGallery.length===1?'':'s'}`;el.innerHTML=editingGallery.length?editingGallery.map((src,i)=>`<div class="gallery-edit-thumb ${i===0?'cover':''}"><img src="${escapeHtml(src)}" alt="Foto ${i+1}"><span>${i===0?'PORTADA':`FOTO ${i+1}`}</span><button type="button" data-remove-gallery="${i}" aria-label="Quitar foto">×</button></div>`).join(''):'<div class="gallery-empty">Aún no hay fotos adicionales.</div>';
  $$('[data-remove-gallery]').forEach(b=>b.onclick=()=>{editingGallery.splice(Number(b.dataset.removeGallery),1);if(editingGallery[0]){$('#fImage').value=editingGallery[0];setProductPreview(editingGallery[0])}else{$('#fImage').value='';setProductPreview('')}renderProductGallery()})
}
function openEditor(id=null){
  const p=id?products.find(x=>x.id===id):null; const data=p?normalizeProduct(p):null;
  editingGallery=data?[...data.images]:[];
  $('#editorTitle').textContent=data?'Editar producto':'Nuevo producto';$('#editId').value=data?.id||'';$('#fName').value=data?.name||'';$('#fSku').value=data?.sku||data?.id||'';$('#fCategory').value=data?.category||'SUDADERA';$('#fPrice').value=data?.price??'';$('#fOldPrice').value=data?.oldPrice||'';$('#fStock').value=data?.stock??'';$('#fTag').value=data?.tag||'';$('#fPriority').value=data?.priority||0;$('#fImage').value=data?.image||'';setProductPreview(data?.image||'');$('#fDescription').value=data?.description||'';$('#fSizes').value=(data?.sizes||['S','M','L','XL']).join(', ');$('#fColors').value=(data?.colors||['Black']).join(', ');$('#fMaterial').value=data?.material||'';$('#fFit').value=data?.fit||'';$('#fGallery').value=JSON.stringify(editingGallery);$('#fFeatured').checked=!!data?.featured;$('#fActive').checked=data?data.active!==false:true;$('#fImageFile').value='';$('#fGalleryFiles').value='';renderProductGallery();$('#productEditor').classList.add('active');document.body.style.overflow='hidden'
}
function closeEditor(){$('#productEditor').classList.remove('active');document.body.style.overflow='';editingGallery=[]}
function formData(){const id=$('#editId').value||`p${Date.now()}`;const images=editingGallery.filter(Boolean);return {id,name:$('#fName').value.trim(),sku:$('#fSku').value.trim()||id,category:$('#fCategory').value,price:Number($('#fPrice').value),oldPrice:Number($('#fOldPrice').value)||0,stock:Number($('#fStock').value),tag:$('#fTag').value,priority:Number($('#fPriority').value)||0,sizes:$('#fSizes').value.split(',').map(x=>x.trim()).filter(Boolean),colors:$('#fColors').value.split(',').map(x=>x.trim()).filter(Boolean),image:images[0]||$('#fImage').value.trim(),images,description:$('#fDescription').value.trim(),material:$('#fMaterial').value.trim(),fit:$('#fFit').value.trim(),featured:$('#fFeatured').checked,active:$('#fActive').checked}}
function syncProductMediaUsage(productId,images){media.forEach(m=>{m.usedIn=(m.usedIn||[]).filter(x=>!x.startsWith(`product:${productId}`))});images.forEach(src=>{const m=media.find(x=>x.dataUrl===src);if(m)markUsed(m.id,`product:${productId}`)})}
async function saveProduct(e){
  e.preventDefault();
  const data=formData();
  if(!data.name || !data.image){toast('El producto necesita nombre y una portada');return}
  if(!data.sizes.length || !data.colors.length){toast('Agrega al menos una talla y un color');return}
  const isEditing=products.some(p=>String(p.id)===String(data.id));
  const payload={
    nombre:data.name, sku:data.sku, descripcion:data.description, precio:data.price,
    categoria:data.category, talla:data.sizes.join(','), color:data.colors.join(','),
    stock:data.stock, imagen:data.image, galeria:data.images,
    destacado:data.featured, activo:data.active, etiqueta:data.tag,
    prioridad:data.priority, material:data.material, fit:data.fit
  };
  try{
    const response=await fetch(isEditing?`/api/productos/${encodeURIComponent(data.id)}`:'/api/productos',{
      method:isEditing?'PUT':'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error||'No se pudo guardar el producto');
    closeEditor();
    await loadProductsFromAPI();
    addActivity(isEditing?`Producto editado: ${data.name}`:`Producto creado: ${data.name}`);
    toast(isEditing?'Producto actualizado':'Producto creado correctamente');
  }catch(error){
    console.error(error);
    toast(error.message||'Error al guardar el producto');
  }
}
async function toggleProduct(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p)return;
  try{
    const payload=formProductForApi({...p,active:p.active===false});
    const r=await fetch(`/api/productos/${encodeURIComponent(id)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'No se pudo cambiar el estado');
    await loadProductsFromAPI(); addActivity(`${p.active===false?'Producto visible':'Producto oculto'}: ${p.name}`); toast(p.active===false?'Producto activado':'Producto ocultado');
  }catch(e){toast(e.message)}
}
function formProductForApi(p){
  return {
    nombre:p.name, sku:p.sku||p.id, descripcion:p.description||'', precio:Number(p.price||0),
    categoria:(p.category||'sudadera').toLowerCase(), talla:(p.sizes||[]).join(','),
    color:(p.colors||[]).join(','), stock:Number(p.stock||0), imagen:p.image||'',
    galeria:p.images||[], destacado:!!p.featured, activo:p.active!==false, etiqueta:p.tag||'',
    prioridad:Number(p.priority||0), material:p.material||'', fit:p.fit||''
  };
}
async function duplicateProduct(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p)return;
  const copy={...p,id:'',sku:`${p.sku||p.id}-COPY`,name:`${p.name} — COPIA`,featured:false};
  try{
    const r=await fetch('/api/productos',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(formProductForApi(copy))});
    const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'No se pudo duplicar');
    await loadProductsFromAPI(); addActivity(`Producto duplicado: ${copy.name}`); toast('Producto duplicado');
  }catch(e){toast(e.message)}
}
async function deleteProduct(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p)return;
  if(!confirm(`¿Eliminar definitivamente “${p.name}”?`))return;
  try{
    const r=await fetch(`/api/productos/${encodeURIComponent(id)}`,{method:'DELETE',credentials:'include'});
    const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'No se pudo eliminar');
    await loadProductsFromAPI(); addActivity(`Producto eliminado: ${p.name}`); toast('Producto eliminado');
  }catch(e){toast(e.message)}
}

/* ---------- Media library ---------- */
function mediaMatches(m,q,filter){const text=(m.name+' '+m.originalName+' '+(m.usedIn||[]).join(' ')).toLowerCase();if(q&&!text.includes(q))return false;if(filter==='product'&&!(m.usedIn||[]).some(x=>x.startsWith('product:')))return false;if(filter==='store'&&!(m.usedIn||[]).some(x=>x.startsWith('store:')))return false;if(filter==='unused'&&(m.usedIn||[]).length)return false;return true}
function mediaCard(m){return `<article class="media-card"><div class="media-thumb"><img src="${escapeHtml(m.dataUrl)}" alt="${escapeHtml(m.name)}"><span class="media-badge">${m.usedIn?.length?'En uso':'Libre'}</span></div><div class="media-info"><strong title="${escapeHtml(m.originalName)}">${escapeHtml(m.name)}</strong><small>${m.width} × ${m.height} · ${(m.size/1024).toFixed(0)} KB${m.usedIn?.length?' · '+m.usedIn.length+' uso(s)':''}</small><div class="media-actions"><button data-use-media="${m.id}">Usar en tienda</button><button class="danger" data-delete-media="${m.id}">Eliminar</button></div></div></article>`}
function renderMedia(){const grid=$('#mediaGrid');if(!grid)return;const q=($('#mediaSearch')?.value||'').toLowerCase();const f=$('#mediaFilter')?.value||'all';const list=media.filter(m=>mediaMatches(m,q,f));grid.innerHTML=list.map(mediaCard).join('');$('#mediaEmpty').hidden=media.length>0;$$('[data-use-media]').forEach(b=>b.onclick=()=>openStoreTargetPicker(b.dataset.useMedia));$$('[data-delete-media]').forEach(b=>b.onclick=()=>deleteMedia(b.dataset.deleteMedia))}
function renderPicker(){const grid=$('#pickerGrid');if(!grid)return;grid.innerHTML=media.map(m=>`<button type="button" class="picker-item" data-picker-media="${m.id}"><img src="${escapeHtml(m.dataUrl)}" alt=""><span>${escapeHtml(m.name)}</span></button>`).join('')}
function deleteMedia(id){const m=findMedia(id);if(!m)return;if(m.usedIn?.length){toast('No puedes eliminar una imagen que está asignada. Cámbiala primero.');return}if(!confirm(`¿Eliminar “${m.name}” de la biblioteca?`))return;media=media.filter(x=>x.id!==id);save();renderAll();renderPicker();toast('Imagen eliminada')}
function selectMediaForProduct(id){const m=findMedia(id);if(!m)return;$('#fImage').value=m.dataUrl;editingGallery=[m.dataUrl,...editingGallery.filter(x=>x!==m.dataUrl)];setProductPreview(m.dataUrl);renderProductGallery();$('#mediaPicker').classList.remove('active');toast('Portada seleccionada para el producto')}
function selectGalleryMedia(id){const m=findMedia(id);if(!m)return;if(!editingGallery.includes(m.dataUrl))editingGallery.push(m.dataUrl);if(!$('#fImage').value)$('#fImage').value=m.dataUrl;setProductPreview($('#fImage').value);renderProductGallery();$('#mediaPicker').classList.remove('active');toast('Foto añadida a la galería')}
function openProductMediaPicker(){renderPicker();selectedMediaTarget={gallery:false};$('#mediaPicker').classList.add('active')}
function openGalleryMediaPicker(){renderPicker();selectedMediaTarget={gallery:true};$('#mediaPicker').classList.add('active')}

const STORE_SLOTS=[
 {key:'hero',title:'Portada 1 (carrusel)',desc:'Primera imagen grande del inicio.',ratio:'16/7'},
 {key:'hero2',title:'Portada 2 (carrusel)',desc:'Segunda imagen del carrusel del inicio.',ratio:'16/7'},
 {key:'hero3',title:'Portada 3 (carrusel)',desc:'Tercera imagen del carrusel del inicio.',ratio:'16/7'},
 {key:'hero4',title:'Portada 4 (carrusel)',desc:'Cuarta imagen del carrusel del inicio.',ratio:'16/7'},
 {key:'hero5',title:'Portada 5 (carrusel)',desc:'Quinta imagen del carrusel del inicio.',ratio:'16/7'},
 {key:'categoryPoleras',title:'Categoría Poleras',desc:'Tarjeta visual de Poleras.',ratio:'4/3'},
 {key:'categorySudadera',title:'Categoría Sudadera',desc:'Tarjeta visual de Sudadera.',ratio:'4/3'},
 {key:'categoryPantalones',title:'Categoría Pantalones',desc:'Tarjeta visual de Pantalones.',ratio:'4/3'},
 {key:'categoryTenis',title:'Categoría Tenis',desc:'Tarjeta visual de Tenis.',ratio:'4/3'},
 {key:'categoryGorras',title:'Categoría Gorras',desc:'Visual adicional para Gorras.',ratio:'4/3'},
 {key:'editorial',title:'Editorial',desc:'Fotografía grande de la sección editorial.',ratio:'4/3'},
 {key:'dropTall',title:'Drop 01 / Tall',desc:'Primera fotografía de Curated Drops.',ratio:'4/5'},
 {key:'dropMono',title:'Look 02 / Monochrome',desc:'Segunda fotografía de Curated Drops.',ratio:'4/5'},
 {key:'dropStreet',title:'Look 03 / Street Form',desc:'Tercera fotografía de Curated Drops.',ratio:'4/5'},
 {key:'gallery01',title:'Galería 01',desc:'Visual de galería.',ratio:'1/1'},
 {key:'gallery02',title:'Galería 02',desc:'Visual de galería.',ratio:'1/1'},
 {key:'gallery03',title:'Galería 03',desc:'Visual de galería.',ratio:'1/1'},
 {key:'gallery04',title:'Galería 04',desc:'Visual de galería.',ratio:'1/1'}
];
function storeMediaCard(slot){const src=storeMedia[slot.key]||fallbackStoreImage(slot.key);return `<article class="store-media-card"><div class="store-media-preview"><img src="${src}" alt="${slot.title}" style="aspect-ratio:${slot.ratio}"></div><div class="store-media-content"><strong>${slot.title}</strong><p>${slot.desc}</p><div class="store-media-actions"><label><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-store-file="${slot.key}" hidden>Subir desde carpeta</label><button data-store-library="${slot.key}">Biblioteca</button><button data-store-clear="${slot.key}">Restablecer</button></div></div></article>`}
function fallbackStoreImage(key){const map={hero:'/user/assets/visuals/hero.webp',hero2:'/user/assets/visuals/campaign.webp',hero3:'/user/assets/visuals/lookbook_01.webp',hero4:'/user/assets/visuals/lookbook_02.webp',hero5:'/user/assets/visuals/lookbook_03.webp',categoryPoleras:'/user/assets/visuals/poleras.webp',categorySudadera:'/user/assets/visuals/sudaderas.webp',categoryPantalones:'/user/assets/visuals/pantalones.webp',categoryTenis:'/user/assets/visuals/tenis.webp',categoryGorras:'/user/assets/visuals/detail.webp',editorial:'/user/assets/visuals/editorial.webp',dropTall:'/user/assets/visuals/drop_tall.webp',dropMono:'/user/assets/visuals/drop_mono.webp',dropStreet:'/user/assets/visuals/drop_street.webp',gallery01:'/user/assets/visuals/gallery01.webp',gallery02:'/user/assets/visuals/gallery02.webp',gallery03:'/user/assets/visuals/gallery03.webp',gallery04:'/user/assets/visuals/gallery04.webp'};return map[key]||'/user/assets/visuals/campaign.webp'}
function renderStoreMedia(){const el=$('#storeMediaGrid');if(!el)return;el.innerHTML=STORE_SLOTS.map(storeMediaCard).join('');$$('[data-store-file]').forEach(input=>input.onchange=async e=>{const files=e.target.files;if(!files?.[0])return;try{const o=await optimizeImage(files[0],1600,.8);assignStoreImage(input.dataset.storeFile,o.dataUrl,files[0].name)}catch(err){toast('No se pudo cargar la imagen')}});$$('[data-store-library]').forEach(b=>b.onclick=()=>openStoreTargetPicker(null,b.dataset.storeLibrary));$$('[data-store-clear]').forEach(b=>b.onclick=()=>clearStoreImage(b.dataset.storeClear))}
async function putStoreImage(key,value){
  const r=await fetch(`/api/medios/${encodeURIComponent(key)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({imagen:value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'No se pudo guardar la imagen en el servidor');
}
async function assignStoreImage(key,dataUrl,name='imagen'){
  try{
    await putStoreImage(key,dataUrl);
    removeUsage('store:'+key);storeMedia[key]=dataUrl;
    const existing=media.find(m=>m.dataUrl===dataUrl);if(existing)markUsed(existing.id,'store:'+key);
    save();renderAll();addActivity(`Visual actualizado: ${STORE_SLOTS.find(x=>x.key===key)?.title||name}`);toast('Imagen guardada: ya la ven todos los visitantes');
  }catch(e){toast(e.message)}
}
async function clearStoreImage(key){
  if(!confirm('¿Restablecer esta imagen a la fotografía original de la tienda?'))return;
  try{await putStoreImage(key,'');removeUsage('store:'+key);storeMedia[key]='';save();renderAll();toast('Visual restablecido')}catch(e){toast(e.message)}
}
async function loadStoreMedia(){
  try{
    const r=await fetch('/api/medios',{credentials:'include',cache:'no-store'});
    if(r.ok){storeMedia={...DEFAULT_MEDIA,...await r.json()};renderStoreMedia?.();renderSettingsMedia?.()}
  }catch(e){}
}
function openStoreTargetPicker(mediaId=null,key=null){selectedMediaTarget={mediaId,key};renderPicker();$('#mediaPicker').classList.add('active')}
function selectStoreImage(id){const m=findMedia(id);if(!m||!selectedMediaTarget?.key)return;assignStoreImage(selectedMediaTarget.key,m.dataUrl,m.name);$('#mediaPicker').classList.remove('active');selectedMediaTarget=null}

function renderSettingsMedia(){const el=$('#settingsMediaGrid');if(!el)return;el.innerHTML=STORE_SLOTS.slice(0,10).map(storeMediaCard).join('');$$('[data-store-file]',el).forEach(input=>input.onchange=async e=>{if(!e.target.files?.[0])return;try{const o=await optimizeImage(e.target.files[0]);assignStoreImage(input.dataset.storeFile,o.dataUrl,e.target.files[0].name)}catch{toast('No se pudo cargar la imagen')}});$$('[data-store-library]',el).forEach(b=>b.onclick=()=>openStoreTargetPicker(null,b.dataset.storeLibrary));$$('[data-store-clear]',el).forEach(b=>b.onclick=()=>clearStoreImage(b.dataset.storeClear))}

/* ---------- Store settings ---------- */
async function loadSettings(){
  try{
    const r=await fetch('/api/config',{credentials:'include',cache:'no-store'});
    if(r.ok){config={...config,...await r.json()};}
  }catch(e){}
  $('#storeName').value=config.storeName||'';$('#storeSubtitle').value=config.subtitle||'';$('#storeWhatsapp').value=config.whatsapp||'';$('#storeDiscount').value=config.welcomeDiscount??'10';$('#storeEmail').value=config.email||'';$('#storeInstagram').value=config.instagram||'';$('#storeTiktok').value=config.tiktok||''
}
async function saveSettings(e){
  e.preventDefault();
  config={...config,storeName:$('#storeName').value.trim(),subtitle:$('#storeSubtitle').value.trim(),whatsapp:$('#storeWhatsapp').value.trim(),welcomeDiscount:$('#storeDiscount').value.trim(),email:$('#storeEmail').value.trim(),instagram:$('#storeInstagram').value.trim(),tiktok:$('#storeTiktok').value.trim()};
  try{
    const r=await fetch('/api/config',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
    const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'No se pudo guardar');
    save(); addActivity('Configuración de tienda actualizada'); toast('Configuración guardada en el servidor');
  }catch(e){toast(e.message)}
}
function navigate(view){$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));const names={dashboard:'Dashboard',products:'Productos',orders:'Pedidos',inventory:'Inventario',customers:'Clientes',media:'Imágenes',settings:'Configuración'};$('#pageTitle').textContent=names[view]||view;window.scrollTo({top:0,behavior:'smooth'});if(view==='media'){renderMedia();renderStoreMedia()}if(view==='settings')renderSettingsMedia();if(view==='customers')loadCustomers();if(view==='orders')loadOrders()}

async function loadAdminSession(){
  try{
    const r=await fetch('/api/me',{credentials:'include',cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok || !d.autenticado || d.usuario?.rol!=='admin'){
      window.location.href='/user/?login=admin'; return false;
    }
    const name=d.usuario.nombre||'Administrador';
    $('#adminName').textContent=name;
    $('#adminEmail').textContent=d.usuario.correo||'Cuenta administradora';
    $('#adminAvatar').textContent=name.trim().charAt(0).toUpperCase();
    return true;
  }catch(e){
    window.location.href='/user/?login=admin'; return false;
  }
}

/* ---------- Events ---------- */
function setup(){
  $$('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  $$('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
  $('#sidebarBtn').onclick=()=>$('#sidebar').classList.toggle('open');
  $('#addProduct').onclick=()=>openEditor();$('#quickAdd').onclick=()=>openEditor();
  $('#closeEditor').onclick=closeEditor;$('#cancelEditor').onclick=closeEditor;$('#productForm').onsubmit=saveProduct;
  $('#productSearch').oninput=renderProducts;$('#productFilter').onchange=renderProducts;$('#settingsForm').onsubmit=saveSettings;loadSettings();loadStoreMedia();

  $('#mediaUpload')?.addEventListener('change',async e=>{await importFiles(e.target.files,'library');e.target.value='' });
  $('#mediaSearch')?.addEventListener('input',renderMedia);$('#mediaFilter')?.addEventListener('change',renderMedia);
  $('#fImageFile')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const o=await optimizeImage(file,1400,.82);$('#fImage').value=o.dataUrl;setProductPreview(o.dataUrl);toast('Imagen cargada desde tu carpeta')}catch{toast('No se pudo procesar la imagen')}});
  $('#fGalleryFiles')?.addEventListener('change',async e=>{const files=[...e.target.files].filter(f=>f.type.startsWith('image/'));for(const file of files){try{const o=await optimizeImage(file,1400,.82);editingGallery.push(o.dataUrl)}catch(err){console.warn(err)}}if(editingGallery[0]){$('#fImage').value=editingGallery[0];setProductPreview(editingGallery[0])}renderProductGallery();e.target.value='';if(files.length)toast(`${files.length} foto${files.length===1?'':'s'} agregada${files.length===1?'':'s'}`)});
  $('#chooseMediaForProduct')?.addEventListener('click',openProductMediaPicker);
  $('#clearProductImage')?.addEventListener('click',()=>{$('#fImage').value='';$('#fImageFile').value='';editingGallery=editingGallery.slice(1);if(editingGallery[0]){$('#fImage').value=editingGallery[0];setProductPreview(editingGallery[0])}else setProductPreview('');renderProductGallery()});
  $('#clearProductGallery')?.addEventListener('click',()=>{editingGallery=[];$('#fImage').value='';setProductPreview('');renderProductGallery();toast('Galería vaciada')});
  $('#chooseGalleryFromLibrary')?.addEventListener('click',openGalleryMediaPicker);
  $('#closeMediaPicker')?.addEventListener('click',()=>{$('#mediaPicker').classList.remove('active');selectedMediaTarget=null});
  $('#mediaPicker')?.addEventListener('click',e=>{if(e.target.id==='mediaPicker'){e.currentTarget.classList.remove('active');selectedMediaTarget=null}});

  $('#logoutAdmin')?.addEventListener('click',async()=>{
    try{await fetch('/api/logout',{method:'POST',credentials:'include'});}finally{window.location.href='/user/';}
  });
  $('#notificationBtn').onclick=()=>toast('No tienes notificaciones nuevas');
  $('#refreshCustomers')?.addEventListener('click',loadCustomers);
  $('#refreshOrders')?.addEventListener('click',loadOrders);
  $('#productEditor').addEventListener('click',e=>{if(e.target.id==='productEditor')closeEditor()});

  renderAll();
}

/* Picker buttons are delegated because the same grid is used by several modules. */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-picker-media]');
  if(!b)return;
  const id=b.dataset.pickerMedia;
  if(selectedMediaTarget?.key){selectStoreImage(id)}else if(selectedMediaTarget?.gallery){selectGalleryMedia(id)}else{selectMediaForProduct(id)}
});

setup();
loadAdminSession();
loadProductsFromAPI();

})();
