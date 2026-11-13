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
        } catch (e) { console.warn('[Personalización] render:', e); }
    }

    window.DDF_CALCULAR = calcular;

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
