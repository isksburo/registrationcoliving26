/*
 * ПАЛАТА №6 — общее ядро регистрации
 * ------------------------------------------------------------
 * Здесь живёт ВСЁ, что связано с реальными данными. Скины (registratura.html,
 * inyerface.html) только рисуют ад и дёргают этот API.
 *
 * ГЛАВНОЕ ПРАВИЛО: реальные данные сохраняются СРАЗУ и молча. Весь театр
 * (зависания, ошибки, глюки) — бутафория поверх уже сохранённой записи.
 *
 * Типичный поток скина:
 *   const id = Palata.Store.create({ skin: 'registratura' });   // как только знаем ФИО
 *   Palata.Store.update(id, { fio, attendee });                 // дописываем по шагам
 *   await Palata.Theater.freeze();                              // глюки — после сохранения
 *   Palata.Store.update(id, { amount, broughtEnvelope: true }); // финал
 */
(function (global) {
  'use strict';

  var KEY = 'palata6_registrations';

  // ---- утилиты --------------------------------------------------------------

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Защита от CSV-инъекций (формульных): поле, которое Excel/LibreOffice могут
  // принять за формулу, нейтрализуем ведущим апострофом.
  // SECURITY FIX: учитываем, что табличные процессоры обрезают ВЕДУЩИЕ пробельные
  // символы перед интерпретацией ячейки, поэтому " =1+1" или NBSP+"=…" — тоже вектор.
  // Проверяем триггерный символ после возможного ведущего whitespace, а не только
  // в самой первой позиции. Триггеры: = + - @ TAB CR LF (DDE/формулы).
  function csvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    // \s покрывает обычный пробел, TAB, CR, LF, NBSP( ) и пр. unicode-пробелы.
    if (/^[\s]*[=+\-@]/.test(s) || /^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
    if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatTs(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function uid() {
    return 'p6_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  // ---- хранилище ------------------------------------------------------------

  function readRaw() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error('[Palata] не смог прочитать localStorage:', e);
      return [];
    }
  }

  function writeRaw(arr) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.error('[Palata] не смог записать localStorage:', e);
      // Аварийный канал: если localStorage отвалился — кидаем дамп в консоль,
      // чтобы данные хотя бы можно было выковырять руками.
      console.warn('[Palata] АВАРИЙНЫЙ ДАМП:', JSON.stringify(arr));
      return false;
    }
  }

  var Store = {
    // Создаёт запись СРАЗУ и возвращает id. Дальше дополняем через update().
    create: function (initial) {
      var rec = Object.assign({
        id: uid(),
        ts: Date.now(),
        fio: '',
        attendee: '',        // 'self' | 'proxy'
        proxyFor: '',        // от кого доверенность
        broughtEnvelope: false,
        amount: null,        // заявленная сумма
        paid: false,         // подтверждает главбух руками в админке
        diagnosis: '',
        birthDate: '',
        symptoms: '',
        contact: '',
        skin: '',
        done: false          // дошёл ли до конца формы
      }, initial || {});
      var all = readRaw();
      all.push(rec);
      writeRaw(all);
      return rec.id;
    },

    update: function (id, patch) {
      var all = readRaw();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          Object.assign(all[i], patch);
          writeRaw(all);
          return all[i];
        }
      }
      return null;
    },

    get: function (id) {
      var all = readRaw();
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    },

    // Новые сверху.
    all: function () {
      return readRaw().slice().sort(function (a, b) { return b.ts - a.ts; });
    },

    count: function () { return readRaw().length; },

    remove: function (id) {
      var all = readRaw().filter(function (r) { return r.id !== id; });
      writeRaw(all);
    },

    clear: function () { writeRaw([]); },

    toCSV: function () {
      var cols = [
        ['ts', 'Время'],
        ['fio', 'ФИО'],
        ['attendee', 'Кто пришёл'],
        ['proxyFor', 'Доверенность от'],
        ['broughtEnvelope', 'Конверт принёс'],
        ['amount', 'Сумма (заявл.)'],
        ['paid', 'Оплачено (подтв.)'],
        ['diagnosis', 'Диагноз'],
        ['birthDate', 'Дата рождения'],
        ['symptoms', 'Симптомы'],
        ['contact', 'Контакт'],
        ['skin', 'Скин'],
        ['done', 'Дошёл до конца'],
        ['id', 'ID']
      ];
      var rows = readRaw().slice().sort(function (a, b) { return a.ts - b.ts; });
      var out = [cols.map(function (c) { return csvCell(c[1]); }).join(',')];
      rows.forEach(function (r) {
        out.push(cols.map(function (c) {
          var k = c[0], v = r[k];
          if (k === 'ts') v = formatTs(r.ts);
          else if (k === 'attendee') v = r.attendee === 'proxy' ? 'Доверенное лицо' : (r.attendee === 'self' ? 'Лично' : '');
          else if (k === 'broughtEnvelope' || k === 'paid' || k === 'done') v = v ? 'Да' : 'Нет';
          return csvCell(v);
        }).join(','));
      });
      return '﻿' + out.join('\r\n'); // BOM, чтобы Excel не калечил кириллицу
    },

    downloadCSV: function () {
      var blob = new Blob([Store.toCSV()], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'palata6_' + formatTs(Date.now()).replace(/[ :.]/g, '-') + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  };

  // ---- театр (бутафорские зависания и глюки) --------------------------------

  var DEFAULT_FREEZE_MSGS = [
    'Запрос отправлен в архив, ожидайте…',
    'Идёт согласование с заведующим отделением…',
    'Проверяем вашу медицинскую карту…',
    'Система думает. Не нажимайте ничего.',
    'Соединение с регистратурой… не разрывайте.',
    'Обрабатываем. Это нормально. Наверное.'
  ];

  function ensureOverlay() {
    var el = document.getElementById('palata-theater');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'palata-theater';
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999', 'display:none',
      'align-items:center', 'justify-content:center', 'flex-direction:column',
      'background:rgba(8,12,10,0.82)', 'color:#cfe8d8', 'font:16px/1.5 monospace',
      'text-align:center', 'padding:24px', 'gap:18px', 'cursor:wait',
      'backdrop-filter:blur(1px)'
    ].join(';');
    el.innerHTML =
      '<div class="p6-spin" style="width:46px;height:46px;border:5px solid #2c4a3a;border-top-color:#7fffb0;border-radius:50%;animation:p6spin 0.9s linear infinite"></div>' +
      '<div id="palata-theater-msg" style="max-width:420px"></div>';
    document.body.appendChild(el);
    if (!document.getElementById('palata-theater-style')) {
      var st = document.createElement('style');
      st.id = 'palata-theater-style';
      st.textContent = '@keyframes p6spin{to{transform:rotate(360deg)}}' +
        '@keyframes p6flick{0%,100%{opacity:1}50%{opacity:0.3}}';
      document.head.appendChild(st);
    }
    return el;
  }

  function rnd(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

  var Theater = {
    // Зависание на случайное время. По умолчанию 1.8–4.5с — «бесит, но проходимо».
    freeze: function (opts) {
      opts = opts || {};
      var min = opts.min != null ? opts.min : 1800;
      var max = opts.max != null ? opts.max : 4500;
      var msgs = opts.messages || DEFAULT_FREEZE_MSGS;
      var overlay = ensureOverlay();
      var msgEl = document.getElementById('palata-theater-msg');
      msgEl.textContent = msgs[rnd(0, msgs.length - 1)];
      overlay.style.display = 'flex';
      var ms = rnd(min, max);
      // Иногда меняем сообщение на середине — будто и правда что-то происходит.
      var swap = null;
      if (ms > 2600) {
        swap = setTimeout(function () { msgEl.textContent = msgs[rnd(0, msgs.length - 1)]; }, Math.floor(ms / 2));
      }
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (swap) clearTimeout(swap);
          overlay.style.display = 'none';
          resolve();
        }, ms);
      });
    },

    // Модалка-ошибка, которую надо закрыть руками. Resolves при закрытии.
    fakeError: function (message, btnLabel) {
      return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);font-family:monospace';
        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;color:#111;max-width:360px;width:86%;border:2px solid #c0392b;box-shadow:0 0 0 4px #fff,0 10px 40px rgba(0,0,0,0.5)';
        var head = document.createElement('div');
        head.style.cssText = 'background:#c0392b;color:#fff;padding:8px 12px;font-weight:bold;display:flex;justify-content:space-between;align-items:center';
        head.innerHTML = '<span>⚠ ОШИБКА</span><span style="opacity:.7">[×]</span>';
        var body = document.createElement('div');
        body.style.cssText = 'padding:18px 16px;font-size:14px;line-height:1.5';
        body.textContent = message || 'Произошла непредвиденная ошибка. Возможно.';
        var foot = document.createElement('div');
        foot.style.cssText = 'padding:0 16px 16px;text-align:right';
        var btn = document.createElement('button');
        btn.textContent = btnLabel || 'Ладно';
        btn.style.cssText = 'padding:6px 16px;font-family:monospace;cursor:pointer';
        foot.appendChild(btn);
        box.appendChild(head); box.appendChild(body); box.appendChild(foot);
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        function close() { document.body.removeChild(wrap); resolve(); }
        btn.addEventListener('click', close);
      });
    },

    // Кратковременный глитч-моргание элемента.
    flicker: function (el, ms) {
      if (!el) return;
      el.style.animation = 'p6flick 0.12s steps(2) ' + Math.max(1, Math.round((ms || 600) / 120)) + '';
      setTimeout(function () { el.style.animation = ''; }, ms || 600);
    },

    // Лаг на каждое нажатие в поле ввода: символ появляется с задержкой.
    lagInput: function (input, ms) {
      ms = ms || 220;
      var buffer = '';
      var timer = null;
      input.addEventListener('beforeinput', function (e) {
        // Пропускаем удаление — иначе вообще невозможно.
        if (e.inputType && e.inputType.indexOf('delete') === 0) return;
        if (e.data == null) return;
        e.preventDefault();
        buffer += e.data;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          input.value += buffer;
          buffer = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, ms);
      });
    },

    rnd: rnd
  };

  // ---- киоск-режим ----------------------------------------------------------

  var Kiosk = {
    init: function (opts) {
      opts = opts || {};
      // Гасим контекстное меню — чтобы гость не сбежал на «назад/перезагрузить».
      if (opts.lockContextMenu !== false) {
        document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      }
      // Сброс на старт после простоя (гость ушёл, пришёл следующий).
      if (opts.idleResetMs) {
        var t = null;
        var reset = function () {
          clearTimeout(t);
          t = setTimeout(function () { Kiosk.reset(opts.home); }, opts.idleResetMs);
        };
        ['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) {
          document.addEventListener(ev, reset, { passive: true });
        });
        reset();
      }
    },
    reset: function (home) { global.location.href = home || 'index.html'; }
  };

  global.Palata = { Store: Store, Theater: Theater, Kiosk: Kiosk, util: { esc: esc, formatTs: formatTs, csvCell: csvCell } };
})(window);
