const SS_PRODUCTS = [
  {id:'p001',name:'Polo Big Pony Black',category:'polos',price:249,oldPrice:289,stock:12,tag:'BEST SELLER',sizes:['S','M','L','XL'],colors:['Black','White'],image:'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85',description:'Polo oversized de corte premium con acabado urbano.',featured:true,active:true},
  {id:'p002',name:'Hoodie Essential Shadow',category:'hoodies',price:329,oldPrice:369,stock:8,tag:'NEW',sizes:['S','M','L','XL'],colors:['Black','Gray'],image:'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85',description:'Hoodie pesado, cómodo y minimalista para outfits urbanos.',featured:true,active:true},
  {id:'p003',name:'Oversized Tee Concrete',category:'polos',price:189,oldPrice:219,stock:20,tag:'NEW',sizes:['S','M','L','XL'],colors:['Gray','Black'],image:'https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=900&q=85',description:'Polera oversized con silueta amplia y estética contemporánea.',featured:true,active:true},
  {id:'p004',name:'Sneakers Red District',category:'sneakers',price:499,oldPrice:559,stock:6,tag:'LIMITED',sizes:['39','40','41','42','43'],colors:['Red','Black'],image:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',description:'Sneakers urbanos con contraste rojo y negro.',featured:true,active:true},
  {id:'p005',name:'Cap Signature S&S',category:'gorras',price:119,oldPrice:139,stock:25,tag:'',sizes:['Única'],colors:['Black'],image:'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=900&q=85',description:'Gorra estructurada con identidad S&S STREETWEAR.',featured:false,active:true},
  {id:'p006',name:'Jogger Urban Core',category:'joggers',price:279,oldPrice:319,stock:10,tag:'BEST SELLER',sizes:['S','M','L','XL'],colors:['Black','Gray'],image:'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=85',description:'Jogger urbano de fit cómodo para completar el look.',featured:true,active:true},
  {id:'p007',name:'Hoodie Red Label',category:'hoodies',price:349,oldPrice:399,stock:5,tag:'LIMITED',sizes:['M','L','XL'],colors:['Black','Red'],image:'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=85',description:'Edición limitada con detalles rojos y presencia premium.',featured:false,active:true},
  {id:'p008',name:'Sneakers Street White',category:'sneakers',price:459,oldPrice:519,stock:9,tag:'',sizes:['39','40','41','42','43'],colors:['White','Gray'],image:'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=85',description:'Sneaker limpio y versátil para outfits diarios.',featured:false,active:true},
  {id:'p009',name:'Tee Luxury Oversize',category:'polos',price:229,oldPrice:259,stock:14,tag:'NEW',sizes:['S','M','L','XL'],colors:['White','Black'],image:'https://images.unsplash.com/photo-1583743814966-8936f37f4678?auto=format&fit=crop&w=900&q=85',description:'Oversized premium con estética limpia y moderna.',featured:false,active:true},
  {id:'p010',name:'Cargo Urban Black',category:'joggers',price:299,oldPrice:339,stock:7,tag:'',sizes:['S','M','L','XL'],colors:['Black'],image:'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85',description:'Pantalón cargo inspirado en la cultura streetwear.',featured:false,active:true},
  {id:'p011',name:'Cap Red Signal',category:'gorras',price:129,oldPrice:149,stock:18,tag:'NEW',sizes:['Única'],colors:['Black','Red'],image:'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=900&q=85',description:'Gorra urbana con detalle rojo de alto contraste.',featured:false,active:true},
  {id:'p012',name:'Hoodie Oversize Stone',category:'hoodies',price:339,oldPrice:379,stock:11,tag:'',sizes:['S','M','L','XL'],colors:['Stone','Black'],image:'https://images.unsplash.com/photo-1509942774463-acf339cf87d5?auto=format&fit=crop&w=900&q=85',description:'Hoodie oversized de tonos neutros y textura premium.',featured:false,active:true}
];

const SS_DEFAULT_CONFIG = {
  storeName:'S&S STREETWEAR',
  subtitle:'TIENDA URBANA PREMIUM',
  whatsapp:'59170000000',
  currency:'Bs',
  shipping:'Envíos a toda Bolivia',
  instagram:'https://instagram.com/',
  tiktok:'https://tiktok.com/',
  email:'contacto@ssstreetwear.com'
};

window.SS_PRODUCTS = SS_PRODUCTS;
window.SS_DEFAULT_CONFIG = SS_DEFAULT_CONFIG;
