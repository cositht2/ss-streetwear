// Aplica el tema guardado (claro por defecto) antes de pintar la página, para evitar parpadeos.
(() => { let t = "claro"; try { t = localStorage.getItem("ss_tema") || "claro"; } catch (e) {} document.documentElement.dataset.tema = t; })();
