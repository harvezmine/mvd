/* ==========================================================================
   PT Mitra Visi Digital / mitravisidigital.com
   Vanilla, tanpa dependensi. Modul: data perusahaan, i18n, kontak & formulir,
   header & menu, penanda menu aktif, reveal, tahun hak cipta.
   ========================================================================== */
(function () {
  'use strict';

  /* ====================================================================== */
  /* 0. DATA PERUSAHAAN                                                      */
  /* Kontak resmi menyusul. Selama kosong, email/WhatsApp tampil "Segera     */
  /* tersedia", formulir memberi tahu bahwa kontak belum aktif, dan baris    */
  /* NIB di footer disembunyikan.                                            */
  /* ====================================================================== */
  var CONFIG = {
    whatsapp: '',   // format internasional tanpa +, contoh: '6281234567890'
    email:    '',   // contoh: 'halo@mitravisidigital.com'
    nib:      ''    // Nomor Induk Berusaha
  };

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================================================================== */
  /* 1. KAMUS DWIBAHASA                                                      */
  /* Teks Indonesia juga tertulis langsung di HTML, jadi halaman tetap utuh  */
  /* tanpa JS. Kunci di sini harus sama dengan atribut data-i18n*.           */
  /* ====================================================================== */
  var DICT = {
    id: {
      'meta.title': 'PT Mitra Visi Digital | Website, Aplikasi & Sistem untuk Bisnis',
      'meta.desc':  'PT Mitra Visi Digital merancang, membangun, dan merawat website, aplikasi, dan sistem untuk perusahaan: company profile, landing page, website perusahaan, aplikasi web & SaaS, integrasi sistem, dan konsultasi.',

      'skip': 'Lewati ke konten utama',
      'nav.aria': 'Navigasi utama',
      'nav.about': 'Tentang Kami', 'nav.services': 'Layanan', 'nav.products': 'Produk',
      'nav.contact': 'Kontak',     'nav.cta': 'Hubungi Kami',
      'menu.open': 'Buka menu',    'menu.close': 'Tutup menu',

      'hero.title':  'Visi bisnis Anda, kami bantu wujudkan jadi sistem yang <span class="hl">siap dipakai</span>.',
      'hero.lede':   'PT Mitra Visi Digital merancang, membangun, dan merawat website, aplikasi, dan sistem untuk perusahaan. Satu tim mendampingi Anda dari perencanaan sampai sistem berjalan, juga setelahnya.',
      'hero.cta1':   'Diskusikan Kebutuhan Anda',
      'hero.cta2':   'Lihat Layanan',

      'about.title': 'Mitra teknologi yang ikut memikirkan bisnis Anda.',
      'about.p1':    'PT Mitra Visi Digital adalah perusahaan teknologi di Bekasi. Bagi kami, teknologi yang baik itu sederhana: benar-benar dipakai, menyelesaikan masalah nyata, dan mudah dirawat dalam jangka panjang.',
      'about.p2':    'Kami juga menjalankan produk digital sendiri, jadi kami tahu apa yang dibutuhkan sebuah sistem setelah diluncurkan. Pengalaman itu kami bawa ke setiap proyek klien.',
      'about.c1':    'Satu tim, dari rancangan sampai server',
      'about.c2':    'Teruji di produk yang kami jalankan sendiri',
      'about.c3':    'Data Anda kami jaga, NDA siap ditandatangani',
      'about.alt1':  'Rapat tim di ruang kantor',
      'about.alt2':  'Tim berdiskusi di depan laptop',
      'about.badge': 'produk digital yang kami bangun dan jalankan sendiri',

      'vm.title':  'Visi & Misi',
      'vm.intro':  'Arah yang kami tuju, dan cara kami menempuhnya.',
      'vm.visi':   'Visi',
      'vm.visi.d': 'Menjadi mitra digital yang dipercaya untuk membantu bisnis dan masyarakat Indonesia tumbuh lewat teknologi yang tepat guna.',
      'vm.misi':   'Misi',
      'vm.m1': 'Membangun solusi dari kebutuhan nyata klien, bukan sekadar ikut tren.',
      'vm.m2': 'Mengembangkan produk sendiri yang menjawab kebutuhan pengguna Indonesia.',
      'vm.m3': 'Menjaga keamanan dan kerahasiaan data di setiap proyek.',
      'vm.m4': 'Mendampingi klien dari perencanaan sampai sistem berjalan dan terus berkembang.',

      'srv.title': 'Layanan Kami',
      'srv.lede':  'Apa saja yang bisa kami kerjakan, dari website profil perusahaan sampai aplikasi skala penuh.',
      's1.d':   'Website profil yang memperkenalkan perusahaan, layanan, dan rekam jejak Anda dengan rapi dan meyakinkan.',
      's1.alt': 'Gedung perkantoran di Jakarta',
      's2.d':   'Satu halaman untuk kampanye, peluncuran produk, atau pendaftaran, dirancang agar pengunjung langsung mendaftar atau menghubungi Anda.',
      's2.alt': 'Laptop menampilkan halaman website',
      's3.t':   'Website Perusahaan',
      's3.d':   'Website multi-halaman yang cepat, nyaman dibuka di HP maupun laptop, bisa dwibahasa, dan disiapkan agar mudah ditemukan di mesin pencari.',
      's3.alt': 'Laptop di meja kerja',
      's4.t':   'Aplikasi Web & SaaS',
      's4.d':   'Kami bangun aplikasi Anda dari nol: akun pengguna, dashboard, pembayaran QRIS, sampai siap dipakai pelanggan.',
      's4.alt': 'Dashboard aplikasi di layar laptop',
      's5.t':   'Integrasi Sistem & AI',
      's5.d':   'Hubungkan sistem Anda dengan WhatsApp, payment gateway, dan layanan AI, agar pekerjaan rutin berjalan otomatis.',
      's5.alt': 'Ponsel menampilkan kode QR pembayaran',
      's6.t':   'Konsultasi Digital',
      's6.d':   'Kami bantu memilih teknologi, merancang arsitektur, dan memeriksa keamanan sistem yang sudah berjalan.',
      's6.alt': 'Rapat konsultasi di ruang kantor',
      'srv.more':      'Kebutuhan Anda belum ada di daftar?',
      'srv.more.link': 'Ceritakan kepada kami',

      'prod.title': 'Produk yang kami jalankan sendiri',
      'prod.lede':  'Ketiga produk ini kami bangun, operasikan, dan kembangkan sendiri. Di sinilah cara kerja kami diuji setiap hari.',
      'p1.cat':  'Platform karier',
      'p1.d':    'Portalio membantu pencari kerja mengubah CV jadi website portofolio pribadi dalam hitungan menit, langsung dari HP, sekaligus mencari lowongan dari berbagai sumber di satu tempat.',
      'p1.f1':   'CV terisi otomatis dengan bantuan AI',
      'p1.f2':   'Lowongan kerja dari 10+ sumber',
      'p1.f3':   'Bayar dengan QRIS, ada paket gratis',
      'p1.link': 'Kunjungi portalio.id',
      'p1.alt':  'Tampilan halaman utama Portalio',
      'p2.cat':  'Asisten pribadi AI',
      'p2.d':    'Asisten pribadi AI yang siaga 24 jam di WhatsApp. Cukup ketik atau kirim pesan suara untuk mengatur jadwal, rapat, email, sampai pengingat.',
      'p2.f1':   'Jadwal, pengingat, dan ringkasan rapat',
      'p2.f2':   'Ringkasan email dan grup WhatsApp kantor',
      'p2.f3':   'Semua tindakan menunggu persetujuan Anda',
      'p2.link': 'Kunjungi secretary.my.id',
      'p2.alt':  'Tampilan halaman utama Sekretaris AI',
      'p3.cat':  'Keamanan dokumen untuk perusahaan & instansi',
      'p3.d':    'Sistem pengelolaan dokumen bagi organisasi yang perlu mencegah dan melacak kebocoran data oleh orang dalam.',
      'p3.f1':   'Watermark tak kasatmata di setiap unduhan',
      'p3.f2':   'Jejak audit yang terlindungi dari manipulasi',
      'p3.f3':   'Enkripsi AES-256 dan autentikasi dua faktor',
      'p3.link': 'Minta Demo',
      'p3.alt':  'Penandatanganan dokumen perusahaan',

      'cta.title': 'Sedang merencanakan proyek digital?',
      'cta.d':     'Ceritakan kebutuhan Anda, kami bantu menyusun solusi, jadwal, dan perkiraan biayanya.',
      'cta.steps': 'Cara kami bekerja',
      'cta.btn':   'Mulai Konsultasi',
      'proc.1': 'Kenali Kebutuhan', 'proc.2': 'Susun Rencana', 'proc.3': 'Bangun & Uji', 'proc.4': 'Luncurkan & Dampingi',

      'con.title':   'Hubungi Kami',
      'con.lede':    'Ceritakan proyek Anda, minta demo Docloq, atau ajak kami bekerja sama. Kami membalas di hari kerja.',
      'con.address': 'Alamat',
      'con.hours':   'Jam operasional',
      'con.hours.v': 'Senin–Jumat, 09.00–17.00 WIB',
      'con.map':     'Peta lokasi kantor PT Mitra Visi Digital',
      'con.soon':    'Segera tersedia',

      'f.title':    'Kirim pesan',
      'f.intro':    'Isi formulir di bawah ini, pesan Anda akan sampai ke tim kami.',
      'f.name':     'Nama lengkap',
      'f.company':  'Nama perusahaan',
      'f.optional': '(opsional)',
      'f.contact':  'Email atau nomor WhatsApp',
      'f.need':     'Kebutuhan',
      'f.msg':      'Pesan',
      'f.msg.ph':   'Ceritakan singkat proyek atau pertanyaan Anda',
      'f.submit':   'Kirim Pesan',
      'f.note':     'Data yang Anda kirim hanya digunakan untuk menanggapi pesan ini.',
      'f.required': 'Bagian ini wajib diisi.',
      'f.ok.wa':    'WhatsApp dibuka di tab baru. Tinggal tekan kirim.',
      'f.ok.mail':  'Aplikasi email Anda dibuka dengan pesan yang sudah terisi.',
      'f.pending':  'Kontak resmi kami sedang disiapkan, jadi formulir ini belum bisa mengirim pesan. Silakan coba lagi dalam waktu dekat.',
      'f.hello':    'Halo PT Mitra Visi Digital,',
      'f.subject':  'Pesan dari mitravisidigital.com',
      'opt.none':        'Pilih kebutuhan',
      'opt.website':     'Website perusahaan',
      'opt.saas':        'Aplikasi web & SaaS',
      'opt.integration': 'Integrasi sistem & AI',
      'opt.consulting':  'Konsultasi digital',
      'opt.docloq':      'Demo Docloq',
      'opt.other':       'Lainnya',

      'foot.desc':     'Perusahaan teknologi di Bekasi yang merancang, membangun, dan merawat website, aplikasi, dan sistem untuk bisnis.',
      'foot.company':  'Perusahaan',
      'foot.products': 'Produk',
      'foot.services': 'Layanan',
      'foot.contact': 'Kontak',
      'foot.rights':   'Hak cipta dilindungi.'
    },

    en: {
      'meta.title': 'PT Mitra Visi Digital | Websites, Apps & Systems for Business',
      'meta.desc':  'PT Mitra Visi Digital designs, builds and maintains websites, apps and systems for companies: company profiles, landing pages, corporate websites, web apps & SaaS, system integration and consulting.',

      'skip': 'Skip to main content',
      'nav.aria': 'Main navigation',
      'nav.about': 'About Us', 'nav.services': 'Services', 'nav.products': 'Products',
      'nav.contact': 'Contact', 'nav.cta': 'Contact Us',
      'menu.open': 'Open menu', 'menu.close': 'Close menu',

      'hero.title':  'Your business vision, built into systems that are <span class="hl">ready to use</span>.',
      'hero.lede':   'PT Mitra Visi Digital designs, builds and maintains websites, apps and systems for companies. One team stays with you from planning to launch, and after.',
      'hero.cta1':   'Discuss Your Needs',
      'hero.cta2':   'Our Services',

      'about.title': 'A technology partner that thinks about your business, too.',
      'about.p1':    'PT Mitra Visi Digital is a technology company in Bekasi. For us, good technology is simple: it actually gets used, solves real problems, and is easy to maintain over the long run.',
      'about.p2':    'We also run digital products of our own, so we know what a system needs after launch. We bring that experience to every client project.',
      'about.c1':    'One team, from design to server',
      'about.c2':    'Proven on products we run ourselves',
      'about.c3':    'Your data stays confidential, NDA ready to sign',
      'about.alt1':  'A team meeting in an office',
      'about.alt2':  'A team discussing work at a laptop',
      'about.badge': 'digital products we build and run ourselves',

      'vm.title':  'Vision & Mission',
      'vm.intro':  'Where we’re headed, and how we get there.',
      'vm.visi':   'Vision',
      'vm.visi.d': 'To be a trusted digital partner that helps Indonesian businesses and communities grow through technology that fits.',
      'vm.misi':   'Mission',
      'vm.m1': 'Build from clients’ real needs, not passing trends.',
      'vm.m2': 'Build our own products that answer the needs of Indonesian users.',
      'vm.m3': 'Protect data security and confidentiality in every project.',
      'vm.m4': 'Support clients from planning until the system runs and keeps growing.',

      'srv.title': 'Our Services',
      'srv.lede':  'What we can build for you, from a company profile site to full-scale applications.',
      's1.d':   'A profile site that presents your company, services and track record clearly and convincingly.',
      's1.alt': 'Office towers in Jakarta',
      's2.d':   'One page for a campaign, product launch or sign-up, built so visitors sign up or contact you right away.',
      's2.alt': 'A laptop showing a website',
      's3.t':   'Corporate Website',
      's3.d':   'A fast multi-page site that works on phone and laptop, can be bilingual, and is set up to be found on search engines.',
      's3.alt': 'A laptop on a work desk',
      's4.t':   'Web Apps & SaaS',
      's4.d':   'We build your app from scratch: user accounts, dashboards, QRIS payments, all the way to customer-ready.',
      's4.alt': 'An application dashboard on a laptop screen',
      's5.t':   'System & AI Integration',
      's5.d':   'Connect your systems to WhatsApp, payment gateways and AI services so routine work runs on its own.',
      's5.alt': 'A phone showing a payment QR code',
      's6.t':   'Digital Consulting',
      's6.d':   'We help you choose technology, design the architecture, and check the security of systems already running.',
      's6.alt': 'A consulting meeting in an office',
      'srv.more':      'Don’t see what you need?',
      'srv.more.link': 'Tell us about it',

      'prod.title': 'Products we run ourselves',
      'prod.lede':  'We build, run and improve these three products ourselves. They’re where our way of working gets tested every day.',
      'p1.cat':  'Career platform',
      'p1.d':    'Portalio helps job seekers turn a CV into a personal portfolio site in minutes, right from their phone, and search jobs from many sources in one place.',
      'p1.f1':   'CV filled in automatically with AI',
      'p1.f2':   'Job listings from 10+ sources',
      'p1.f3':   'Pay with QRIS, free plan available',
      'p1.link': 'Visit portalio.id',
      'p1.alt':  'Portalio home page',
      'p2.cat':  'AI personal assistant',
      'p2.d':    'A personal AI assistant on call 24 hours a day on WhatsApp. Type or send a voice note to manage schedules, meetings, email and reminders.',
      'p2.f1':   'Schedules, reminders and meeting summaries',
      'p2.f2':   'Summaries of email and office WhatsApp groups',
      'p2.f3':   'Nothing happens without your approval',
      'p2.link': 'Visit secretary.my.id',
      'p2.alt':  'Sekretaris AI home page',
      'p3.cat':  'Document security for companies & institutions',
      'p3.d':    'Document management for organisations that need to prevent and trace leaks by insiders.',
      'p3.f1':   'Invisible watermark on every download',
      'p3.f2':   'Tamper-evident audit trail',
      'p3.f3':   'AES-256 encryption and two-factor authentication',
      'p3.link': 'Request a Demo',
      'p3.alt':  'Signing company documents',

      'cta.title': 'Planning a digital project?',
      'cta.d':     'Tell us what you need, and we’ll help put together the solution, timeline and cost estimate.',
      'cta.steps': 'How we work',
      'cta.btn':   'Start a Consultation',
      'proc.1': 'Understand Needs', 'proc.2': 'Make a Plan', 'proc.3': 'Build & Test', 'proc.4': 'Launch & Support',

      'con.title':   'Contact Us',
      'con.lede':    'Tell us about your project, request a Docloq demo, or invite us to work with you. We reply on business days.',
      'con.address': 'Address',
      'con.hours':   'Office hours',
      'con.hours.v': 'Monday–Friday, 09:00–17:00 WIB (UTC+7)',
      'con.map':     'Map of the PT Mitra Visi Digital office',
      'con.soon':    'Coming soon',

      'f.title':    'Send a message',
      'f.intro':    'Fill in the form below and your message will go straight to our team.',
      'f.name':     'Full name',
      'f.company':  'Company name',
      'f.optional': '(optional)',
      'f.contact':  'Email or WhatsApp number',
      'f.need':     'What do you need?',
      'f.msg':      'Message',
      'f.msg.ph':   'Briefly describe your project or question',
      'f.submit':   'Send Message',
      'f.note':     'Your details are used only to respond to this message.',
      'f.required': 'This field is required.',
      'f.ok.wa':    'WhatsApp has opened in a new tab. Just press send.',
      'f.ok.mail':  'Your email app has opened with the message filled in.',
      'f.pending':  'Our official contact details are being set up, so this form can’t send messages yet. Please try again soon.',
      'f.hello':    'Hello PT Mitra Visi Digital,',
      'f.subject':  'Message from mitravisidigital.com',
      'opt.none':        'Select one',
      'opt.website':     'Corporate website',
      'opt.saas':        'Web app & SaaS',
      'opt.integration': 'System & AI integration',
      'opt.consulting':  'Digital consulting',
      'opt.docloq':      'Docloq demo',
      'opt.other':       'Other',

      'foot.desc':     'A technology company in Bekasi that designs, builds and maintains websites, apps and systems for businesses.',
      'foot.company':  'Company',
      'foot.products': 'Products',
      'foot.services': 'Services',
      'foot.contact': 'Contact',
      'foot.rights':   'All rights reserved.'
    }
  };

  var lang = 'id';

  /* ====================================================================== */
  /* 2. KONTAK & DATA LEGAL                                                  */
  /* ====================================================================== */
  function formatPhone(intl) {
    // 6281234567890 -> +62 812-3456-7890
    var local = intl.replace(/^62/, '');
    return '+62 ' + local.replace(/^(\d{3})(\d{4})(\d+)$/, '$1-$2-$3');
  }

  function renderContacts() {
    var d = DICT[lang];

    $$('[data-contact]').forEach(function (el) {
      var kind = el.getAttribute('data-contact');
      var valueEl = $('[data-contact-value]', el);
      var href = null, text = null;

      if (kind === 'whatsapp' && CONFIG.whatsapp) {
        href = 'https://wa.me/' + CONFIG.whatsapp;
        text = formatPhone(CONFIG.whatsapp);
      } else if (kind === 'email' && CONFIG.email) {
        href = 'mailto:' + CONFIG.email;
        text = CONFIG.email;
      }

      if (href) {
        el.setAttribute('href', href);
        el.classList.remove('is-pending');
        valueEl.textContent = text;
      } else {
        el.removeAttribute('href');
        el.classList.add('is-pending');
        valueEl.textContent = d['con.soon'];
      }
    });

    $$('[data-config]').forEach(function (el) {
      var v = CONFIG[el.getAttribute('data-config')];
      el.hidden = !v;
      if (v) $('[data-config-value]', el).textContent = v;
    });
  }

  /* ====================================================================== */
  /* 3. FORMULIR KONTAK                                                      */
  /* Tidak ada server: pesan disusun lalu dibuka di WhatsApp (utama) atau    */
  /* aplikasi email. Tautan dengan data-topic memilihkan "Kebutuhan".        */
  /* ====================================================================== */
  var form = $('#contact-form');

  function setStatus(text, kind) {
    var el = $('.form__status', form);
    el.textContent = text || '';
    el.className = 'form__status' + (kind ? ' is-' + kind : '');
  }

  function showError(input, show) {
    var err = $('[data-err-for="' + input.id + '"]', form);
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    if (!err) return;
    err.textContent = show ? DICT[lang]['f.required'] : '';
    if (show) input.setAttribute('aria-describedby', err.id);
    else input.removeAttribute('aria-describedby');
  }

  if (form) {
    var required = $$('[required]', form);
    var field = function (name) { return form.elements[name]; };

    required.forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true' && input.value.trim()) showError(input, false);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = DICT[lang];
      var firstBad = null;

      required.forEach(function (input) {
        var bad = !input.value.trim();
        showError(input, bad);
        if (bad && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); setStatus(''); return; }

      var need = field('need');
      var body = [
        d['f.hello'], '',
        d['f.name'] + ': ' + field('name').value.trim(),
        d['f.company'] + ': ' + (field('company').value.trim() || '-'),
        d['f.contact'] + ': ' + field('contact').value.trim(),
        d['f.need'] + ': ' + (need.value ? need.options[need.selectedIndex].text : '-'), '',
        field('message').value.trim()
      ].join('\n');

      if (CONFIG.whatsapp) {
        window.open('https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        setStatus(d['f.ok.wa'], 'ok');
      } else if (CONFIG.email) {
        window.location.href = 'mailto:' + CONFIG.email +
          '?subject=' + encodeURIComponent(d['f.subject']) +
          '&body=' + encodeURIComponent(body);
        setStatus(d['f.ok.mail'], 'ok');
      } else {
        setStatus(d['f.pending'], 'warn');
      }
    });

    $$('[data-topic]').forEach(function (el) {
      el.addEventListener('click', function () {
        field('need').value = el.getAttribute('data-topic');
      });
    });
  }

  /* ====================================================================== */
  /* 4. GANTI BAHASA                                                         */
  /* ====================================================================== */
  function setLang(next) {
    lang = DICT[next] ? next : 'id';
    var d = DICT[lang];

    $$('[data-i18n]').forEach(function (el) {
      var v = d[el.getAttribute('data-i18n')];
      if (v != null) el.textContent = v;
    });
    $$('[data-i18n-html]').forEach(function (el) {
      var v = d[el.getAttribute('data-i18n-html')];
      if (v != null) el.innerHTML = v;
    });
    [['data-i18n-aria', 'aria-label'], ['data-i18n-alt', 'alt'],
     ['data-i18n-ph', 'placeholder'], ['data-i18n-title', 'title']].forEach(function (pair) {
      $$('[' + pair[0] + ']').forEach(function (el) {
        var v = d[el.getAttribute(pair[0])];
        if (v != null) el.setAttribute(pair[1], v);
      });
    });

    document.documentElement.lang = lang === 'id' ? 'id-ID' : 'en';
    document.title = d['meta.title'];
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', d['meta.desc']);

    $$('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });

    // Pesan galat yang sedang tampil ikut diterjemahkan
    if (form) {
      $$('[aria-invalid="true"]', form).forEach(function (input) { showError(input, true); });
      setStatus('');
    }

    syncBurgerLabel();
    renderContacts();
    try { localStorage.setItem('mvd-lang', lang); } catch (e) {}
  }

  $$('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang')); });
  });

  /* ====================================================================== */
  /* 5. HEADER & MENU MOBILE                                                 */
  /* Header transparan di atas hero, menjadi putih (.is-solid) setelah       */
  /* halaman digulir atau saat menu mobile dibuka (.menu-open).              */
  /* ====================================================================== */
  var header = $('.site-header');
  var nav    = $('#nav');
  var burger = $('.burger');

  function syncBurgerLabel() {
    if (!burger) return;
    var open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-label', DICT[lang][open ? 'menu.close' : 'menu.open']);
  }

  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    syncBurgerLabel();
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      setMenu(burger.getAttribute('aria-expanded') !== 'true');
    });
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        burger.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('is-open') && !header.contains(e.target)) setMenu(false);
    });
    window.matchMedia('(min-width: 961px)').addEventListener('change', function (m) {
      if (m.matches) setMenu(false);
    });
  }

  var sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;height:24px;width:1px;pointer-events:none;';
  document.body.prepend(sentinel);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-solid', !entries[0].isIntersecting);
    }).observe(sentinel);

    // Penanda menu aktif sesuai seksi yang sedang dibaca
    var links = $$('.nav a[href^="#"]:not(.btn)');
    var sections = links.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = '#' + entry.target.id;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  } else {
    header.classList.add('is-solid');
  }

  /* ====================================================================== */
  /* 6. REVEAL SAAT GULIR                                                    */
  /* Elemen bersaudara diberi jeda bertingkat lewat --i.                     */
  /* ====================================================================== */
  var reveals = $$('[data-reveal]');
  var parents = [];
  reveals.forEach(function (el) {
    var p = el.parentElement;
    if (parents.indexOf(p) === -1) { parents.push(p); p.__revealCount = 0; }
    el.style.setProperty('--i', String(Math.min(p.__revealCount++, 5)));
  });

  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ====================================================================== */
  /* 7. TAHUN HAK CIPTA (selalu tahun berjalan)                              */
  /* ====================================================================== */
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ====================================================================== */
  /* INIT                                                                    */
  /* ====================================================================== */
  var stored = null;
  try { stored = localStorage.getItem('mvd-lang'); } catch (e) {}
  setLang(stored || 'id');
})();
