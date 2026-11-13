/**
 * adaptador.js — Dashboard Dirección de Desarrollo Físico
 * Capa de adaptación sobre el código base de DIAT. No modifica los datos del Sheet:
 *  1) Redirige las lecturas al Google Sheet propio (BASE_DASHBOARD).
 *  2) Desconecta los servicios del proyecto original (Supabase y Apps Script de DIAT).
 *  3) Crea, solo en memoria, campos con los nombres que espera el código de DIAT a partir
 *     de las columnas del informe de contratos. Las columnas originales se conservan intactas.
 *  4) Normaliza en memoria SUBREGIÓN y TIPO, e identifica contratos derivados.
 * Debe cargarse DESPUÉS de xlsx y supabase-js, y ANTES de diat_service.js y script.js.
 */
(function () {
    'use strict';

    var CFG = window.DASH_CONFIG = Object.assign({
        SHEET_ID: '1j9jAtFU-M3NiO5HbmFF2wpaO-Ak9byM1hEnWk-4vDvE', // BASE_DASHBOARD
        GID: '',                 // vacío = primera pestaña
        APPS_SCRIPT_URL: ''      // pendiente: URL /exec del Apps Script propio (fotos y KMZ)
    }, window.DASH_CONFIG || {});

    var OLD_SHEET = '13c4V84sj_T1ZQxoq_HLqNHxUUXINzvZJeKWVgK_H55Q';
    var OLD_SUPABASE = 'wjkqnwgoppgzphjtymdo.supabase.co';
    var OLD_SCRIPT_RE = /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/;

    function sheetUrl() {
        return 'https://docs.google.com/spreadsheets/d/' + CFG.SHEET_ID + '/export?format=xlsx' +
            (CFG.GID !== '' ? '&gid=' + CFG.GID : '') + '&t=' + Date.now();
    }

    // ---------------------------------------------------------------- 1 y 2: red
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
        if (url.indexOf(OLD_SUPABASE) !== -1) {
            return Promise.reject(new TypeError('[Adaptador] Supabase del proyecto original deshabilitado'));
        }
        if (url.indexOf(OLD_SHEET) !== -1) {
            return nativeFetch(sheetUrl(), init);
        }
        if (OLD_SCRIPT_RE.test(url)) {
            if (!CFG.APPS_SCRIPT_URL) {
                return Promise.reject(new TypeError('[Adaptador] Apps Script propio aún no configurado'));
            }
            return nativeFetch(url.replace(OLD_SCRIPT_RE, CFG.APPS_SCRIPT_URL), init);
        }
        return nativeFetch(input, init);
    };
    // Sin cliente Supabase el código base trabaja en modo local
    try { window.supabase = undefined; } catch (e) { /* noop */ }

    // ---------------------------------------------------------------- utilidades
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toUpperCase().replace(/\s+/g, ' ').trim();
    }

    // ---------------------------------------------------------------- 4: normalizaciones
    var SUBREGIONES = [
        ['BAJO CAUCA', /BAJO\s*C+AUCA/],
        ['MAGDALENA MEDIO', /MAGDALENA\s*MEDIO/],
        ['NORDESTE', /NORDESTE/],
        ['NORTE', /NORTE(?!\s*DE)/],
        ['OCCIDENTE', /OCCIDENTE/],
        ['ORIENTE', /ORIENTE/],
        ['SUROESTE', /SUROESTE/],
        ['URABÁ', /URABA/],
        ['VALLE DE ABURRÁ', /VALLE\s*DE\s*ABURRA/]
    ];

    // Devuelve { principal, detalle } sin alterar el valor original de la celda
    function normalizarSubregion(valor) {
        var s = norm(valor);
        if (!s) return { principal: '', detalle: '' };
        if (/\bVARIAS\b/.test(s)) return { principal: 'MULTIREGIONAL', detalle: 'VARIAS' };
        var halladas = [];
        // NORDESTE contiene "NORTE" solo como texto distinto; se busca primero y se retira
        var resto = s;
        SUBREGIONES.forEach(function (par) {
            if (par[1].test(resto)) {
                halladas.push(par[0]);
                resto = resto.replace(par[1], ' ');
            }
        });
        if (halladas.length === 1) return { principal: halladas[0], detalle: halladas[0] };
        if (halladas.length > 1) return { principal: 'MULTIREGIONAL', detalle: halladas.join(', ') };
        return { principal: String(valor).trim().toUpperCase(), detalle: String(valor).trim().toUpperCase() };
    }

    function normalizarTipo(valor) {
        var s = norm(valor);
        var mapa = { 'INTERVENTORIA': 'INTERVENTORÍA', 'CONSULTORIA': 'CONSULTORÍA' };
        return mapa[s] || String(valor == null ? '' : valor).trim().toUpperCase();
    }

    // CONTRATO N° → número, si es derivado y de cuál (solo si el texto lo dice)
    function analizarContrato(valor) {
        var txt = String(valor == null ? '' : valor);
        var unaLinea = txt.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
        var m = unaLinea.match(/^([0-9A-Z]+)/i);
        var numero = m ? m[1].toUpperCase() : unaLinea;
        var esDerivado = /DERIVADO/i.test(unaLinea);
        var padre = '';
        var p = unaLinea.match(/DERIVADO\s*DE\s*([0-9A-Z]+)/i);
        if (p) padre = p[1].toUpperCase();
        return { texto: unaLinea, numero: numero, derivado: esDerivado, padre: padre };
    }

    // ---------------------------------------------------------------- 3: columnas
    // nombre que espera DIAT  <-  encabezado del informe de contratos
    var ALIAS = [
        ['ESTADO CONVENIO', 'ESTADO'],
        ['CLASIFICACIÓN', 'FUENTE DE FINANCIACIÓN'],
        ['CONVENIANTE EJECUTOR', 'CONTRATISTA'],
        ['OBJETO', 'OBJETO CONTRATO'],
        ['FECHA DE SUSCRIPCIÓN', 'FECHA DE SUSCRIPCIÓN DEL CONTRATO'],
        ['FECHA DE ACTA DE INICIO', 'FECHA INICIO'],
        ['FECHA DE TERMINACIÓN', 'FECHA PLAZO CONTRATO'],
        ['NUEVA FECHA DE TERMINACIÓN', 'FECHA FINAL ACTUALIZADA'],
        ['% EJECUCIÓN FÍSICA', 'EJECUCION FISICA REAL (REPORTADA)'],
        ['% EJECUCIÓN FINANCIERA', 'EJECUCION FINANCIERA REAL'],
        // Financiero: las cajas del código base se reetiquetan en pantalla (personalizacion.js)
        ['VALOR TOTAL', 'VALOR TOTAL INCLUIDAS ADICIONES'],
        ['VALOR TOTAL CON ADICIONES', 'VALOR TOTAL INCLUIDAS ADICIONES'],
        ['APORTE DEPARTAMENTO', 'VALOR TOTAL INCLUIDAS ADICIONES'],          // se muestra como "Valor total"
        ['VALOR TOTAL AUTORIZADO DEPARTAMENTO', 'RECURSO EJECUTADO'],        // se muestra como "Ejecutado"
        ['VALOR TOTAL DESEMBOLSADO', 'RECURSO PAGADO']                       // se muestra como "Pagado"
    ];

    function esInformeContratos(headers) {
        return headers.map(norm).indexOf(norm('CONTRATO N°')) !== -1;
    }

    function encabezados(ws) {
        if (!ws || !ws['!ref'] || typeof XLSX === 'undefined') return [];
        var r = XLSX.utils.decode_range(ws['!ref']);
        var out = [];
        for (var c = r.s.c; c <= r.e.c; c++) {
            var cell = ws[XLSX.utils.encode_cell({ r: r.s.r, c: c })];
            out.push(cell ? String(cell.v) : '');
        }
        return out;
    }

    function buscarClave(keys, nombre) {
        var n = norm(nombre);
        for (var i = 0; i < keys.length; i++) if (norm(keys[i]) === n) return keys[i];
        return undefined;
    }

    function instalar() {
        if (typeof XLSX === 'undefined' || !XLSX.utils || XLSX.__adaptado) return false;
        XLSX.__adaptado = true;

        // Evita que el código base reescriba la columna G como "MUNICIPIO" cuando el
        // informe no trae esa columna: se agrega una columna vacía MUNICIPIO al final (solo en memoria).
        var nativeRead = XLSX.read;
        XLSX.read = function () {
            var wb = nativeRead.apply(this, arguments);
            try {
                (wb.SheetNames || []).forEach(function (name) {
                    var ws = wb.Sheets[name];
                    var h = encabezados(ws);
                    if (!esInformeContratos(h)) return;
                    if (h.some(function (x) { return norm(x).indexOf('MUNICIPIO') === 0; })) return;
                    var r = XLSX.utils.decode_range(ws['!ref']);
                    var c = r.e.c + 1;
                    ws[XLSX.utils.encode_cell({ r: r.s.r, c: c })] = { t: 's', v: 'MUNICIPIO', w: 'MUNICIPIO' };
                    r.e.c = c;
                    ws['!ref'] = XLSX.utils.encode_range(r);
                });
            } catch (e) { console.warn('[Adaptador] read:', e); }
            return wb;
        };

        var nativeToJson = XLSX.utils.sheet_to_json;
        XLSX.utils.sheet_to_json = function (ws, opts) {
            var rows = nativeToJson.apply(this, arguments);
            try {
                if (!Array.isArray(rows) || !rows.length || Array.isArray(rows[0])) return rows;
                if (!esInformeContratos(encabezados(ws))) return rows;
                var kContrato = buscarClave(Object.keys(rows[0]), 'CONTRATO N°');
                rows = rows.filter(function (row) {
                    var k = kContrato || buscarClave(Object.keys(row), 'CONTRATO N°');
                    return k && String(row[k]).trim() !== '';
                });

                // números repetidos → se distinguen con el N° del informe
                var info = rows.map(function (row) {
                    return analizarContrato(row[kContrato || buscarClave(Object.keys(row), 'CONTRATO N°')]);
                });
                var cuenta = {};
                info.forEach(function (x) { cuenta[x.numero] = (cuenta[x.numero] || 0) + 1; });

                rows.forEach(function (row, i) {
                    var keys = Object.keys(row);
                    ALIAS.forEach(function (pair) {
                        var k = buscarClave(keys, pair[1]);
                        if (k !== undefined) row[pair[0]] = row[k];
                    });

                    var x = info[i];
                    var kN = buscarClave(keys, 'N°');
                    var nInforme = kN !== undefined ? String(row[kN]).trim() : String(i + 1);
                    row['CONVENIO'] = cuenta[x.numero] > 1 ? x.numero + ' · N° ' + nInforme : x.numero;
                    row['CONTRATO (TEXTO ORIGINAL)'] = x.texto;
                    row['DERIVADO'] = x.derivado ? 'SÍ' : 'NO';
                    row['DERIVADO DE'] = x.derivado ? (x.padre || 'No indicado') : '';

                    var kSub = buscarClave(keys, 'SUBREGIÓN');
                    var sub = normalizarSubregion(kSub !== undefined ? row[kSub] : '');
                    row['SUBREGION'] = sub.principal;
                    row['SUBREGIONES (DETALLE)'] = sub.detalle;

                    var kTipo = buscarClave(keys, 'TIPO');
                    row['INDICADOR'] = normalizarTipo(kTipo !== undefined ? row[kTipo] : '');
                });
            } catch (e) { console.warn('[Adaptador] sheet_to_json:', e); }
            return rows;
        };
        console.info('[Adaptador] Instalado. Fuente:', CFG.SHEET_ID);
        return true;
    }

    window.DDF_UTIL = { norm: norm, normalizarSubregion: normalizarSubregion, analizarContrato: analizarContrato, buscarClave: buscarClave };

    if (!instalar()) {
        document.addEventListener('DOMContentLoaded', instalar);
    }
})();
