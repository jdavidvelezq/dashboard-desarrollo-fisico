/**
 * personalizacion.js — Dashboard Dirección de Desarrollo Físico
 * Capa de presentación sobre el código base de DIAT (se carga DESPUÉS de script.js):
 *  - Tarjetas "Financiero" y "Avance" con las columnas reales del informe de contratos.
 *  - Textos institucionales (Contrato en lugar de Convenio, etc.).
 *  - Oculta módulos heredados que no aplican (asistente IA, visitas, portal del supervisor).
 * No modifica datos: solo lee las columnas originales de cada fila.
 */
(function () {
    'use strict';

    var U = window.DDF_UTIL || {};
    var norm = U.norm || function (s) { return String(s || '').toUpperCase().trim(); };

    // ------------------------------------------------------------ lectura de columnas originales
    var claveCache = {};
    function valor(row, nombre) {
        var k = claveCache[nombre];
        if (k === undefined || !(k in row)) {
            k = U.buscarClave ? U.buscarClave(Object.keys(row), nombre) : nombre;
            if (k !== undefined) claveCache[nombre] = k;
        }
        return k !== undefined ? row[k] : undefined;
    }
    // número o null (vacío, N/A, errores de fórmula y textos no numéricos quedan fuera)
    function numero(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number') return isFinite(v) ? v : null;
        var s = String(v).trim();
        if (!s || /^n\/?a$/i.test(s) || s.charAt(0) === '#') return null;
        var m = s.match(/^(-?[\d.,]+)\s*%+$/);
        if (m) {
            var p = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            return isFinite(p) ? p / 100 : null;
        }
        var n = parseFloat(s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
        return isFinite(n) ? n : null;
    }

    var COL = {
        valor: 'VALOR TOTAL INCLUIDAS ADICIONES',
        ejecutado: 'RECURSO EJECUTADO',
        pagado: 'RECURSO PAGADO',
        pendiente: 'PENDIENTE POR EJECUTAR',
        fisReal: 'EJECUCION FISICA REAL (REPORTADA)',
        fisProg: 'EJECUCION FISICA PROGRAMADA',
        retraso: '% DE RETRASO',
        finReal: 'EJECUCION FINANCIERA REAL',
        finRep: 'EJECUCIÓN FINANCIERA REPORTADA',
        riesgo: 'RIESGO'
    };

    function calcular(rows) {
        var r = {
            n: rows.length,
            valor: 0, ejecutado: 0, pagado: 0, pendiente: 0,
            nValor: 0, nEjecutado: 0, nPagado: 0, nPendiente: 0,
            fisReal: [], fisProg: [], finReal: [], finRep: [],
            pondNum: 0, pondDen: 0,
            retraso: { rojo: 0, amarillo: 0, verde: 0, sinDato: 0 },
            riesgo: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, sinDato: 0 }
        };
        rows.forEach(function (row) {
            var v = numero(valor(row, COL.valor)), e = numero(valor(row, COL.ejecutado)),
                p = numero(valor(row, COL.pagado)), pe = numero(valor(row, COL.pendiente));
            if (v !== null) { r.valor += v; r.nValor++; }
            if (e !== null) { r.ejecutado += e; r.nEjecutado++; }
            if (p !== null) { r.pagado += p; r.nPagado++; }
            if (pe !== null) { r.pendiente += pe; r.nPendiente++; }

            var fr = numero(valor(row, COL.fisReal)), fp = numero(valor(row, COL.fisProg)),
                nr = numero(valor(row, COL.finReal)), nrep = numero(valor(row, COL.finRep));
            if (fr !== null) { r.fisReal.push(fr); if (v) { r.pondNum += fr * v; r.pondDen += v; } }
            if (fp !== null) r.fisProg.push(Math.max(0, Math.min(1, fp)));
            if (nr !== null) r.finReal.push(nr);
            if (nrep !== null) r.finRep.push(nrep);

            var rt = numero(valor(row, COL.retraso));
            if (rt === null) r.retraso.sinDato++;
            else if (rt <= -0.10) r.retraso.rojo++;
            else if (rt <= -0.05) r.retraso.amarillo++;
            else r.retraso.verde++;

            var rg = numero(valor(row, COL.riesgo));
            if (rg !== null && r.riesgo[Math.round(rg)] !== undefined) r.riesgo[Math.round(rg)]++;
            else r.riesgo.sinDato++;
        });
        var prom = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; };
        r.pFisReal = prom(r.fisReal);
        r.pFisPond = r.pondDen ? r.pondNum / r.pondDen : null;
        r.pFisProg = prom(r.fisProg);
        r.pFinReal = prom(r.finReal);
        r.pFinRep = prom(r.finRep);
        return r;
    }

    // ------------------------------------------------------------ formato
    function dinero(v) { return '$ ' + Math.round(v || 0).toLocaleString('es-CO'); }
    function pct(v) {
        if (v === null || v === undefined) return '—';
        return (v * 100).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }
    function ancho(v) { return Math.max(0, Math.min(100, (v || 0) * 100)).toFixed(1) + '%'; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ------------------------------------------------------------ tarjetas
    var CARD_CLASS = 'lg:col-span-6 kpi-card flex flex-col gap-2.5 px-4 py-3';

    function cabecera(icono, color, titulo, subtitulo) {
        return '<div class="flex items-center gap-2 border-b border-slate-100 pb-2">' +
            '<div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:' + color + '1A;color:' + color + ';border:1px solid ' + color + '40">' +
            '<i class="fa-solid ' + icono + ' text-xs"></i></div>' +
            '<div><h4 class="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight">' + esc(titulo) + '</h4>' +
            '<p class="text-[10px] text-slate-400 font-medium">' + esc(subtitulo) + '</p></div></div>';
    }

    function tile(etiqueta, valorTxt, nota, color, fraccion) {
        return '<div class="rounded-lg border border-slate-100 p-2.5 flex flex-col gap-1" style="background:#F8FAFC">' +
            '<span class="text-[9.5px] font-bold uppercase tracking-wide text-slate-500">' + esc(etiqueta) + '</span>' +
            '<span class="text-sm font-extrabold text-slate-900 leading-tight">' + esc(valorTxt) + '</span>' +
            (fraccion !== undefined ? '<div class="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div class="h-full rounded-full" style="width:' + ancho(fraccion) + ';background:' + color + '"></div></div>' : '') +
            '<span class="text-[9.5px] text-slate-400">' + esc(nota) + '</span></div>';
    }

    function barra(etiqueta, columna, v, color, nota) {
        return '<div class="flex flex-col gap-1">' +
            '<div class="flex items-baseline justify-between gap-2"><span class="text-[10.5px] font-bold text-slate-700">' + esc(etiqueta) + '</span>' +
            '<span class="text-xs font-extrabold text-slate-900">' + pct(v) + '</span></div>' +
            '<div class="h-2 rounded-full bg-slate-200 overflow-hidden"><div class="h-full rounded-full" style="width:' + ancho(v) + ';background:' + color + '"></div></div>' +
            '<span class="text-[9px] text-slate-400">' + esc(columna) + (nota ? ' · ' + esc(nota) : '') + '</span></div>';
    }

    function chip(texto, n, fondo, tinta) {
        return '<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold" style="background:' + fondo + ';color:' + tinta + '">' +
            esc(texto) + ' <span class="font-extrabold">' + n + '</span></span>';
    }

    function htmlFinanciero(m) {
        var base = m.valor || 0;
        return cabecera('fa-sack-dollar', '#8B4A97', 'Financiero', 'Valores del informe de contratos') +
            '<div class="grid grid-cols-2 gap-2">' +
            tile('Valor total', dinero(m.valor), 'VALOR TOTAL INCLUIDAS ADICIONES · ' + m.nValor + ' de ' + m.n + ' con dato', '#8B4A97') +
            tile('Ejecutado', dinero(m.ejecutado), pct(base ? m.ejecutado / base : null) + ' del valor total · RECURSO EJECUTADO', '#2563EB', base ? m.ejecutado / base : 0) +
            tile('Pagado', dinero(m.pagado), pct(base ? m.pagado / base : null) + ' del valor total · RECURSO PAGADO', '#018D38', base ? m.pagado / base : 0) +
            tile('Pendiente por ejecutar', dinero(m.pendiente), pct(base ? m.pendiente / base : null) + ' del valor total · PENDIENTE POR EJECUTAR', '#D97706', base ? m.pendiente / base : 0) +
            '</div>';
    }

    function htmlAvance(m) {
        return cabecera('fa-person-digging', '#018D38', 'Avance', 'Promedio de los contratos filtrados, tal como lo reporta el informe') +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">' +
            barra('Física real', 'EJECUCION FISICA REAL (REPORTADA)', m.pFisReal, '#018D38', m.fisReal.length + ' con dato · ponderado por valor ' + pct(m.pFisPond)) +
            barra('Física programada', 'EJECUCION FISICA PROGRAMADA', m.pFisProg, '#94A3B8', m.fisProg.length + ' con dato') +
            barra('Financiera real', 'EJECUCION FINANCIERA REAL', m.pFinReal, '#2563EB', m.finReal.length + ' con dato') +
            barra('Financiera reportada', 'EJECUCIÓN FINANCIERA REPORTADA', m.pFinRep, '#93C5FD', m.finRep.length + ' con dato') +
            '</div>' +
            '<div class="flex flex-col gap-1.5 border-t border-slate-100 pt-2">' +
            '<div class="flex flex-wrap items-center gap-1.5"><span class="text-[9.5px] font-bold uppercase tracking-wide text-slate-500 mr-1">% de retraso</span>' +
            chip('≥ 10 pts', m.retraso.rojo, '#FEE2E2', '#991B1B') + chip('5 a 10 pts', m.retraso.amarillo, '#FEF3C7', '#92400E') +
            chip('< 5 pts', m.retraso.verde, '#DCFCE7', '#166534') + chip('Sin dato', m.retraso.sinDato, '#F1F5F9', '#475569') + '</div>' +
            '<div class="flex flex-wrap items-center gap-1.5"><span class="text-[9.5px] font-bold uppercase tracking-wide text-slate-500 mr-1">Riesgo</span>' +
            chip('1', m.riesgo[1], '#DCFCE7', '#166534') + chip('2', m.riesgo[2], '#ECFCCB', '#3F6212') + chip('3', m.riesgo[3], '#FEF3C7', '#92400E') +
            chip('4', m.riesgo[4], '#FFEDD5', '#9A3412') + chip('5', m.riesgo[5], '#FEE2E2', '#991B1B') + chip('Sin dato', m.riesgo.sinDato, '#F1F5F9', '#475569') + '</div>' +
            '</div>';
    }

    function asegurarTarjetas() {
        var fin = document.getElementById('card-flujo-financiero');
        if (!fin || !fin.parentElement) return null;
        var fila = fin.parentElement;
        var a = document.getElementById('ddf-card-financiero');
        var b = document.getElementById('ddf-card-avance');
        if (!a) {
            a = document.createElement('div'); a.id = 'ddf-card-financiero'; a.className = CARD_CLASS;
            a.style.cssText = 'border-top:3px solid #8B4A97;background:#FFFFFF;';
            b = document.createElement('div'); b.id = 'ddf-card-avance'; b.className = CARD_CLASS;
            b.style.cssText = 'border-top:3px solid #018D38;background:#FFFFFF;';
            fila.insertBefore(b, fila.firstChild);
            fila.insertBefore(a, fila.firstChild);
            // las tarjetas del código base quedan ocultas (siguen en el DOM para no romper su código)
            Array.prototype.forEach.call(fila.children, function (el) {
                if (el !== a && el !== b) el.style.display = 'none';
            });
        }
        return { fin: a, av: b };
    }

    function render() {
        try {
            var cards = asegurarTarjetas();
            if (!cards) return;
            var rows = (typeof filteredData !== 'undefined' && Array.isArray(filteredData)) ? filteredData : [];
            var m = calcular(rows);
            window.DDF_METRICAS = m;
            cards.fin.innerHTML = htmlFinanciero(m);
            cards.av.innerHTML = htmlAvance(m);

            // subregiones impactadas = subregiones reales nombradas en los contratos filtrados
            var subs = {};
            rows.forEach(function (row) {
                String(row['SUBREGIONES (DETALLE)'] || '').split(',').forEach(function (x) {
                    x = x.trim();
                    if (x && x !== 'VARIAS') subs[x] = 1;
                });
            });
            var elSubs = document.getElementById('kpi-subregiones');
            if (elSubs) elSubs.textContent = Object.keys(subs).length;
        } catch (e) { console.warn('[Personalización] render:', e); }
    }

    window.DDF_CALCULAR = calcular;

    // MULTIREGIONAL se conserva como valor válido de subregión (el código base solo acepta las 9 oficiales)
    if (typeof window.getCanonicalOfficialSubregion === 'function') {
        var subOriginal = window.getCanonicalOfficialSubregion;
        window.getCanonicalOfficialSubregion = function (s) {
            if (String(s || '').trim().toUpperCase() === 'MULTIREGIONAL') return 'MULTIREGIONAL';
            return subOriginal.apply(this, arguments);
        };
    }

    // se engancha a la actualización del código base
    if (typeof window.updateDashboard === 'function') {
        var original = window.updateDashboard;
        window.updateDashboard = function () {
            var out = original.apply(this, arguments);
            render();
            return out;
        };
    }

    // ------------------------------------------------------------ textos
    var REEMPLAZOS = [
        [/\bCONVENIOS\b/g, 'CONTRATOS'], [/\bConvenios\b/g, 'Contratos'], [/\bconvenios\b/g, 'contratos'],
        [/\bCONVENIO\b/g, 'CONTRATO'], [/\bConvenio\b/g, 'Contrato'], [/\bconvenio\b/g, 'contrato'],
        [/\bCONVENIENTE\b/g, 'CONTRATISTA'], [/\bConveniente\b/g, 'Contratista'],
        [/\bCONVENIANTE EJECUTOR\b/g, 'CONTRATISTA'], [/\bConveniante ejecutor\b/gi, 'Contratista'],
        [/Inversión por Subregión/g, 'Valor total por subregión'],
        [/Aporte departamental por zona/g, 'Valor total de contratos por zona'],
        [/\bDIAT\b/g, 'Desarrollo Físico']
    ];
    var SALTAR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1 };

    function reemplazarTexto(nodo) {
        if (nodo.nodeType === 3) {
            var t = nodo.nodeValue, n = t;
            if (!t || !/[CcDIA]/.test(t)) return;
            for (var i = 0; i < REEMPLAZOS.length; i++) n = n.replace(REEMPLAZOS[i][0], REEMPLAZOS[i][1]);
            if (n !== t) nodo.nodeValue = n;
            return;
        }
        if (nodo.nodeType !== 1 || SALTAR[nodo.nodeName]) return;
        if (nodo.hasAttribute && nodo.hasAttribute('placeholder')) {
            var ph = nodo.getAttribute('placeholder'), nph = ph;
            for (var j = 0; j < REEMPLAZOS.length; j++) nph = nph.replace(REEMPLAZOS[j][0], REEMPLAZOS[j][1]);
            if (nph !== ph) nodo.setAttribute('placeholder', nph);
        }
        for (var c = nodo.firstChild; c; c = c.nextSibling) reemplazarTexto(c);
    }

    function ocultarHeredados() {
        var css = document.createElement('style');
        css.textContent =
            '#diat-ai-fab-container{display:none!important}' +
            '.tab-btn[data-tab="visitas"],.tab-btn[data-tab="portal"]{display:none!important}';
        document.head.appendChild(css);
    }

    function iniciar() {
        ocultarHeredados();
        reemplazarTexto(document.body);
        var obs = new MutationObserver(function (lista) {
            lista.forEach(function (mu) {
                if (mu.type === 'characterData') reemplazarTexto(mu.target);
                else mu.addedNodes.forEach(reemplazarTexto);
            });
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();

/* ------------------------------------------------------------------------------------------
 * Ficha técnica en PDF (generateProfessionalPDF del código base).
 * El código base trae valores por defecto inventados: municipio "FREDONIA" cuando no hay
 * municipio y "700 m" de alcance cuando no hay longitudes. Aquí se neutralizan, se corrige
 * el conteo de tramos y se ajustan las etiquetas institucionales. No se alteran los datos.
 * ---------------------------------------------------------------------------------------- */
(function () {
    'use strict';
    var ctx = null;

    var ETIQUETAS = [
        [/^DIRECCIÓN DE INFRAESTRUCTURA Y APOYO TERRITORIAL$/, 'DIRECCIÓN DE DESARROLLO FÍSICO'],
        [/^FICHA TÉCNICA DE CONVENIO$/, 'FICHA TÉCNICA DE CONTRATO'],
        [/^CONVENIANTE EJECUTOR$/, 'CONTRATISTA']
    ];

    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

    function sinAlcance(row) {
        try {
            return !(num(getRowLongitudEjecutada(row)) > 0 || num(getRowAreaEjecutada(row)) > 0 ||
                num(getRowLongitudContratada(row)) > 0);
        } catch (e) { return false; }
    }

    function corregirTexto(s) {
        if (!ctx || typeof s !== 'string' || s.length > 80 || ctx.valores[s]) return s;
        for (var i = 0; i < ETIQUETAS.length; i++) if (ETIQUETAS[i][0].test(s)) return ETIQUETAS[i][1];
        if (ctx.sinAlcance && s === '700 m') return 'Sin dato';
        if (ctx.sinMunicipio) {
            if (s === 'FREDONIA') return 'NO INDICADO';
            if (/^[A-ZÁÉÍÓÚÑ ]+ · ANTIOQUIA$/.test(s)) return (ctx.subregion || 'SUBREGIÓN NO INDICADA') + ' · ANTIOQUIA';
            if (s.indexOf('FREDONIA') !== -1) return s.replace(/FREDONIA/g, 'NO INDICADO');
        }
        return s;
    }

    function recorrer(n, prof) {
        if (!n || prof > 60) return n;
        if (typeof n === 'string') return corregirTexto(n);
        if (Array.isArray(n)) { for (var i = 0; i < n.length; i++) n[i] = recorrer(n[i], prof + 1); return n; }
        if (typeof n === 'object') {
            for (var k in n) {
                if (!Object.prototype.hasOwnProperty.call(n, k) || k === 'svg' || k === 'image') continue;
                if (k === 'text' || typeof n[k] === 'object') n[k] = recorrer(n[k], prof + 1);
            }
        }
        return n;
    }

    function instalarPdf() {
        if (typeof window.generateProfessionalPDF !== 'function' || window.generateProfessionalPDF.__ddf) return false;
        var original = window.generateProfessionalPDF;
        var envuelto = async function (row) {
            var valores = {};
            if (row) Object.keys(row).forEach(function (k) { if (typeof row[k] === 'string') valores[row[k]] = true; });
            ctx = {
                row: row,
                valores: valores,
                sinMunicipio: !String((row && row['MUNICIPIO']) || '').trim(),
                sinAlcance: sinAlcance(row || {}),
                subregion: String((row && row['SUBREGION']) || '').toUpperCase()
            };
            envolverPdfMake();
            try { return await original.apply(this, arguments); }
            finally { ctx = null; }
        };
        envuelto.__ddf = true;
        window.generateProfessionalPDF = envuelto;

        // Sin municipio no se dibujan mapas centrados en un municipio por defecto
        ['generateAntioquiaSVG', 'generateMunicipalSVG'].forEach(function (nombre) {
            var f = window[nombre];
            if (typeof f !== 'function') return;
            window[nombre] = async function (muni, row) {
                if (ctx && ctx.sinMunicipio) return nombre === 'generateMunicipalSVG' ? { svgString: null, featuresCount: 0 } : null;
                var r = await f.apply(this, arguments);
                // "N tramos": se cuentan solo las líneas del trazado, no los puntos (fotos, extremos)
                if (nombre === 'generateMunicipalSVG' && r && row && typeof loadMapData === 'function') {
                    try {
                        var md = await loadMapData(String(row['CONVENIO']).trim());
                        if (md && md.type === 'kml') {
                            var lineas = (String(md.data).match(/<LineString/g) || []).length;
                            if (lineas > 0) r.featuresCount = lineas;
                        }
                    } catch (e) { /* noop */ }
                }
                return r;
            };
        });

        envolverPdfMake();
        return true;
    }

    function envolverPdfMake() {
        if (window.pdfMake && typeof pdfMake.createPdf === 'function' && !pdfMake.createPdf.__ddf) {
            var crear = pdfMake.createPdf;
            pdfMake.createPdf = function (doc) {
                if (ctx && doc) {
                    try { recorrer(doc.content, 0); recorrer(doc.header, 0); recorrer(doc.footer, 0); }
                    catch (e) { console.warn('[Personalización] PDF:', e); }
                }
                var pdf = crear.apply(this, arguments);
                if (ctx && pdf && typeof pdf.download === 'function') {
                    var descargar = pdf.download;
                    pdf.download = function (nombre) {
                        if (typeof nombre === 'string') arguments[0] = nombre.replace('Ficha_Tecnica_Convenio_', 'Ficha_Tecnica_Contrato_');
                        return descargar.apply(this, arguments);
                    };
                }
                return pdf;
            };
            pdfMake.createPdf.__ddf = true;
        }
    }

    if (!instalarPdf()) {
        var intentos = 0;
        var t = setInterval(function () { if (instalarPdf() || ++intentos > 40) clearInterval(t); }, 250);
    }
})();

/* ------------------------------------------------------------------------------------------
 * Ficha del contrato (modal): panel "Seguimiento del contrato".
 * 1) Muestra las columnas propias del informe de contratos que el código base no conoce
 *    (avance programado, retraso, riesgo, actividades, pendientes, observaciones por área...).
 * 2) Muestra la información complementaria de las columnas adicionales de la misma fila
 *    (proyecto, interventoría, avance mensual, actas, presupuesto, PMA, personal y fuentes).
 * ---------------------------------------------------------------------------------------- */
(function () {
    'use strict';

    var AREAS = [
        ['OBSERVACIONES TECNICAS', 'Técnicas'],
        ['OBSERVACIONES ADMINISTRATIVAS/JURIDICAS/FINANCIERAS', 'Administrativas, jurídicas y financieras'],
        ['OBSERVACIONES REGALIAS', 'Regalías'],
        ['OBSERVACIONES AMBIENTAL', 'Ambientales'],
        ['OBSERVACIONES SOCIAL', 'Sociales'],
        ['OBSERVACIONES PREDIAL', 'Prediales'],
        ['OBSERVACIONES', 'Generales']
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function campo(row, nombre) {
        var U = window.DDF_UTIL;
        if (!U) return row[nombre];
        var k = U.buscarClave(Object.keys(row), nombre);
        return k === undefined ? undefined : row[k];
    }
    function vacio(v) {
        var s = String(v == null ? '' : v).trim();
        return s === '' || s === 'N/A' || s.charAt(0) === '#';
    }
    function pct(v) {
        if (vacio(v)) return null;
        if (typeof v === 'number') return Math.abs(v) <= 1.5 ? v * 100 : v;
        var s = String(v).replace('%', '').replace(/\s/g, '');
        if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
        var n = parseFloat(s);
        if (!isFinite(n)) return null;
        return String(v).indexOf('%') === -1 && Math.abs(n) <= 1.5 ? n * 100 : n;
    }
    function fmtPct(n) { return n == null ? 'Sin dato' : n.toLocaleString('es-CO', { maximumFractionDigits: 2 }) + '%'; }
    function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('es-CO'); }
    function fecha(v) {
        if (vacio(v)) return 'Sin dato';
        if (typeof v === 'number' && v > 20000 && v < 80000) {
            var d = new Date(Math.round((v - 25569) * 86400000));
            return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear();
        }
        if (v instanceof Date) return v.toLocaleDateString('es-CO');
        var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
        if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
        return String(v).trim();
    }
    function texto(v) { return esc(String(v).trim()).replace(/\n/g, '<br>'); }

    var CSS = '#ddf-seguimiento{margin-top:20px;background:#fff;border:1.5px solid #E2E8F0;border-radius:14px;padding:20px;font-family:inherit;color:#0F172A}' +
        '#ddf-seguimiento h4{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin:0 0 14px;display:flex;align-items:center;gap:8px}' +
        '#ddf-seguimiento h5{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0B5640;margin:18px 0 8px}' +
        '#ddf-seguimiento .ddf-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}' +
        '#ddf-seguimiento .ddf-k{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px}' +
        '#ddf-seguimiento .ddf-k span{display:block;font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em}' +
        '#ddf-seguimiento .ddf-k b{display:block;font-size:15px;font-weight:900;margin-top:3px}' +
        '#ddf-seguimiento .ddf-box{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;font-size:11.5px;line-height:1.6}' +
        '#ddf-seguimiento .ddf-obs{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}' +
        '#ddf-seguimiento .ddf-obs b{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin-bottom:4px}' +
        '#ddf-seguimiento table{width:100%;border-collapse:collapse;font-size:11.5px}' +
        '#ddf-seguimiento td,#ddf-seguimiento th{padding:6px 8px;border-bottom:1px solid #EEF2F6;text-align:left;vertical-align:top}' +
        '#ddf-seguimiento th{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#64748B}' +
        '#ddf-seguimiento td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
        '#ddf-seguimiento .ddf-bar{height:7px;background:#E2E8F0;border-radius:4px;overflow:hidden;min-width:60px}' +
        '#ddf-seguimiento .ddf-bar i{display:block;height:100%;background:#0B5640;border-radius:4px}' +
        '#ddf-seguimiento .ddf-f{font-size:10px;color:#94A3B8;margin-top:6px;font-style:italic}' +
        '#ddf-seguimiento .ddf-nota{font-size:10.5px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:6px 10px;margin-top:8px}' +
        '#ddf-seguimiento .ddf-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}';

    function kpi(etq, val, color) {
        return '<div class="ddf-k"><span>' + esc(etq) + '</span><b' + (color ? ' style="color:' + color + '"' : '') + '>' + esc(val) + '</b></div>';
    }
    function fuente(f) { return f ? '<div class="ddf-f">Fuente: ' + esc(f) + '</div>' : ''; }
    function tablaDatos(lista) {
        return '<table>' + lista.map(function (p) {
            return '<tr><th style="width:34%">' + esc(p[0]) + '</th><td>' + esc(p[1]) + '</td></tr>';
        }).join('') + '</table>';
    }

    function seccionInforme(row) {
        var fr = pct(campo(row, 'EJECUCION FISICA REAL (REPORTADA)'));
        var fp = pct(campo(row, 'EJECUCION FISICA PROGRAMADA'));
        var re = pct(campo(row, '% DE RETRASO'));
        var fin = pct(campo(row, 'EJECUCION FINANCIERA REAL'));
        var finr = pct(campo(row, 'EJECUCIÓN FINANCIERA REPORTADA'));
        var riesgo = campo(row, 'RIESGO');
        var colRe = re == null ? null : (re <= -10 ? '#B91C1C' : (re <= -5 ? '#B45309' : '#0B5640'));
        var html = '<div class="ddf-g">' +
            kpi('Física real (reportada)', fmtPct(fr), '#0B5640') +
            kpi('Física programada', fmtPct(fp)) +
            kpi('% de retraso', re == null ? 'Sin dato' : (re > 0 ? '+' : '') + fmtPct(re), colRe) +
            kpi('Financiera real', fmtPct(fin), '#2563EB') +
            kpi('Financiera reportada', fmtPct(finr)) +
            kpi('Riesgo', vacio(riesgo) ? 'Sin dato' : String(riesgo).trim()) +
            kpi('Último informe publicado', fecha(campo(row, 'FECHA ULTIMO INFORME PUBLICADO'))) +
            kpi('Plazo inicial / total', (vacio(campo(row, 'PLAZO INICIAL (MESES)')) ? '—' : String(campo(row, 'PLAZO INICIAL (MESES)')).trim()) +
                ' / ' + (vacio(campo(row, 'PLAZO TOTAL (MESES)')) ? '—' : String(campo(row, 'PLAZO TOTAL (MESES)')).trim()) + ' meses') +
            '</div>';
        var emp = campo(row, 'EMPRESAS QUE CONFORMAN EL CONTRATISTA');
        if (!vacio(emp)) html += '<h5>Empresas que conforman el contratista</h5><div class="ddf-box">' + texto(emp) + '</div>';
        var act = campo(row, 'ACTIVIDADES EN EJECUCIÓN'), pen = campo(row, 'PENDIENTES');
        if (!vacio(act) || !vacio(pen)) {
            html += '<div class="ddf-obs" style="margin-top:14px">';
            if (!vacio(act)) html += '<div class="ddf-box"><b>Actividades en ejecución</b>' + texto(act) + '</div>';
            if (!vacio(pen)) html += '<div class="ddf-box"><b>Pendientes</b>' + texto(pen) + '</div>';
            html += '</div>';
        }
        var obs = AREAS.filter(function (a) { return !vacio(campo(row, a[0])); });
        html += '<h5>Observaciones por área</h5>';
        html += obs.length ? '<div class="ddf-obs">' + obs.map(function (a) {
            return '<div class="ddf-box"><b>' + esc(a[1]) + '</b>' + texto(campo(row, a[0])) + '</div>';
        }).join('') + '</div>' : '<div class="ddf-box" style="color:#64748B">El informe no registra observaciones para este contrato.</div>';
        return html + fuente('Informe de contratos (BASE_DASHBOARD)');
    }

    // ---- Información complementaria: columnas adicionales de la misma fila del informe
    var PROYECTO = ['MUNICIPIO', 'VÍA', 'CÓDIGO VÍA', 'TIPO DE VÍA', 'LONGITUD TOTAL VÍA (km)', 'ABSCISA INICIO', 'ABSCISA FIN',
        'LONGITUD INTERVENIDA (m)', 'COORDENADAS INICIO (MAGNA-SIRGAS ORIGEN NACIONAL)', 'COORDENADAS FIN (MAGNA-SIRGAS ORIGEN NACIONAL)',
        'ESTRUCTURA DE PAVIMENTO', 'DRENAJE', 'CONTENCIÓN', 'POBLACIÓN BENEFICIARIA', 'PLAZO SEGÚN ESTUDIOS'];
    var PARTES = ['INTEGRANTES CONTRATISTA', 'A.I.U.', 'INTERVENTORÍA', 'CONTRATO INTERVENTORÍA', 'INTEGRANTES INTERVENTORÍA'];
    var PERSONAL = ['PERSONAL VINCULADO (ACUMULADO)', 'PERSONAL ACTIVO', 'ACCIDENTES EN EL MES', 'DÍAS DE INCAPACIDAD',
        'COMITÉS DE OBRA (ACUMULADO)', 'INFORMES SEMANALES (ACUMULADO)'];

    function num(v) {
        if (typeof v === 'number') return v;
        var s = String(v == null ? '' : v).replace(/[$\s]/g, '');
        if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
        var n = parseFloat(s);
        return isFinite(n) ? n : null;
    }
    function lineas(v) {
        if (vacio(v)) return [];
        return String(v).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)
            .map(function (l) { return l.split(';').map(function (p) { return p.trim(); }); });
    }
    function valor(nombre, v) {
        if (/A\.I\.U|%/.test(nombre)) return fmtPct(pct(v));
        if (/CONTRATO/.test(nombre)) return String(v).trim();
        if (typeof v === 'number') return v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
        return String(v).trim();
    }
    function tablaCampos(row, lista) {
        var filas = lista.filter(function (c) { return !vacio(campo(row, c)); });
        if (!filas.length) return '';
        return '<table>' + filas.map(function (c) {
            return '<tr><th style="width:38%">' + esc(c) + '</th><td>' + esc(valor(c, campo(row, c))) + '</td></tr>';
        }).join('') + '</table>';
    }

    function seccionComplementaria(row) {
        var html = '';
        var tp = tablaCampos(row, PROYECTO), tc = tablaCampos(row, PARTES);
        if (tp || tc) {
            html += '<div class="ddf-2">';
            if (tp) html += '<div><h5>Proyecto</h5>' + tp + '</div>';
            if (tc) html += '<div><h5>Contratista e interventoría</h5>' + tc + '</div>';
            html += '</div>';
        }
        var av = lineas(campo(row, 'AVANCE MENSUAL (FECHA CORTE; % FÍSICO; % RECURSOS)'));
        var ac = lineas(campo(row, 'ACTAS DE PAGO (ACTA; FECHA; VALOR)'));
        if (av.length || ac.length) {
            html += '<div class="ddf-2">';
            if (av.length) {
                var ult = av[av.length - 1], fr = pct(campo(row, 'EJECUCION FISICA REAL (REPORTADA)')), fu = pct(ult[1]);
                html += '<div><h5>Avance mensual</h5><table><tr><th>Corte</th><th>Física</th><th></th><th>Recursos</th><th></th></tr>' +
                    av.map(function (p) {
                        var f = pct(p[1]) || 0, r = pct(p[2]) || 0;
                        return '<tr><td>' + esc(fecha(p[0])) + '</td><td class="n">' + fmtPct(pct(p[1])) + '</td><td><div class="ddf-bar"><i style="width:' + Math.min(100, f) + '%"></i></div></td>' +
                            '<td class="n">' + fmtPct(pct(p[2])) + '</td><td><div class="ddf-bar"><i style="width:' + Math.min(100, r) + '%;background:#2563EB"></i></div></td></tr>';
                    }).join('') + '</table>' +
                    (fr != null && fu != null && Math.abs(fr - fu) > 0.005 ? '<div class="ddf-nota">La columna de ejecución física real reporta ' + fmtPct(fr) +
                        '; el último corte mensual (' + esc(fecha(ult[0])) + ') reporta ' + fmtPct(fu) + '.</div>' : '') + '</div>';
            }
            if (ac.length) {
                var tot = 0;
                html += '<div><h5>Actas de pago</h5><table><tr><th>Acta</th><th>Fecha</th><th style="text-align:right">Valor</th></tr>' +
                    ac.map(function (a) { var v = num(a[2]) || 0; tot += v; return '<tr><td>' + esc(a[0]) + '</td><td>' + esc(fecha(a[1])) + '</td><td class="n">' + fmtMoney(v) + '</td></tr>'; }).join('') +
                    '<tr><th colspan="2">Total actas</th><td class="n"><b>' + fmtMoney(tot) + '</b></td></tr></table>';
                var pag = num(campo(row, 'RECURSO PAGADO'));
                if (pag != null) html += '<div class="ddf-nota">Recurso pagado según el informe: ' + fmtMoney(pag) + '.</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        var pr = lineas(campo(row, 'PRESUPUESTO POR PRODUCTO (PRODUCTO; VALOR)'));
        if (pr.length) {
            var items = pr.map(function (p) { return [p[0], num(p[1]) || 0]; }).sort(function (a, b) { return b[1] - a[1]; });
            var total = items.reduce(function (a, i) { return a + i[1]; }, 0), max = items[0][1] || 1;
            var vt = num(campo(row, 'VALOR TOTAL INCLUIDAS ADICIONES'));
            html += '<h5>Presupuesto por producto · ' + fmtMoney(total) + '</h5><table>' +
                items.map(function (i) {
                    return '<tr><td style="width:34%">' + esc(i[0]) + '</td><td><div class="ddf-bar"><i style="width:' + (i[1] / max * 100).toFixed(1) + '%"></i></div></td>' +
                        '<td class="n">' + fmtMoney(i[1]) + '</td><td class="n" style="color:#64748B">' + (total ? (i[1] / total * 100).toFixed(1) : '0') + '%</td></tr>';
                }).join('') + '</table>' +
                (vt != null && Math.abs(vt - total) > 1 ? '<div class="ddf-nota">La suma de productos (' + fmtMoney(total) + ') no coincide con el valor total del contrato (' + fmtMoney(vt) + ').</div>' : '');
        }
        var pp = num(campo(row, 'PMA VALOR PROGRAMADO')), pe = num(campo(row, 'PMA VALOR EJECUTADO'));
        var hayPersonal = PERSONAL.some(function (c) { return !vacio(campo(row, c)); });
        if (pp != null || hayPersonal) {
            html += '<div class="ddf-2">';
            if (pp != null) {
                html += '<div><h5>PMA (ambiental, social y SST)</h5><div class="ddf-g">' + kpi('Programado', fmtMoney(pp)) +
                    (pe != null ? kpi('Ejecutado', fmtMoney(pe), '#0B5640') + kpi('Ejecución', fmtPct(pp ? pe / pp * 100 : null)) : '') + '</div></div>';
            }
            if (hayPersonal) {
                var fc = campo(row, 'FECHA CORTE PERSONAL');
                html += '<div><h5>Personal y seguridad' + (vacio(fc) ? '' : ' · corte ' + esc(fecha(fc))) + '</h5><div class="ddf-g">' +
                    PERSONAL.filter(function (c) { return !vacio(campo(row, c)); }).map(function (c) {
                        return kpi(c.charAt(0) + c.slice(1).toLowerCase(), valor(c, campo(row, c)));
                    }).join('') + '</div></div>';
            }
            html += '</div>';
        }
        var fu2 = campo(row, 'FUENTES INFORMACIÓN COMPLEMENTARIA');
        if (!vacio(fu2)) html += '<h5>Fuentes de la información complementaria</h5><div class="ddf-box" style="font-size:10.5px;color:#475569">' + texto(fu2) + '</div>';
        return html;
    }

    function render(row) {
        var visitas = document.getElementById('modal-detalle-visitas-list');
        var tarjeta = visitas && visitas.closest('.bg-white');
        var grid = tarjeta && tarjeta.parentElement && tarjeta.parentElement.parentElement;
        if (!grid) return;
        if (tarjeta) tarjeta.style.display = 'none'; // control de visitas deshabilitado
        if (!document.getElementById('ddf-seguimiento-css')) {
            var st = document.createElement('style'); st.id = 'ddf-seguimiento-css'; st.textContent = CSS;
            document.head.appendChild(st);
        }
        var sec = document.getElementById('ddf-seguimiento');
        if (!sec) {
            sec = document.createElement('div'); sec.id = 'ddf-seguimiento';
            grid.insertAdjacentElement('afterend', sec);
        }
        sec.innerHTML = '<h4><i class="fa-solid fa-clipboard-list" style="color:#0B5640"></i> Seguimiento del contrato</h4>' +
            seccionInforme(row) + seccionComplementaria(row);

        // El recuadro "Observaciones Técnicas" del código base muestra la columna OBSERVACIONES
        var ot = campo(row, 'OBSERVACIONES TECNICAS');
        var el = document.getElementById('mod-observaciones');
        if (el && !vacio(ot)) el.innerHTML = texto(ot);
    }

    function instalarFicha() {
        if (typeof window.openModal !== 'function' || window.openModal.__ddf) return false;
        var original = window.openModal;
        var envuelto = function (row) {
            var r = original.apply(this, arguments);
            try { if (row) render(row); } catch (e) { console.warn('[Personalización] ficha:', e); }
            return r;
        };
        envuelto.__ddf = true;
        window.openModal = envuelto;
        return true;
    }

    if (!instalarFicha()) {
        var intentos = 0;
        var t = setInterval(function () { if (instalarFicha() || ++intentos > 40) clearInterval(t); }, 250);
    }
})();
