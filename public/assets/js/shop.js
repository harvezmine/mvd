/* ==========================================================================
   PT Mitra Visi Digital: checkout & status pesanan
   - /checkout : pilih paket (dari catalog.json), isi data, kirim ke
                 POST /api/checkout, lalu diarahkan ke halaman pembayaran Xendit.
   - /pesanan  : tampilkan status pesanan dari GET /api/orders/:id.
   Harga di halaman hanya untuk tampilan; jumlah tagihan dihitung server.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var WA = '6289636458562';

  function rp(n) { return 'Rp' + Number(n).toLocaleString('id-ID'); }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function param(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  /* ====================================================================== */
  /* CHECKOUT                                                                */
  /* ====================================================================== */
  var form = $('#checkout-form');
  if (form) {
    var select = $('#co-package');
    var submit = $('#co-submit');
    var label = $('[data-co-label]');
    var status = $('#co-status');
    var packages = [];

    var FIELD_IDS = { package: 'co-package', name: 'co-name', email: 'co-email', phone: 'co-phone', agree: 'co-agree' };

    function current() {
      for (var i = 0; i < packages.length; i++) if (packages[i].sku === select.value) return packages[i];
      return null;
    }

    function renderSummary() {
      var e = current();
      if (!e) return;
      $('[data-co-name]').textContent = e.product.name + ' ' + e.plan.name;
      $('[data-co-summary]').textContent = e.product.tagline;
      $('[data-co-logo]').src = e.product.logo;
      $('[data-co-tint]').style.setProperty('--tint', e.product.tint || '#eff4fd');
      $('[data-co-features]').innerHTML = e.plan.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
      $('[data-co-option]').textContent = e.option.label;
      $('[data-co-period]').textContent = e.option.period;
      $('[data-co-total]').textContent = rp(e.option.price);
      $('[data-co-hint]').textContent = e.product.account_hint;
      label.textContent = 'Bayar ' + rp(e.option.price);
      try {
        var url = new URL(location.href);
        url.searchParams.set('paket', e.sku);
        history.replaceState(null, '', url.pathname + url.search);
      } catch (err) {}
    }

    function setError(field, msg) {
      var input = document.getElementById(FIELD_IDS[field] || field);
      var err = input && $('[data-err-for="' + input.id + '"]');
      if (!input) return;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) {
        err.textContent = msg || '';
        if (msg) input.setAttribute('aria-describedby', err.id); else input.removeAttribute('aria-describedby');
      }
    }

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'form__status' + (kind ? ' is-' + kind : '');
    }

    function validate(data) {
      var errors = {};
      if (!current()) errors.package = 'Pilih paket yang tersedia.';
      if (data.name.length < 2) errors.name = 'Isi nama lengkap Anda.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.email = 'Isi alamat email yang valid.';
      var digits = data.phone.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) errors.phone = 'Isi nomor WhatsApp yang valid, contoh 0812 3456 7890.';
      if (!data.agree) errors.agree = 'Centang persetujuan ini untuk melanjutkan.';
      return errors;
    }

    // Isi pilihan paket dari katalog (sumber yang sama dengan server).
    fetch('/assets/data/catalog.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        packages = [];
        var html = '';
        data.products.forEach(function (product) {
          html += '<optgroup label="' + esc(product.name) + '">';
          product.plans.forEach(function (plan) {
            (plan.options || []).forEach(function (option) {
              packages.push({ sku: option.sku, product: product, plan: plan, option: option });
              html += '<option value="' + esc(option.sku) + '">' + esc(product.name + ' ' + plan.name + ', ' + option.label) +
                ' (' + rp(option.price) + ')</option>';
            });
          });
          html += '</optgroup>';
        });
        var wanted = param('paket');
        select.innerHTML = html;
        if (wanted && packages.some(function (e) { return e.sku === wanted; })) select.value = wanted;
        renderSummary();
      })
      .catch(function () {
        setStatus('Daftar paket gagal dimuat. Muat ulang halaman, atau hubungi kami lewat WhatsApp.', 'warn');
      });

    select.addEventListener('change', function () { setError('package', ''); renderSummary(); });

    $$('input, textarea', form).forEach(function (el) {
      el.addEventListener('input', function () {
        if (el.getAttribute('aria-invalid') === 'true') setError(el.id, '');
      });
    });
    $('#co-agree').addEventListener('change', function () { setError('agree', ''); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        package: select.value,
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        notes: form.elements.notes.value.trim(),
        agree: $('#co-agree').checked
      };

      Object.keys(FIELD_IDS).forEach(function (f) { setError(f, ''); });
      var errors = validate(data);
      var keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach(function (f) { setError(f, errors[f]); });
        document.getElementById(FIELD_IDS[keys[0]]).focus();
        setStatus('');
        return;
      }

      submit.disabled = true;
      label.textContent = 'Memproses pesanan...';
      setStatus('');

      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
        .then(function (res) {
          if (res.ok && res.body.redirect) {
            label.textContent = 'Mengarahkan ke pembayaran...';
            location.href = res.body.redirect;
            return;
          }
          if (res.body && res.body.fields) {
            Object.keys(res.body.fields).forEach(function (f) { setError(f, res.body.fields[f]); });
          }
          throw new Error((res.body && res.body.error) || 'Pesanan belum berhasil dibuat.');
        })
        .catch(function (err) {
          submit.disabled = false;
          renderSummary();
          setStatus(err.message && err.message !== 'Failed to fetch'
            ? err.message
            : 'Koneksi terputus. Periksa internet Anda lalu coba lagi.', 'warn');
        });
    });
  }

  /* ====================================================================== */
  /* STATUS PESANAN                                                          */
  /* ====================================================================== */
  var orderEl = $('#order');
  if (orderEl) {
    var id = param('id').toUpperCase();
    var polls = 0;

    var STATES = {
      RECEIVED: {
        title: 'Pesanan Anda sudah kami terima.',
        text: 'Kami akan menghubungi Anda lewat WhatsApp atau email pada hari kerja berikutnya untuk konfirmasi dan tautan pembayaran.',
        label: 'Menunggu konfirmasi'
      },
      PENDING: {
        title: 'Menunggu pembayaran.',
        text: 'Selesaikan pembayaran sebelum tagihan kedaluwarsa. Halaman ini akan diperbarui otomatis setelah pembayaran diterima.',
        label: 'Menunggu pembayaran'
      },
      PAID: {
        title: 'Pembayaran berhasil, terima kasih.',
        text: 'Paket Anda akan kami aktifkan pada hari kerja berikutnya. Konfirmasinya kami kirim lewat WhatsApp atau email.',
        label: 'Lunas'
      },
      EXPIRED: {
        title: 'Tagihan sudah kedaluwarsa.',
        text: 'Pembayaran tidak diterima sampai batas waktu. Silakan buat pesanan baru, atau hubungi kami bila Anda sudah terlanjur membayar.',
        label: 'Kedaluwarsa'
      }
    };

    function formatDate(iso) {
      try {
        return new Date(iso).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB';
      } catch (e) { return iso; }
    }

    function showMissing(msg) {
      orderEl.setAttribute('data-state', 'missing');
      $('#order-title').textContent = 'Pesanan tidak ditemukan.';
      $('#order-text').textContent = msg || 'Periksa kembali tautan atau nomor pesanan Anda.';
      $('#order-actions').innerHTML = '<a class="btn btn--primary" href="/#harga">Lihat paket</a>';
    }

    function render(o) {
      var st = STATES[o.status] || STATES.RECEIVED;
      orderEl.setAttribute('data-state', o.status.toLowerCase());
      $('#order-title').textContent = st.title;
      $('#order-text').textContent = st.text;
      $('[data-o="id"]').textContent = o.id;
      $('[data-o="package"]').textContent = o.package_name + (o.period ? ', masa aktif ' + o.period : '');
      $('[data-o="amount"]').textContent = rp(o.amount);
      $('[data-o="date"]').textContent = formatDate(o.created_at);
      $('[data-o="status"]').textContent = st.label;
      $('#order-rows').hidden = false;

      var actions = '';
      if (o.status === 'PENDING' && o.payment_url) {
        actions += '<a class="btn btn--primary" href="' + esc(o.payment_url) + '">Bayar sekarang</a>';
      }
      if (o.status === 'EXPIRED') {
        actions += '<a class="btn btn--primary" href="/checkout?paket=' + encodeURIComponent(o.package_id) + '">Pesan lagi</a>';
      }
      actions += '<a class="btn btn--outline" href="/">Kembali ke beranda</a>';
      $('#order-actions').innerHTML = actions;

      var wa = $('#order-wa');
      if (wa) wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Halo PT Mitra Visi Digital, saya ingin menanyakan pesanan ' + o.id + '.');

      // Saat baru kembali dari halaman pembayaran, status bisa belum berubah.
      if (o.status === 'PENDING' && polls < 12) {
        polls++;
        setTimeout(load, 5000);
      }
    }

    function load() {
      fetch('/api/orders/' + encodeURIComponent(id), { cache: 'no-store' })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) { if (res.ok) render(res.body); else showMissing(); })
        .catch(function () { showMissing('Status pesanan belum bisa dimuat. Periksa koneksi Anda lalu muat ulang halaman.'); });
    }

    if (/^MVD-\d{6}-[A-Z2-7]{6}$/.test(id)) load(); else showMissing();
  }
})();
