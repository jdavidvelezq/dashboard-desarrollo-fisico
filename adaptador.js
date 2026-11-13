/**
 * adaptador.js — Dashboard Dirección de Desarrollo Físico
 * Capa de adaptación sobre el código base de DIAT. No modifica los datos:
 *  1) Redirige las lecturas al Google Sheet propio (BASE_DASHBOARD).
 *  2) Desconecta los servicios del proyecto original (Supabase y Apps Script de DIAT).
 *  3) Traduce, solo en memoria, los nombres de columna del informe de contratos
 *     a los nombres que espera el código de DIAT. Las columnas originales se conservan.
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

    // ---------------------------------------------------------------- 3: columnas
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toUpperCase().replace(/\s+/g, ' ').trim();
    }
    // nombre que espera DIAT  <-  encabezado del informe de contratos
    var ALIAS = [
        ['CONVENIO', 'CONTRATO N°'],
        ['ESTADO CONVENIO', 'ESTADO'],
        ['INDICADOR', 'TIPO'],
        ['CLASIFICACIÓN', 'FUENTE DE FINANCIACIÓN'],
        ['SUBREGION', 'SUBREGIÓN'],
        ['CONVENIANTE EJECUTOR', 'CONTRATISTA'],
        ['OBJETO', 'OBJETO CONTRATO'],
        ['FECHA DE SUSCRIPCIÓN', 'FECHA DE SUSCRIPCIÓN DEL CONTRATO'],
        ['FECHA DE ACTA DE INICIO', 'FECHA INICIO'],
        ['FECHA DE TERMINACIÓN', 'FECHA PLAZO CONTRATO'],
        ['NUEVA FECHA DE TERMINACIÓN', 'FECHA FINAL ACTUALIZADA'],
        ['% EJECUCIÓN FÍSICA', 'EJECUCION FISICA REAL (REPORTADA)'],
        ['% EJECUCIÓN FINANCIERA', 'EJECUCION FINANCIERA REAL'],
        ['VALOR TOTAL', 'VALOR TOTAL INCLUIDAS ADICIONES'],
        ['VALOR TOTAL CON ADICIONES', 'VALOR TOTAL INCLUIDAS ADICIONES'],
        ['VALOR TOTAL DESEMBOLSADO', 'RECURSO PAGADO']
    ];

    function esInformeContratos(headers) {
        var n = headers.map(norm);
        return n.indexOf('CONTRATO N°') !== -1 || n.indexOf(norm('CONTRATO N°')) !== -1;
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
                rows = rows.filter(function (row) {
                    var k = Object.keys(row).find(function (x) { return norm(x) === norm('CONTRATO N°'); });
                    return k && String(row[k]).trim() !== '';
                });
                rows.forEach(function (row) {
                    var keys = Object.keys(row);
                    ALIAS.forEach(function (pair) {
                        var destino = pair[0], origen = norm(pair[1]);
                        var k = keys.find(function (x) { return norm(x) === origen; });
                        if (k === undefined) return;
                        var v = row[k];
                        if (destino === 'CONVENIO') {
                            // misma información, en una sola línea, para usarla como identificador
                            v = String(v).replace(/\s*\n\s*/g, ' ').trim();
                        }
                        row[destino] = v;
                    });
                });
            } catch (e) { console.warn('[Adaptador] sheet_to_json:', e); }
            return rows;
        };
        console.info('[Adaptador] Instalado. Fuente:', CFG.SHEET_ID);
        return true;
    }

    if (!instalar()) {
        document.addEventListener('DOMContentLoaded', instalar);
    }
})();
