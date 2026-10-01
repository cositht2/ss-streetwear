(() => {
    'use strict';

    // =========================================================
    // CONFIGURACIÓN
    // =========================================================

    const API_URL = '/api/productos';
    const ORDERS_API_URL = '/api/pedidos';

    // SOLO carrito y favoritos se guardan en localStorage.
    // Los productos vienen SIEMPRE desde SQLite mediante Flask.
    const CART_KEY = 'ss_cart_v3';
    const FAV_KEY = 'ss_favorites_v3';
    const CONFIG_KEY = 'ss_config_v3';
    const STORE_MEDIA_KEY = 'ss_store_media_v4';

    const LOGIN_API_URL = '/api/login';
    const ME_API_URL = '/api/me';
    const LOGOUT_API_URL = '/api/logout';
    let discountState = { autenticado: false, porcentaje: 0, disponible: false };

    function openLogin(){
        const m=document.getElementById('loginModal');
        if(!m) return;
        const loginPanel=document.getElementById('loginPanel');
        const registerPanel=document.getElementById('registerPanel');
        const switchLogin=document.getElementById('switchLogin');
        const switchRegister=document.getElementById('switchRegister');
        loginPanel?.removeAttribute('hidden');
        registerPanel?.setAttribute('hidden','');
        switchLogin?.classList.add('active');
        switchRegister?.classList.remove('active');
        m.classList.add('active');
        document.body.classList.add('lock');
        requestAnimationFrame(()=>{
            const copy=m.querySelector('.modal-copy');
            if(copy) copy.scrollTop=0;
            document.getElementById('loginEmail')?.focus();
        });
    }
    function applyAccountState(d){
        discountState = {
            autenticado: !!d.autenticado,
            porcentaje: Number(d.descuento?.porcentaje || 0),
            disponible: !!d.descuento?.disponible
        };
        const promo = document.getElementById('registerPromoText');
        if(promo){
            promo.textContent = discountState.porcentaje > 0
                ? `Crea tu cuenta y obtén ${discountState.porcentaje}% de descuento en tu primera compra.`
                : 'Crea tu cuenta y agiliza tus pedidos.';
        }
        const promoBox = document.getElementById('registerPromo');
        if(promoBox) promoBox.hidden = discountState.porcentaje <= 0;
        if(typeof renderCart === 'function') renderCart();
    }
    async function refreshAccountUI(){
        const btn=document.getElementById('accountBtn');
        const label=document.getElementById('accLabel');
        try{
            const r=await fetch(ME_API_URL,{credentials:'include'}); const d=await r.json();
            applyAccountState(d);
            if(!btn)return;
            if(d.autenticado){
                const primero=(d.usuario.nombre||'').split(' ')[0]||'Mi cuenta';
                if(label) label.textContent=primero;
                btn.title=`Sesión: ${d.usuario.nombre}`;
                btn.setAttribute('aria-label',`Sesión iniciada como ${d.usuario.nombre}`);
                btn.onclick=async()=>{
                    if(d.usuario.rol==='admin'){
                        if(confirm(`Hola ${d.usuario.nombre}. Aceptar = ir al panel de administración. Cancelar = cerrar sesión.`)){ location.href='/admin/'; return; }
                    }
                    if(confirm('¿Quieres cerrar tu sesión?')){ await fetch(LOGOUT_API_URL,{method:'POST',credentials:'include'}); location.reload(); }
                };
                const admin=document.getElementById('adminLink'); if(admin) admin.style.display=d.usuario.rol==='admin'?'':'none';
                // Rellena el formulario de pedido con los datos de la cuenta.
                const n=document.getElementById('checkoutName'), e=document.getElementById('checkoutEmail');
                if(n && !n.value) n.value=d.usuario.nombre||'';
                if(e && !e.value && d.usuario.rol!=='admin') e.value=d.usuario.correo||'';
            }else{
                if(label) label.textContent='Ingresar';
                btn.onclick=openLogin;
                const admin=document.getElementById('adminLink'); if(admin) admin.style.display='none';
            }
        }catch(e){ if(btn) btn.onclick=openLogin; }
    }


    async function loadServerConfig(){
        try{
            const r=await fetch('/api/config',{cache:'no-store'});
            if(r.ok){
                const server=await r.json();
                config={...config,...server};
                localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
            }
            // Imágenes de portada/categorías/galería elegidas en el panel (guardadas en el servidor).
            const m=await fetch('/api/medios',{cache:'no-store'});
            if(m.ok){ localStorage.setItem(STORE_MEDIA_KEY,JSON.stringify(await m.json())); }
        }catch(e){ console.warn('Configuración remota no disponible',e); }
    }

    document.addEventListener('DOMContentLoaded',()=>{
        const form=document.getElementById('loginForm');
        const registerForm=document.getElementById('registerForm');
        const modal=document.getElementById('loginModal');
        const loginPanel=document.getElementById('loginPanel');
        const registerPanel=document.getElementById('registerPanel');
        const switchRegister=document.getElementById('switchRegister');
        const switchLogin=document.getElementById('switchLogin');
        const backToLogin=document.getElementById('backToLogin');

        switchRegister?.addEventListener('click',()=>{
            loginPanel?.setAttribute('hidden','');
            registerPanel?.removeAttribute('hidden');
            switchRegister.classList.add('active'); switchLogin?.classList.remove('active');
        });
        backToLogin?.addEventListener('click',()=>{
            registerPanel?.setAttribute('hidden','');
            loginPanel?.removeAttribute('hidden');
            switchLogin?.classList.add('active'); switchRegister?.classList.remove('active');
        });
        switchLogin?.addEventListener('click',()=>{
            registerPanel?.setAttribute('hidden','');
            loginPanel?.removeAttribute('hidden');
            switchLogin.classList.add('active'); switchRegister?.classList.remove('active');
        });

        form?.addEventListener('submit',async(e)=>{
            e.preventDefault();
            const error=document.getElementById('loginError');
            error.hidden=true;
            const correo=document.getElementById('loginEmail').value.trim();
            const password=document.getElementById('loginPassword').value;
            try{
                const r=await fetch(LOGIN_API_URL,{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    credentials:'include',
                    body:JSON.stringify({correo,password})
                });
                const d=await r.json().catch(()=>({}));
                if(!r.ok) throw new Error(d.error||'No se pudo iniciar sesión');
                if(d.usuario.rol==='admin') window.location.href='/admin/';
                else {
                    modal?.classList.remove('active');
                    refreshAccountUI();
                    toast(`Bienvenido, ${d.usuario.nombre}`);
                }
            }catch(err){error.textContent=err.message;error.hidden=false;}
        });

        registerForm?.addEventListener('submit',async(e)=>{
            e.preventDefault();
            const error=document.getElementById('registerError');
            error.hidden=true;
            const nombre=document.getElementById('registerName').value.trim();
            const correo=document.getElementById('registerEmail').value.trim();
            const password=document.getElementById('registerPassword').value;
            const confirm=document.getElementById('registerPassword2').value;
            if(password!==confirm){error.textContent='Las contraseñas no coinciden.';error.hidden=false;return;}
            try{
                const r=await fetch('/api/usuarios',{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    credentials:'include',
                    body:JSON.stringify({nombre,correo,password})
                });
                const d=await r.json().catch(()=>({}));
                if(!r.ok) throw new Error(d.error||'No se pudo crear la cuenta');
                // Iniciar sesión inmediatamente después de registrarse.
                const login=await fetch(LOGIN_API_URL,{
                    method:'POST',headers:{'Content-Type':'application/json'},
                    credentials:'include',body:JSON.stringify({correo,password})
                });
                const ld=await login.json().catch(()=>({}));
                if(!login.ok) throw new Error(ld.error||'Cuenta creada; vuelve a iniciar sesión.');
                registerForm.reset();
                modal?.classList.remove('active');
                refreshAccountUI();
                toast(d.descuento?.disponible ? `¡Cuenta creada! Tienes ${d.descuento.porcentaje}% de descuento en tu primera compra 🎁` : `Cuenta creada. Bienvenido, ${ld.usuario.nombre}`);
            }catch(err){error.textContent=err.message;error.hidden=false;}
        });

        loadServerConfig();
        refreshAccountUI();

        if(new URLSearchParams(location.search).get('login')==='admin') openLogin();
    });

    // =========================================================
    // HELPERS
    // =========================================================

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];


    function read(key, fallback) {
        try {
            const value = JSON.parse(
                localStorage.getItem(key)
            );

            return value ?? fallback;

        } catch {
            return fallback;
        }
    }


    function money(value) {
        return `Bs ${Number(value || 0).toLocaleString('es-BO')}`;
    }


    // =========================================================
    // ESTADO
    // =========================================================

    let products = [];

    let cart = read(CART_KEY, []);

    let favorites = read(FAV_KEY, [])
        .map(String);

    let config = {
        ...(window.SS_DEFAULT_CONFIG || {}),
        ...read(CONFIG_KEY, {})
    };

    let storeMedia = {
        ...read(STORE_MEDIA_KEY, {})
    };

    let activeFilter = 'all';

    let query = '';

    let selectedProduct = null;


    // =========================================================
    // NORMALIZAR PRODUCTOS
    // =========================================================

    function normalizeProduct(product) {

        return {
            id: String(product.id),

            name: product.nombre || '',

            description: product.descripcion || '',

            price: Number(product.precio) || 0,

            category: String(
                product.categoria || ''
            ).toLowerCase(),

            sizes: product.talla
                ? String(product.talla)
                    .split(',')
                    .map(x => x.trim())
                    .filter(Boolean)
                : ['S', 'M', 'L', 'XL'],

            colors: product.color
                ? String(product.color)
                    .split(',')
                    .map(x => x.trim())
                    .filter(Boolean)
                : ['Black'],

            stock: Number(product.stock) || 0,

            // IMPORTANTE:
            // Aquí dejamos pasar directamente Base64.
            image: product.imagen || '',

            images: Array.isArray(product.galeria) && product.galeria.length
                ? product.galeria
                : (product.imagen ? [product.imagen] : []),

            featured:
                Number(product.destacado) === 1,

            active: Number(product.activo ?? 1) !== 0,
            tag: product.etiqueta || '',
            sku: product.sku || String(product.id)
        };
    }


    // =========================================================
    // CARGAR PRODUCTOS DESDE SQLITE
    // =========================================================

    async function loadProductsFromAPI() {

        console.log(
            '🔄 Cargando productos desde SQLite...'
        );

        try {

            const response = await fetch(
                API_URL,
                {
                    method: 'GET',
                    cache: 'no-store'
                }
            );


            if (!response.ok) {

                throw new Error(
                    `Error HTTP ${response.status}`
                );
            }


            const data = await response.json();


            if (!Array.isArray(data)) {

                throw new Error(
                    'La API no devolvió una lista de productos'
                );
            }


            // SQLite → productos de la página

            products = data
                .map(normalizeProduct)
                .filter(product =>
                    product.active !== false
                );


            console.log(
                '✅ PRODUCTOS CARGADOS DESDE SQLITE:',
                products
            );


            renderProducts();

            renderCounts();

            renderCart();

            renderFavorites();


        } catch (error) {

            console.error(
                '❌ ERROR CARGANDO PRODUCTOS DESDE FLASK:',
                error
            );


            const grid = $('#productGrid');


            if (grid) {

                grid.innerHTML = `
                    <div class="api-error">
                        <strong>
                            No se pudieron cargar los productos.
                        </strong>

                        <p>
                            Verifica que Flask esté ejecutándose
                            en el puerto 5000.
                        </p>

                        <button
                            class="btn btn-primary"
                            id="retryProducts"
                        >
                            Reintentar
                        </button>
                    </div>
                `;


                const retry = $('#retryProducts');


                if (retry) {

                    retry.onclick =
                        loadProductsFromAPI;
                }
            }
        }
    }


    // =========================================================
    // CARRITO Y FAVORITOS
    // =========================================================

    function saveCartAndFavorites() {

        localStorage.setItem(
            CART_KEY,
            JSON.stringify(cart)
        );

        localStorage.setItem(
            FAV_KEY,
            JSON.stringify(favorites)
        );
    }


    // =========================================================
    // WHATSAPP
    // =========================================================

    function whatsappUrl(
        text = 'Hola S&S STREETWEAR, quiero consultar por un producto.'
    ) {

        const number = String(
            config.whatsapp || ''
        ).replace(/\D/g, '');


        return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    }


    // =========================================================
    // TOAST
    // =========================================================

    function toast(text) {

        const element = $('#toast');

        if (!element) return;


        element.textContent = text;

        element.classList.add('show');


        clearTimeout(toast.timer);


        toast.timer = setTimeout(() => {

            element.classList.remove('show');

        }, 2200);
    }


    // =========================================================
    // CONTADORES
    // =========================================================

    function cartCount() {

        return cart.reduce(
            (total, item) =>
                total + Number(item.qty || 0),
            0
        );
    }


    function renderCounts() {

        const cartCounter =
            $('#cartCount');

        const favoriteCounter =
            $('#favCount');


        if (cartCounter) {

            cartCounter.textContent =
                cartCount();
        }


        if (favoriteCounter) {

            favoriteCounter.textContent =
                favorites.length;
        }
    }


    // =========================================================
    // BUSCAR PRODUCTO
    // =========================================================

    function getProduct(id) {

        return products.find(
            product =>
                String(product.id) === String(id)
        );
    }


    // =========================================================
    // RENDER PRODUCTOS
    // =========================================================

    function renderProducts() {

        const grid =
            $('#productGrid');


        if (!grid) return;


        let list = [...products];


        // FILTRO

        if (activeFilter !== 'all') {

            list = list.filter(
                product =>
                    product.category ===
                    activeFilter
            );
        }


        // BUSCADOR

        if (query.trim()) {

            const search =
                query.toLowerCase().trim();


            list = list.filter(product => {

                const text = `
                    ${product.name}
                    ${product.category}
                    ${product.description}
                `.toLowerCase();


                return text.includes(search);
            });
        }


        // ORDENAMIENTO

        const sort =
            $('#sortProducts')?.value ||
            'featured';


        if (sort === 'low') {

            list.sort(
                (a, b) =>
                    a.price - b.price
            );
        }


        if (sort === 'high') {

            list.sort(
                (a, b) =>
                    b.price - a.price
            );
        }


        if (sort === 'name') {

            list.sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name,
                        'es'
                    )
            );
        }


        if (sort === 'featured') {

            list.sort(
                (a, b) =>
                    Number(b.featured) -
                    Number(a.featured)
            );
        }


        // CONTADOR

        const count =
            $('#productCount');


        if (count) {

            count.textContent =
                list.length;
        }


        // SIN RESULTADOS

        const empty =
            $('#emptyResults');


        if (empty) {

            empty.hidden =
                list.length !== 0;
        }


        // MOSTRAR PRODUCTOS

        grid.innerHTML =
            list.map(productCard).join('');


        bindProductButtons();
    }


    // =========================================================
    // TARJETA DEL PRODUCTO
    // =========================================================

    function productCard(product) {

        const id =
            String(product.id);


        const favorite =
            favorites.includes(id);


        const badge =
            product.tag
                ? `
                    <span class="product-badge">
                        ${escapeHtml(product.tag)}
                    </span>
                  `
                : '';


        const image =
            product.image || '';


        return `
            <article
                class="product-card"
                data-id="${id}"
            >

                <div class="product-media">

                    <img
                        src="${escapeHtml(image)}"
                        alt="${escapeHtml(product.name)}"
                        loading="lazy"
                    >

                    <span class="image-count">
                        ${product.images.length}
                        FOTO${product.images.length === 1 ? '' : 'S'}
                    </span>

                    ${badge}

                    <button
                        class="favorite ${favorite ? 'active' : ''}"
                        data-fav="${id}"
                        aria-label="Favorito"
                    >
                        ${favorite ? '♥' : '♡'}
                    </button>

                    <button
                        class="quick"
                        data-view="${id}"
                    >
                        Vista rápida / detalles
                    </button>

                </div>


                <div class="product-body">

                    <span class="product-category">
                        ${escapeHtml(
                            product.category.toUpperCase()
                        )}
                    </span>


                    <h3>
                        ${escapeHtml(product.name)}
                    </h3>


                    <p class="product-description">
                        ${escapeHtml(
                            product.description
                        )}
                    </p>


                    <div class="product-meta">

                        <strong class="product-price">
                            ${money(product.price)}
                        </strong>


                        <span class="product-stock">

                            <i class="stock-dot"></i>

                            ${product.stock}
                            disponibles

                        </span>

                    </div>


                    <button
                        class="add-btn"
                        data-add="${id}"
                        ${product.stock <= 0 ? 'disabled' : ''}
                    >
                        ${
                            product.stock <= 0
                                ? 'Sin stock'
                                : 'Añadir al carrito'
                        }

                        ${
                            product.stock > 0
                                ? '<span>+</span>'
                                : ''
                        }

                    </button>

                </div>

            </article>
        `;
    }


    // =========================================================
    // SEGURIDAD PARA TEXTO HTML
    // =========================================================

    function escapeHtml(value) {

        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }


    // =========================================================
    // BOTONES DE PRODUCTOS
    // =========================================================

    function bindProductButtons() {


        $$('[data-add]').forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    addToCart(
                        button.dataset.add
                    );
                }
            );
        });


        $$('[data-fav]').forEach(button => {

            button.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    toggleFavorite(
                        button.dataset.fav
                    );
                }
            );
        });


        $$('[data-view]').forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    openProduct(
                        button.dataset.view
                    );
                }
            );
        });
    }


    // =========================================================
    // AGREGAR AL CARRITO
    // =========================================================

    function addToCart(
        id,
        size = null,
        color = null,
        quantity = 1
    ) {

        const product =
            getProduct(id);


        if (!product) {

            toast('Producto no encontrado');

            return;
        }


        if (product.stock <= 0) {

            toast('Producto sin stock');

            return;
        }


        const selectedSize =
            size ||
            product.sizes[0];


        const selectedColor =
            color ||
            product.colors[0];


        const existing =
            cart.find(item =>
                String(item.id) === String(id) &&
                item.size === selectedSize &&
                item.color === selectedColor
            );


        if (existing) {

            existing.qty =
                Math.min(
                    existing.qty + quantity,
                    product.stock
                );

        } else {

            cart.push({

                id: String(id),

                qty:
                    Math.min(
                        quantity,
                        product.stock
                    ),

                size: selectedSize,

                color: selectedColor
            });
        }


        saveCartAndFavorites();

        renderCounts();

        renderCart();

        toast(
            `${product.name} añadido al carrito`
        );
    }


    // =========================================================
    // CAMBIAR CANTIDAD
    // =========================================================

    function updateQty(index, delta) {

        const item =
            cart[index];


        if (!item) return;


        const product =
            getProduct(item.id);


        if (!product) {

            cart.splice(index, 1);

            saveCartAndFavorites();

            renderCart();

            renderCounts();

            return;
        }


        item.qty =
            Math.max(
                1,
                Math.min(
                    product.stock,
                    item.qty + delta
                )
            );


        saveCartAndFavorites();

        renderCounts();

        renderCart();
    }


    // =========================================================
    // ELIMINAR DEL CARRITO
    // =========================================================

    function removeCart(index) {

        cart.splice(index, 1);

        saveCartAndFavorites();

        renderCounts();

        renderCart();

        toast('Producto eliminado');
    }


    // =========================================================
    // DESCUENTO DE BIENVENIDA (el servidor es quien lo aplica de verdad)
    // =========================================================

    function discountAmount(subtotal) {
        if (!discountState.disponible) return 0;
        return Math.round(subtotal * discountState.porcentaje) / 100;
    }

    function updateCartTotals(subtotal) {
        const totalEl = $('#cartTotal');
        const note = $('#cartDiscountNote');
        const desc = discountAmount(subtotal);
        if (totalEl) totalEl.textContent = money(subtotal - desc);
        if (!note) return;
        if (!subtotal) { note.innerHTML = ''; return; }
        if (desc > 0) {
            note.innerHTML = `<div class="cd-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>` +
                `<div class="cd-row cd-save"><span>🎁 Descuento de bienvenida (${discountState.porcentaje}%)</span><span>− ${money(desc)}</span></div>`;
        } else if (!discountState.autenticado && discountState.porcentaje > 0) {
            note.innerHTML = `<button type="button" class="cd-promo" id="cartCreateAccount">🎁 Crea tu cuenta y ahorra ${discountState.porcentaje}% en esta compra →</button>`;
            $('#cartCreateAccount')?.addEventListener('click', () => {
                closeAll();
                openLogin();
                document.getElementById('switchRegister')?.click();
            });
        } else {
            note.innerHTML = '';
        }
    }


    // =========================================================
    // RENDER CARRITO
    // =========================================================

    function renderCart() {

        const body =
            $('#cartBody');


        if (!body) return;


        if (!cart.length) {

            body.innerHTML = `
                <div class="cart-empty">

                    <div>

                        <strong>
                            Tu carrito está vacío.
                        </strong>

                        <p>
                            Añade alguna pieza
                            de la colección.
                        </p>

                    </div>

                </div>
            `;


            const total =
                $('#cartTotal');


            updateCartTotals(0);


            const buy =
                $('#buyWhatsapp');


            if (buy) {

                buy.disabled = true;
            }


            return;
        }


        let total = 0;


        body.innerHTML =
            cart.map((item, index) => {

                const product =
                    getProduct(item.id);


                if (!product) {

                    return '';
                }


                const subtotal =
                    product.price *
                    item.qty;


                total += subtotal;


                return `
                    <div class="cart-item">

                        <img
                            src="${escapeHtml(product.image)}"
                            alt="${escapeHtml(product.name)}"
                        >


                        <div>

                            <h3>
                                ${escapeHtml(product.name)}
                            </h3>


                            <p>
                                ${money(product.price)}
                                · ${escapeHtml(item.size)}
                                · ${escapeHtml(item.color)}
                            </p>


                            <div class="qty">

                                <button
                                    data-minus="${index}"
                                >
                                    −
                                </button>


                                <span>
                                    ${item.qty}
                                </span>


                                <button
                                    data-plus="${index}"
                                >
                                    +
                                </button>

                            </div>

                        </div>


                        <button
                            class="remove"
                            data-remove="${index}"
                            aria-label="Eliminar"
                        >
                            ×
                        </button>

                    </div>
                `;

            }).join('');


        const totalElement =
            $('#cartTotal');


        updateCartTotals(total);


        const buy =
            $('#buyWhatsapp');


        if (buy) {

            buy.disabled = false;
        }


        $$('[data-minus]').forEach(button => {

            button.onclick = () => {

                updateQty(
                    Number(button.dataset.minus),
                    -1
                );
            };
        });


        $$('[data-plus]').forEach(button => {

            button.onclick = () => {

                updateQty(
                    Number(button.dataset.plus),
                    1
                );
            };
        });


        $$('[data-remove]').forEach(button => {

            button.onclick = () => {

                removeCart(
                    Number(button.dataset.remove)
                );
            };
        });
    }


    // =========================================================
    // MENSAJE WHATSAPP DEL CARRITO
    // =========================================================

    function discountLines(subtotal, server) {
        const desc = server ? Number(server.descuento || 0) : discountAmount(subtotal);
        if (desc > 0) {
            const final = server ? Number(server.total) : subtotal - desc;
            return `Subtotal: ${money(subtotal)}\nDescuento de bienvenida: - ${money(desc)}\nTotal a pagar: ${money(final)}`;
        }
        return `Total: ${money(subtotal)}`;
    }

    function cartMessage(server) {

        let total = 0;


        const lines =
            cart.map(item => {

                const product =
                    getProduct(item.id);


                if (!product) return '';


                const subtotal =
                    product.price *
                    item.qty;


                total += subtotal;


                return (
                    `• ${product.name}` +
                    ` | Talla: ${item.size}` +
                    ` | Color: ${item.color}` +
                    ` | Cantidad: ${item.qty}` +
                    ` | ${money(subtotal)}`
                );

            }).filter(Boolean);


        return `
Hola S&S STREETWEAR 👋

Quiero realizar este pedido:

${lines.join('\n')}

${discountLines(total, server)}

¿Podrían confirmarme disponibilidad, forma de pago y envío?
        `.trim();
    }


    // =========================================================
    // GUARDAR PEDIDO + WHATSAPP
    // =========================================================

    async function submitOrderToDatabase() {

        if (!cart.length) {
            toast('Tu carrito está vacío.');
            return;
        }

        const name = $('#checkoutName')?.value?.trim() || '';
        const email = $('#checkoutEmail')?.value?.trim() || '';
        const phone = $('#checkoutPhone')?.value?.trim() || '';
        const address = $('#checkoutAddress')?.value?.trim() || '';
        const submitButton = $('#checkoutForm button[type="submit"]');

        if (!name || !email || !phone) {
            toast('Completa nombre, correo y teléfono.');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast('Escribe un correo válido.');
            return;
        }

        const items = cart.map(item => ({
            producto_id: Number(item.id),
            cantidad: Number(item.qty) || 1,
            talla: item.size || '',
            color: item.color || ''
        }));

        const originalText = submitButton?.textContent || 'Guardar pedido + WhatsApp ↗';
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Guardando pedido...';
        }

        try {
            const response = await fetch(ORDERS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente: {
                        nombre: name,
                        correo: email,
                        telefono: phone,
                        direccion: address
                    },
                    items
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `Error del servidor (${response.status})`);
            }

            const text = `${cartMessage(data)}\n\nDATOS DEL CLIENTE\nNombre: ${name}\nCorreo: ${email}\nTeléfono: ${phone}${address ? `\nDirección: ${address}` : ''}\n\nPedido registrado #${data.pedido_id || ''}.`;

            cart = [];
            saveCartAndFavorites();
            renderCounts();
            renderCart();
            closeAll();
            $('#checkoutForm')?.reset();
            toast('Pedido guardado. Abriendo WhatsApp para coordinar el pago...');
            refreshAccountUI();

            // Navegación directa: evita que el navegador bloquee una nueva ventana.
            setTimeout(() => {
                window.location.href = whatsappUrl(text);
            }, 250);

        } catch (error) {
            console.error('Error al guardar pedido:', error);
            toast(`No se pudo guardar: ${error.message}`);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        }
    }


    // =========================================================
    // FAVORITOS
    // =========================================================

    function toggleFavorite(id) {

        id = String(id);


        if (favorites.includes(id)) {

            favorites =
                favorites.filter(
                    item => item !== id
                );

            toast(
                'Eliminado de favoritos'
            );

        } else {

            favorites.push(id);

            toast(
                'Guardado en favoritos'
            );
        }


        saveCartAndFavorites();

        renderCounts();

        renderProducts();

        renderFavorites();
    }


    function renderFavorites() {

        const body =
            $('#favBody');


        if (!body) return;


        const list =
            favorites
                .map(getProduct)
                .filter(Boolean);


        if (!list.length) {

            body.innerHTML = `
                <div class="cart-empty">

                    <div>

                        <strong>
                            No tienes favoritos.
                        </strong>

                        <p>
                            Guarda piezas que quieras
                            revisar después.
                        </p>

                    </div>

                </div>
            `;

            return;
        }


        body.innerHTML =
            list.map(product => `

                <div class="fav-row">

                    <img
                        src="${escapeHtml(product.image)}"
                        alt="${escapeHtml(product.name)}"
                    >

                    <div>

                        <h3>
                            ${escapeHtml(product.name)}
                        </h3>

                        <p>
                            ${money(product.price)}
                        </p>

                        <button
                            data-fav-add="${product.id}"
                        >
                            Añadir al carrito
                        </button>

                    </div>

                </div>

            `).join('');


        $$('[data-fav-add]').forEach(button => {

            button.onclick = () => {

                addToCart(
                    button.dataset.favAdd
                );
            };
        });
    }


    // =========================================================
    // MODAL DEL PRODUCTO
    // =========================================================

    function openProduct(id) {

        const product =
            getProduct(id);


        if (!product) return;


        selectedProduct =
            product;


        const image =
            $('#modalImage');


        if (image) {

            image.src =
                product.image;

            image.alt =
                product.name;
        }


        const category =
            $('#modalCategory');


        if (category) {

            category.textContent =
                product.category.toUpperCase();
        }


        const name =
            $('#modalName');


        if (name) {

            name.textContent =
                product.name;
        }


        const description =
            $('#modalDescription');


        if (description) {

            description.textContent =
                product.description;
        }


        const price =
            $('#modalPrice');


        if (price) {

            price.textContent =
                money(product.price);
        }


        const stock =
            $('#modalStock');


        if (stock) {

            stock.textContent =
                `Stock disponible: ${product.stock}`;
        }


        const size =
            $('#modalSize');


        if (size) {

            size.innerHTML =
                product.sizes
                    .map(item =>
                        `<option>${escapeHtml(item)}</option>`
                    )
                    .join('');
        }


        const color =
            $('#modalColor');


        if (color) {

            color.innerHTML =
                product.colors
                    .map(item =>
                        `<option>${escapeHtml(item)}</option>`
                    )
                    .join('');
        }


        // Galería opcional.
        // Tu HTML actual puede no tener #modalGallery,
        // por eso primero comprobamos si existe.

        const gallery =
            $('#modalGallery');


        if (gallery) {

            gallery.innerHTML =
                product.images.map(
                    (src, index) => `

                    <button
                        type="button"
                        class="modal-thumb ${
                            index === 0
                                ? 'active'
                                : ''
                        }"
                        data-modal-img="${index}"
                    >

                        <img
                            src="${escapeHtml(src)}"
                            alt="${escapeHtml(product.name)} ${index + 1}"
                        >

                    </button>
                `
                ).join('');


            $$('[data-modal-img]').forEach(button => {

                button.onclick = () => {

                    $$('#modalGallery .modal-thumb')
                        .forEach(
                            element =>
                                element.classList.remove(
                                    'active'
                                )
                        );


                    button.classList.add('active');


                    if (image) {

                        image.src =
                            product.images[
                                Number(
                                    button.dataset.modalImg
                                )
                            ];
                    }
                };
            });
        }


        const modal =
            $('#productModal');


        const overlay =
            $('#overlay');


        if (modal) {

            modal.classList.add('active');
        }


        if (overlay) {

            overlay.classList.add('active');
        }


        document.body.classList.add('lock');
    }


    // =========================================================
    // PANELES
    // =========================================================

    function openPanel(id) {

        const overlay =
            $('#overlay');

        const panel =
            $('#' + id);


        if (overlay) {

            overlay.classList.add('active');
        }


        if (panel) {

            panel.classList.add('active');
        }


        document.body.classList.add('lock');
    }


    function closeAll() {

        $$('.side-panel, .modal')
            .forEach(element => {

                element.classList.remove(
                    'active'
                );
            });


        const overlay =
            $('#overlay');


        if (overlay) {

            overlay.classList.remove(
                'active'
            );
        }


        document.body.classList.remove(
            'lock'
        );
    }


    // =========================================================
    // IMÁGENES / CONFIGURACIÓN VISUAL
    // =========================================================

    function applyStoreVisuals() {

        const map = {

            categoryPoleras:
                'visualCategoryPoleras',

            categorySudadera:
                'visualCategorySudadera',

            categoryPantalones:
                'visualCategoryPantalones',

            categoryTenis:
                'visualCategoryTenis',

            categoryGorras:
                'visualCategoryGorras',

            editorial:
                'visualEditorial',

            dropTall:
                'visualDropTall',

            dropMono:
                'visualDropMono',

            dropStreet:
                'visualDropStreet',

            gallery01:
                'visualGallery01',

            gallery02:
                'visualGallery02',

            gallery03:
                'visualGallery03',

            gallery04:
                'visualGallery04'
        };


        Object.entries(map).forEach(
            ([key, id]) => {

                const element =
                    document.getElementById(id);


                const source =
                    storeMedia[key];


                if (
                    element &&
                    source
                ) {

                    element.src =
                        source;
                }
            }
        );


        const heroImage = document.querySelector('.hero-image');

        if (heroImage && storeMedia.hero) {

            heroImage.style.backgroundImage =
                'linear-gradient(90deg,rgba(0,0,0,.95),rgba(0,0,0,.48) 45%,rgba(0,0,0,.78)),url("' +
                String(storeMedia.hero).replace(/["\\\n]/g, '') + '")';
        }


        if (config.storeName) {

            document.title =
                `${config.storeName} | ${
                    config.subtitle ||
                    'Tienda urbana premium'
                }`;
        }
    }


    // =========================================================
    // CARRITO DESPUÉS DE ACTUALIZAR PRODUCTOS
    // =========================================================

    function cleanInvalidCartItems() {

        const validIds =
            new Set(
                products.map(
                    product =>
                        String(product.id)
                )
            );


        const oldLength =
            cart.length;


        cart =
            cart.filter(item =>
                validIds.has(
                    String(item.id)
                )
            );


        if (
            cart.length !== oldLength
        ) {

            saveCartAndFavorites();
        }
    }


    // =========================================================
    // CONFIGURACIÓN
    // =========================================================

    function refreshConfig() {

        config = {

            ...(window.SS_DEFAULT_CONFIG || {}),

            ...read(
                CONFIG_KEY,
                {}
            )
        };


        storeMedia = {

            ...read(
                STORE_MEDIA_KEY,
                {}
            )
        };


        applyStoreVisuals();
    }


    // =========================================================
    // CONFIGURAR EVENTOS
    // =========================================================

    function setupEvents() {


        // MENÚ MÓVIL

        const menu =
            $('#menuBtn');


        if (menu) {

            menu.onclick = () => {

                $('#mobileNav')
                    ?.classList.toggle(
                        'open'
                    );
            };
        }


        // BUSCADOR

        const searchButton =
            $('#searchBtn');


        if (searchButton) {

            searchButton.onclick = () => {

                const panel =
                    $('#searchPanel');


                if (panel) {

                    panel.classList.add(
                        'open'
                    );
                }


                $('#globalSearch')?.focus();
            };
        }


        const closeSearch =
            $('#closeSearch');


        if (closeSearch) {

            closeSearch.onclick = () => {

                $('#searchPanel')
                    ?.classList.remove(
                        'open'
                    );
            };
        }


        const globalSearch =
            $('#globalSearch');


        if (globalSearch) {

            globalSearch.addEventListener(
                'input',
                event => {

                    query =
                        event.target.value;

                    activeFilter =
                        'all';


                    $$('.filter')
                        .forEach(button =>
                            button.classList.remove(
                                'active'
                            )
                        );


                    $('.filter[data-filter="all"]')
                        ?.classList.add(
                            'active'
                        );


                    renderProducts();
                }
            );
        }


        // FILTROS

        $$('.filter').forEach(
            button => {

                button.onclick = () => {

                    activeFilter =
                        button.dataset.filter;


                    query = '';


                    if (globalSearch) {

                        globalSearch.value =
                            '';
                    }


                    $$('.filter')
                        .forEach(item =>
                            item.classList.remove(
                                'active'
                            )
                        );


                    button.classList.add(
                        'active'
                    );


                    renderProducts();
                };
            }
        );


        // ORDENAR

        const sort =
            $('#sortProducts');


        if (sort) {

            sort.onchange =
                renderProducts;
        }


        // REINICIAR FILTROS

        const reset =
            $('#resetFilters');


        if (reset) {

            reset.onclick = () => {

                activeFilter =
                    'all';

                query = '';


                if (globalSearch) {

                    globalSearch.value =
                        '';
                }


                $('.filter[data-filter="all"]')
                    ?.click();
            };
        }


        // CATEGORÍAS

        $$('.category-card').forEach(
            button => {

                button.onclick = () => {

                    const filter =
                        $(
                            `[data-filter="${button.dataset.category}"]`
                        );


                    if (filter) {

                        filter.click();
                    }


                    $('#catalogo')
                        ?.scrollIntoView({
                            behavior: 'smooth'
                        });
                };
            }
        );


        // CARRITO

        const cartButton =
            $('#cartBtn');


        if (cartButton) {

            cartButton.onclick = () => {

                renderCart();

                openPanel(
                    'cartPanel'
                );
            };
        }


        // FAVORITOS

        const favoriteButton =
            $('#favoritesBtn');


        if (favoriteButton) {

            favoriteButton.onclick = () => {

                renderFavorites();

                openPanel(
                    'favPanel'
                );
            };
        }


        // OVERLAY

        $('#overlay')?.addEventListener(
            'click',
            closeAll
        );


        // BOTONES DE CERRAR

        $$('[data-close]').forEach(
            button => {

                button.onclick =
                    closeAll;
            }
        );


        // ESC

        document.addEventListener(
            'keydown',
            event => {

                if (
                    event.key ===
                    'Escape'
                ) {

                    closeAll();
                }
            }
        );


        // VACIAR CARRITO

        const clearCart =
            $('#clearCart');


        if (clearCart) {

            clearCart.onclick = () => {

                if (!cart.length) return;


                cart = [];


                saveCartAndFavorites();

                renderCounts();

                renderCart();

                toast(
                    'Carrito vaciado'
                );
            };
        }


        // COMPRAR POR WHATSAPP

        const buyWhatsapp =
            $('#buyWhatsapp');


        if (buyWhatsapp) {
            buyWhatsapp.onclick = () => {
                if (!cart.length) return;
                $('#checkoutModal')?.classList.add('active');
                document.body.classList.add('lock');
                setTimeout(() => $('#checkoutName')?.focus(), 50);
            };
        }

        $('#checkoutForm')?.addEventListener('submit', event => {
            event.preventDefault();
            submitOrderToDatabase();
        });


        // AGREGAR DESDE MODAL

        const modalAdd =
            $('#modalAdd');


        if (modalAdd) {

            modalAdd.onclick = () => {

                if (!selectedProduct)
                    return;


                const size =
                    $('#modalSize')
                        ?.value ||
                    selectedProduct.sizes[0];


                const color =
                    $('#modalColor')
                        ?.value ||
                    selectedProduct.colors[0];


                addToCart(
                    selectedProduct.id,
                    size,
                    color
                );


                closeAll();


                openPanel(
                    'cartPanel'
                );
            };
        }


        // WHATSAPP PRINCIPAL

        const whatsappElements = [

            $('#mainWhatsapp'),

            $('#contactWhatsapp'),

            $('#footerWhatsapp')
        ];


        whatsappElements.forEach(
            element => {

                if (element) {

                    element.href =
                        whatsappUrl();
                }
            }
        );


        // NEWSLETTER

        const newsletter =
            $('#newsletterForm');


        if (newsletter) {
            newsletter.onsubmit = async event => {
                event.preventDefault();
                const correo = $('#newsletterEmail')?.value?.trim() || '';
                try {
                    const response = await fetch('/api/suscriptores', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({correo})
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
                    toast('¡Gracias! Tu correo quedó guardado.');
                    newsletter.reset();
                } catch (error) {
                    console.error(error);
                    toast('No se pudo guardar la suscripción. Revisa Flask.');
                }
            };
        }


        // FORMULARIO CONTACTO

        const contact =
            $('#contactForm');


        if (contact) {
            contact.onsubmit = async event => {
                event.preventDefault();
                const name = $('#contactName')?.value?.trim() || '';
                const email = $('#contactEmail')?.value?.trim() || '';
                const subject = $('#contactSubject')?.value?.trim() || '';
                const message = $('#contactMessage')?.value?.trim() || '';
                try {
                    const response = await fetch('/api/contacto', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({nombre: name, correo: email, asunto: subject, mensaje: message})
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'No se pudo guardar');

                    const text = `Hola S&S STREETWEAR. Soy ${name}. Asunto: ${subject}. ${message}`;
                    window.open(whatsappUrl(text), '_blank');
                    contact.reset();
                    toast('Consulta guardada en la base de datos.');
                } catch (error) {
                    console.error(error);
                    toast('No se pudo guardar la consulta. Revisa Flask.');
                }
            };
        }


        // ANIMACIONES

        if (
            'IntersectionObserver'
            in window
        ) {

            const observer =
                new IntersectionObserver(
                    entries => {

                        entries.forEach(
                            entry => {

                                if (
                                    entry.isIntersecting
                                ) {

                                    entry.target.classList.add(
                                        'visible'
                                    );
                                }
                            }
                        );

                    },
                    {
                        threshold: 0.12
                    }
                );


            $$('.reveal')
                .forEach(element =>
                    observer.observe(
                        element
                    )
                );
        }
    }


    // =========================================================
    // INICIAR
    // =========================================================

    async function init() {

        console.log(
            '🚀 S&S STREETWEAR iniciando...'
        );


        await loadServerConfig();
        refreshConfig();

        setupEvents();


        renderCounts();

        renderCart();

        renderFavorites();


        // IMPORTANTE:
        // Primero cargamos desde SQLite.

        await loadProductsFromAPI();


        // Eliminamos del carrito productos
        // que ya no existen en SQLite.

        cleanInvalidCartItems();


        renderCart();

        renderFavorites();

        renderCounts();


        console.log(
            '✅ S&S STREETWEAR listo.'
        );
    }


    // =========================================================
    // ARRANCAR CUANDO EL HTML ESTÉ LISTO
    // =========================================================

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();
    }


    // =========================================================
    // RECARGAR SI EL ADMIN CAMBIA PRODUCTOS
    // =========================================================
    //
    // Esto NO depende de localStorage para los productos.
    // Simplemente intenta actualizar desde SQLite cada vez
    // que vuelves a la página.
    //

    window.refreshSSEProducts =
        loadProductsFromAPI;

})();