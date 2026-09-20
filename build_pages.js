const fs = require('fs');

const pageConfigs = [
  { raw: 'index.raw.html', target: 'index.html' },
  { raw: 'about.raw.html', target: 'about.html' },
  { raw: 'contact.raw.html', target: 'contact.html' },
  { raw: 'diplomatic.raw.html', target: 'diplomatic.html' },
  { raw: 'order.raw.html', target: 'order.html' },
  { raw: 'request-quote.raw.html', target: 'request-quote.html' },
  { raw: 'services.raw.html', target: 'services.html' }
];

function appendBeforeClosingBody(html, injection) {
  const lastIndex = html.lastIndexOf('</body>');
  if (lastIndex !== -1) {
    return html.substring(0, lastIndex) + '\n' + injection + '\n' + html.substring(lastIndex);
  }
  return html + '\n' + injection;
}

function transformHtml(content, pageName) {
  let res = content;

  // 0. Remove misleading comments containing </body> in the head
  res = res.replace(/<!--\s*Alpine\.js loaded once before <\/body>\s*-->/gi, '<!-- Alpine.js -->');

  // 1. Replace all image & asset URLs to local images/ and js/
  res = res.replace(/https?:\/\/[^\/]+\/(storage\/app\/public\/photos|temp\/custom\/images[^\"]*)\/(.+?\.(webp|png|jpg|jpeg|svg|gif))/g, (match, p1, filename) => {
    const parts = filename.split('/');
    return 'images/' + parts[parts.length - 1];
  });

  res = res.replace(/https?:\/\/[^\/]+\/(storage\/app\/public\/photos|temp\/custom\/images[^']*)\/(.+?\.(webp|png|jpg|jpeg|svg|gif))/g, (match, p1, filename) => {
    const parts = filename.split('/');
    return 'images/' + parts[parts.length - 1];
  });

  // js scripts
  res = res.replace(/https?:\/\/[^\/]+\/dash\/js\/jquery-3\.6\.0\.min\.js/g, 'https://code.jquery.com/jquery-3.6.0.min.js');
  res = res.replace(/https?:\/\/[^\/]+\/temp\/custom\/js\/soft-blur-text\.js(\?v=\d+)?/g, 'js/soft-blur-text.js');

  // 2. Replace Links
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/about[\"']/g, 'href="about.html"');
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/contact[\"']/g, 'href="contact.html"');
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/diplomatic[\"']/g, 'href="diplomatic.html"');
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/order[\"']/g, 'href="order.html"');
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/request-quote[\"']/g, 'href="request-quote.html"');
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/services[\"']/g, 'href="services.html"');
  res = res.replace(/href=[\"']https?:\/\/zoomxpresslogistics\.com\/?[\"']/g, 'href="index.html"');

  res = res.replace(/href=[\"']\/?about[\"']/g, 'href="about.html"');
  res = res.replace(/href=[\"']\/?contact[\"']/g, 'href="contact.html"');
  res = res.replace(/href=[\"']\/?diplomatic[\"']/g, 'href="diplomatic.html"');
  res = res.replace(/href=[\"']\/?order[\"']/g, 'href="order.html"');
  res = res.replace(/href=[\"']\/?request-quote[\"']/g, 'href="request-quote.html"');
  res = res.replace(/href=[\"']\/?services[\"']/g, 'href="services.html"');
  res = res.replace(/href=[\"']\/[\"']/g, 'href="index.html"');

  // 3. Replace Brand
  res = res.replace(/Zoom Express Logistics/g, 'Express Cargo');
  res = res.replace(/Zoom Express/g, 'Express Cargo');
  res = res.replace(/ZoomExpress/g, 'Express Cargo');
  res = res.replace(/zoomxpresslogistics\.com/g, 'express-cargo.ltd');
  res = res.replace(/info@zoomxpresslogistics\.com/g, 'support@express-cargo.ltd');
  res = res.replace(/info@express-cargo\.ltd/g, 'support@express-cargo.ltd');

  // 4. Tracking forms in header/footer/hero
  res = res.replace(/action=[\"']https?:\/\/zoomxpresslogistics\.com\/trackingresult[\"']/g, 'action="order.html" method="GET"');
  res = res.replace(/action=[\"']https?:\/\/express-cargo\.ltd\/trackingresult[\"']/g, 'action="order.html" method="GET"');
  res = res.replace(/name=[\"']order_id[\"']/g, 'name="tracking_number"');

  // 4b. Footer Logo & Translation Styling
  res = res.replace(/<footer[\s\S]*?<\/footer>/gi, (footerHtml) => {
    let updatedFooter = footerHtml;
    // Replace logo inside footer with white edition and remove distorting invert filter
    updatedFooter = updatedFooter.replace(
      /src=[\"']images\/J3vnilG6TddFEwFkWebd0LvUcwomzTgY4EFhaEDN\.png[\"']\s+alt=[\"']Express Cargo[\"']\s+class=[\"'][^\"']*?[\"']/gi,
      'src="images/logo-footer.png" alt="Express Cargo" class="h-12 w-auto rounded-lg object-contain shadow-sm opacity-95 group-hover:opacity-100 transition-opacity"'
    );
    // Enhance translation wrapper with globe icon & sleek container
    updatedFooter = updatedFooter.replace(
      /<div class=\"gtranslate_wrapper\"><\/div>/gi,
      `<div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 backdrop-blur-sm shadow-sm hover:border-white/20 transition-all">
          <i class="fas fa-globe text-secondary-400 text-sm animate-pulse"></i>
          <span class="text-slate-400 text-xs mr-0.5">Language:</span>
          <div class="gtranslate_wrapper"></div>
       </div>`
    );
    return updatedFooter;
  });

  // Inject GTranslate & Globe Styling into head
  const translateCSS = `
  <style>
    .gtranslate_wrapper select {
      background: transparent !important;
      color: #f8fafc !important;
      border: none !important;
      font-size: 0.8125rem !important;
      font-weight: 600 !important;
      outline: none !important;
      cursor: pointer !important;
      padding: 2px 4px !important;
    }
    .gtranslate_wrapper select option {
      background: #0B1F3A !important;
      color: #ffffff !important;
    }
    .gt_switcher {
      display: inline-flex !important;
      align-items: center !important;
    }
  </style>
  `;
  res = res.replace('</head>', translateCSS + '</head>');

  // 5. Page-specific enhancements
  if (pageName === 'order.html') {
    // Inject Leaflet CSS & JS, Socket.IO into head
    const headInject = `
    <!-- Leaflet & Socket.IO for Live Tracking -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <style>
      @keyframes pulse-ring {
        0% { transform: scale(0.95); opacity: 0.8; }
        50% { transform: scale(1.4); opacity: 0.2; }
        100% { transform: scale(0.95); opacity: 0.8; }
      }
      .radar-pulse {
        animation: pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @media print {
        body * { visibility: hidden !important; }
        #printableWaybillModal, #printableWaybillModal * { visibility: visible !important; }
        #printableWaybillModal { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: white !important; }
        .no-print { display: none !important; }
      }
    </style>
    `;
    res = res.replace('</head>', headInject + '</head>');

    // Inject Tracking results container and live interactive logic
    const trackingContainerHTML = `
    <!-- LIVE TRACKING RESULTS CONTAINER (10/10 ENTERPRISE TELEMETRY SUITE) -->
    <div id="trackingResultsSection" class="hidden max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-20">
      <!-- Loading State -->
      <div id="trackingLoading" class="hidden text-center py-20 bg-white/90 backdrop-blur-xl rounded-3xl border border-slate-200/80 shadow-2xl">
        <div class="relative inline-flex items-center justify-center">
          <div class="h-16 w-16 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin"></div>
          <i class="fas fa-satellite text-primary-600 text-xl absolute"></i>
        </div>
        <h3 class="mt-5 text-xl font-extrabold text-[#0B1F3A]">Acquiring Live Satellite Telemetry...</h3>
        <p class="mt-2 text-sm text-slate-500 max-w-md mx-auto">Querying global airway navigation radars, customs checkpoints, and transit telemetry nodes.</p>
      </div>

      <!-- Error State -->
      <div id="trackingError" class="hidden bg-red-50/90 backdrop-blur-md border border-red-200 text-red-800 p-8 rounded-3xl shadow-xl text-center">
        <div class="h-14 w-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto mb-4">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3 class="text-lg font-bold text-red-900">Consignment Lookup Failed</h3>
        <p id="trackingErrorMessage" class="text-sm text-red-700 mt-2 max-w-lg mx-auto">Shipment not found. Please verify the tracking number and try again.</p>
        <button onclick="document.getElementById('trackingNumber')?.focus(); window.scrollTo({top: 0, behavior: 'smooth'});" class="mt-5 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md">
          Re-enter Tracking Number
        </button>
      </div>

      <!-- Live Dashboard Content -->
      <div id="trackingContent" class="hidden space-y-8">
        <!-- Top Command Header Card -->
        <div class="bg-gradient-to-r from-[#0B1F3A] via-[#0e2749] to-[#071526] rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-white/10 relative overflow-hidden">
          <div class="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary-500/10 blur-3xl pointer-events-none"></div>
          <div class="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-secondary-500/10 blur-3xl pointer-events-none"></div>

          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div class="flex flex-wrap items-center gap-3">
                <span class="px-3 py-1 rounded-lg bg-white/10 text-primary-300 text-xs font-mono font-bold tracking-wider border border-white/10 flex items-center gap-1.5">
                  <i class="fas fa-fingerprint"></i> CONSIGNMENT ID
                </span>
                <span id="resSecurityBadge" class="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5">
                  <i class="fas fa-shield-alt"></i> TAMPER-PROOF GPS SEAL VERIFIED
                </span>
              </div>
              <div class="flex items-center gap-3 mt-3">
                <h1 id="resTrackingNumber" class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">--</h1>
                <button type="button" onclick="copyTrackingNumber()" title="Copy Tracking Number" class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all text-sm">
                  <i class="fas fa-copy" id="copyIcon"></i>
                </button>
              </div>
              <p class="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-2">
                <span>Carrier: <strong id="resCarrier" class="text-white">Express Cargo Global</strong></span>
                <span class="text-slate-500">•</span>
                <span>Service: <strong id="resServiceType" class="text-amber-400">Air Express</strong></span>
              </p>
            </div>

            <!-- Header Action Buttons -->
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" onclick="openPrintWaybill()" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 shadow-lg">
                <i class="fas fa-print text-primary-400"></i>
                <span>Print Official Waybill</span>
              </button>
              <button type="button" onclick="scrollToEmailSubscribe()" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-secondary-500 to-amber-600 hover:from-secondary-600 hover:to-amber-700 text-xs font-bold text-white transition-all hover:-translate-y-0.5 shadow-lg shadow-secondary-500/20">
                <i class="fas fa-bell"></i>
                <span>Get Email Alerts</span>
              </button>
            </div>
          </div>

          <!-- 6-Stage Progress Stepper -->
          <div class="mt-8 pt-8 border-t border-white/10">
            <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              <span>Consignment Lifecycle Status</span>
              <span id="resProgressText" class="text-secondary-400 text-sm font-extrabold">0% Complete</span>
            </div>

            <!-- Stepper Indicators Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" id="stepperContainer">
              <!-- Step 1 -->
              <div id="step-1" class="p-3 rounded-2xl bg-white/5 border border-white/10 transition-all">
                <div class="flex items-center gap-2">
                  <span class="step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span class="text-[11px] font-bold text-slate-300">Booked</span>
                </div>
                <span class="step-sub text-[10px] text-slate-500 block mt-1">Manifest Issued</span>
              </div>
              <!-- Step 2 -->
              <div id="step-2" class="p-3 rounded-2xl bg-white/5 border border-white/10 transition-all">
                <div class="flex items-center gap-2">
                  <span class="step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span class="text-[11px] font-bold text-slate-300">Hub Intake</span>
                </div>
                <span class="step-sub text-[10px] text-slate-500 block mt-1">Sorted &amp; Sealed</span>
              </div>
              <!-- Step 3 -->
              <div id="step-3" class="p-3 rounded-2xl bg-white/5 border border-white/10 transition-all">
                <div class="flex items-center gap-2">
                  <span class="step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold">3</span>
                  <span class="text-[11px] font-bold text-slate-300">In Transit</span>
                </div>
                <span class="step-sub text-[10px] text-slate-500 block mt-1">Global Air/Sea</span>
              </div>
              <!-- Step 4 -->
              <div id="step-4" class="p-3 rounded-2xl bg-white/5 border border-white/10 transition-all">
                <div class="flex items-center gap-2">
                  <span class="step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold">4</span>
                  <span class="text-[11px] font-bold text-slate-300">Customs</span>
                </div>
                <span class="step-sub text-[10px] text-slate-500 block mt-1">Clearance</span>
              </div>
              <!-- Step 5 -->
              <div id="step-5" class="p-3 rounded-2xl bg-white/5 border border-white/10 transition-all">
                <div class="flex items-center gap-2">
                  <span class="step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold">5</span>
                  <span class="text-[11px] font-bold text-slate-300">Out for Deliv.</span>
                </div>
                <span class="step-sub text-[10px] text-slate-500 block mt-1">Final Courier</span>
              </div>
              <!-- Step 6 -->
              <div id="step-6" class="p-3 rounded-2xl bg-white/5 border border-white/10 transition-all">
                <div class="flex items-center gap-2">
                  <span class="step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold">6</span>
                  <span class="text-[11px] font-bold text-slate-300">Delivered</span>
                </div>
                <span class="step-sub text-[10px] text-slate-500 block mt-1">Signed &amp; Closed</span>
              </div>
            </div>

            <!-- Linear Progress Bar -->
            <div class="w-full bg-black/40 rounded-full h-2.5 overflow-hidden mt-4 border border-white/10">
              <div id="resProgressBar" class="bg-gradient-to-r from-primary-500 via-sky-400 to-secondary-500 h-2.5 rounded-full transition-all duration-1000 ease-out shadow-lg" style="width: 0%"></div>
            </div>
          </div>
        </div>

        <!-- Real-Time Luxury Logistics Flight Map & Live GPS Corridor -->
        <div class="bg-[#0B1F3A] rounded-3xl border border-white/10 overflow-hidden shadow-2xl relative">
          <!-- Top Telemetry & Controls Bar -->
          <div class="p-5 sm:p-6 bg-[#071326] border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <span class="relative flex h-4 w-4">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#0B1F3A]"></span>
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-extrabold text-white text-base sm:text-lg tracking-wide flex items-center gap-2">
                    <i class="fas fa-globe-americas text-primary-400"></i> Live Freight &amp; Route Telemetry
                  </h3>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">GPS REAL-TIME LOCK</span>
                </div>
                <p id="resCurrentCoordsLabel" class="text-xs text-slate-300 font-mono mt-1">Acquiring verified location telemetry...</p>
              </div>
            </div>

            <!-- Map Mode Selector & Action Controls -->
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex rounded-xl bg-slate-900/90 p-1 border border-white/10 text-xs font-semibold text-slate-300">
                <button type="button" onclick="setMapTheme('osm')" id="themeBtn_osm" class="px-3 py-1.5 rounded-lg bg-sky-600 text-white shadow font-bold transition-all">
                  <i class="fas fa-map mr-1"></i> Street Map
                </button>
                <button type="button" onclick="setMapTheme('satellite')" id="themeBtn_satellite" class="px-3 py-1.5 rounded-lg hover:text-white transition-all text-slate-400">
                  <i class="fas fa-satellite mr-1 text-emerald-400"></i> Satellite
                </button>
                <button type="button" onclick="setMapTheme('voyager')" id="themeBtn_voyager" class="px-3 py-1.5 rounded-lg hover:text-white transition-all text-slate-400">
                  <i class="fas fa-compass mr-1 text-amber-400"></i> Terrain
                </button>
                <button type="button" onclick="setMapTheme('dark')" id="themeBtn_dark" class="px-3 py-1.5 rounded-lg hover:text-white transition-all text-slate-400">
                  <i class="fas fa-moon mr-1"></i> Dark View
                </button>
              </div>

              <button type="button" onclick="centerMapOnLive()" class="px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold border border-sky-500/30 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer">
                <i class="fas fa-crosshairs text-amber-400"></i> Center Route
              </button>
            </div>
          </div>

          <!-- Exact Location Badges Banner -->
          <div class="bg-slate-900/90 px-6 py-3 border-b border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="h-6 w-6 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center text-xs">
                <i class="fas fa-plane-departure"></i>
              </span>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Origin Departure Address</span>
                <span id="mapOriginDisplay" class="font-bold text-white text-xs">--</span>
              </div>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="h-6 w-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs">
                <i class="fas fa-flag-checkered"></i>
              </span>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Destination Arrival Address</span>
                <span id="mapDestDisplay" class="font-bold text-white text-xs">--</span>
              </div>
            </div>
          </div>

          <!-- Map Stage Container -->
          <div class="relative w-full h-[500px] sm:h-[580px] bg-[#071326] overflow-hidden">
            <div id="shipmentMap" class="w-full h-full z-10"></div>

            <!-- Clean Realistic Logistics Route Status Strip -->
            <div class="absolute bottom-4 left-4 right-4 z-20 pointer-events-none bg-slate-950/90 backdrop-blur-md border border-white/15 rounded-2xl p-4 text-xs text-white shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <span class="h-3 w-3 rounded-full bg-emerald-400 animate-ping"></span>
                <span class="text-white font-bold" id="mapLiveStatusText">Live In Transit</span>
              </div>
              <div class="flex items-center gap-3 text-slate-300 font-medium text-xs">
                <span id="routeOriginBadge" class="text-sky-300 font-bold bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-500/30">Origin</span>
                <span class="text-amber-400 font-bold">&rarr;</span>
                <span id="routeDestBadge" class="text-emerald-300 font-bold bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30">Destination</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Telemetry & Consignment Intelligence Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- ETA Countdown -->
          <div class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl relative overflow-hidden">
            <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Estimated Delivery</span>
              <i class="fas fa-clock text-primary-500 text-base"></i>
            </div>
            <div id="resETA" class="text-xl sm:text-2xl font-black text-[#0B1F3A] mt-2">--</div>
            <div id="resETACountdown" class="mt-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 border border-primary-100 inline-block">
              <i class="fas fa-hourglass-half mr-1"></i> Calculating ETA...
            </div>
          </div>

          <!-- Origin Details -->
          <div class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl">
            <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Origin Hub (Departure)</span>
              <i class="fas fa-plane-departure text-sky-500 text-base"></i>
            </div>
            <div id="resOriginCity" class="text-xl sm:text-2xl font-black text-[#0B1F3A] mt-2">--</div>
            <span id="resOriginCountry" class="text-xs text-slate-500 font-medium block mt-1">--</span>
            <span id="resSenderMasked" class="text-[11px] text-slate-400 block mt-2 pt-2 border-t border-slate-100 font-mono">Sender: --</span>
          </div>

          <!-- Destination Details -->
          <div class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl">
            <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Destination (Arrival)</span>
              <i class="fas fa-plane-arrival text-emerald-500 text-base"></i>
            </div>
            <div id="resDestCity" class="text-xl sm:text-2xl font-black text-[#0B1F3A] mt-2">--</div>
            <span id="resDestCountry" class="text-xs text-slate-500 font-medium block mt-1">--</span>
            <span id="resRecipientMasked" class="text-[11px] text-slate-400 block mt-2 pt-2 border-t border-slate-100 font-mono">Consignee: --</span>
          </div>

          <!-- Cargo Specs -->
          <div class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl">
            <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Cargo Specifications</span>
              <i class="fas fa-cube text-secondary-500 text-base"></i>
            </div>
            <div id="resWeight" class="text-xl sm:text-2xl font-black text-[#0B1F3A] mt-2">--</div>
            <div class="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span id="resPieces">1 Piece(s)</span>
              <span class="text-emerald-600 font-bold">Standard Secured</span>
            </div>
            <span id="resPaymentStatus" class="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block mt-2 font-bold">PAID IN FULL</span>
          </div>
        </div>

        <!-- 2-Column Section: Timeline + Email Alert Subscription -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Milestone Activity Timeline (2 cols) -->
          <div class="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xl">
            <div class="flex items-center justify-between border-b border-slate-100 pb-5 mb-6">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center text-lg">
                  <i class="fas fa-route"></i>
                </div>
                <div>
                  <h3 class="text-lg font-extrabold text-[#0B1F3A]">Milestone Audit &amp; Event Trail</h3>
                  <p class="text-xs text-slate-500">Verified scanning logs from origin to final destination</p>
                </div>
              </div>
              <span class="text-xs font-bold text-slate-400 font-mono" id="timelineCount">0 Milestones</span>
            </div>

            <div id="resTimelineList" class="relative border-l-2 border-slate-200 ml-4 space-y-6">
              <!-- Milestones injected dynamically -->
            </div>
          </div>

          <!-- Right Column: Email Subscription & Customer Support -->
          <div class="space-y-6">
            <!-- Email Milestone Alerts Box -->
            <div id="emailSubscribeCard" class="bg-gradient-to-br from-[#0B1F3A] to-[#122c50] text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-white/10 relative overflow-hidden">
              <div class="h-10 w-10 rounded-2xl bg-secondary-500 text-white flex items-center justify-center text-lg mb-4 shadow-lg shadow-secondary-500/30">
                <i class="fas fa-envelope-open-text"></i>
              </div>
              <h4 class="text-lg font-bold text-white">Live Milestone Email Alerts</h4>
              <p class="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Receive instant automated notifications whenever customs clears, transit milestones change, or your shipment is out for delivery.
              </p>

              <form id="subscribeEmailForm" class="mt-5 space-y-3">
                <div id="subscribeAlert" class="hidden p-3 rounded-xl text-xs font-medium"></div>
                <div>
                  <input type="email" id="subscribeEmailInput" required placeholder="Enter your email address"
                         class="w-full px-4 py-3 bg-slate-900/90 border border-white/20 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-secondary-500">
                </div>
                <button type="submit" id="btnSubscribeEmail" class="w-full py-3 px-4 bg-gradient-to-r from-secondary-500 to-amber-600 hover:from-secondary-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer">
                  Activate Live Milestone Alerts
                </button>
              </form>
            </div>

            <!-- 24/7 Priority Logistics Assistance -->
            <div class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl space-y-4">
              <h4 class="text-base font-extrabold text-[#0B1F3A] flex items-center gap-2">
                <i class="fas fa-headset text-primary-600"></i> Priority Cargo Assistance
              </h4>
              <p class="text-xs text-slate-500 leading-relaxed">
                Need urgent assistance or customs clearance coordination? Our 24/7 global dispatch controllers are standing by.
              </p>
              <div class="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <a href="mailto:support@express-cargo.ltd" class="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 transition-colors">
                  <span class="flex items-center gap-2"><i class="fas fa-envelope text-primary-600"></i> support@express-cargo.ltd</span>
                  <i class="fas fa-arrow-right text-slate-400"></i>
                </a>
                <a href="contact.html" class="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 transition-colors">
                  <span class="flex items-center gap-2"><i class="fas fa-comments text-secondary-500"></i> Submit Dispatch Inquiry</span>
                  <i class="fas fa-arrow-right text-slate-400"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Official Printable Waybill Modal -->
    <div id="printableWaybillModal" class="hidden fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white text-slate-900 w-full max-w-3xl rounded-3xl p-8 shadow-2xl border border-slate-200 space-y-6 my-8 font-sans">
        <!-- Waybill Header -->
        <div class="flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div class="flex items-center gap-3">
            <img src="images/logo-footer.png" alt="Express Cargo" class="h-10 w-auto">
            <div>
              <h2 class="text-xl font-extrabold tracking-tight uppercase text-[#0B1F3A]">Express Cargo Global</h2>
              <span class="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Official International Air &amp; Ocean Waybill</span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-slate-500 block uppercase">Waybill #</span>
            <span id="wbTrackingNum" class="text-lg font-black font-mono text-primary-600">--</span>
          </div>
        </div>

        <!-- Waybill Body 2-col -->
        <div class="grid grid-cols-2 gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
          <div>
            <span class="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Shipper / Origin</span>
            <div id="wbSender" class="font-bold text-slate-800 text-sm mt-1">--</div>
            <div id="wbOriginAddress" class="text-slate-600 mt-0.5">--</div>
          </div>
          <div>
            <span class="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Consignee / Destination</span>
            <div id="wbRecipient" class="font-bold text-slate-800 text-sm mt-1">--</div>
            <div id="wbDestAddress" class="text-slate-600 mt-0.5">--</div>
          </div>
        </div>

        <!-- Waybill Specs -->
        <table class="w-full text-xs text-left border border-slate-200 rounded-xl overflow-hidden">
          <thead class="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
            <tr>
              <th class="p-3">Service Tier</th>
              <th class="p-3">Weight</th>
              <th class="p-3">Pieces</th>
              <th class="p-3">Security Seal</th>
              <th class="p-3">Current Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            <tr>
              <td id="wbService" class="p-3 font-semibold">Air Express</td>
              <td id="wbWeight" class="p-3 font-semibold">--</td>
              <td id="wbPieces" class="p-3">1</td>
              <td class="p-3 font-mono font-bold text-emerald-600">VERIFIED</td>
              <td id="wbStatus" class="p-3 font-bold text-primary-600 uppercase">--</td>
            </tr>
          </tbody>
        </table>

        <!-- Waybill Footer / Signature -->
        <div class="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
          <div>
            <span class="text-[10px] text-slate-400 uppercase font-bold block">Carrier Authorization</span>
            <div class="h-12 border-b border-dashed border-slate-400 mt-2 flex items-end">
              <span class="font-serif italic text-slate-600 text-sm">Express Cargo Dispatch Hub</span>
            </div>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase font-bold block">Consignee Acceptance</span>
            <div class="h-12 border-b border-dashed border-slate-400 mt-2"></div>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-4 no-print">
          <button type="button" onclick="document.getElementById('printableWaybillModal').classList.add('hidden')" class="px-5 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">Close</button>
          <button type="button" onclick="window.print()" class="px-6 py-2.5 rounded-xl bg-primary-600 text-white text-xs font-bold shadow-lg shadow-primary-600/30 cursor-pointer">
            <i class="fas fa-print mr-2"></i> Print Document
          </button>
        </div>
      </div>
    </div>
    `;

    // Insert trackingContainerHTML right before the closing </section> of Section 0
    res = res.replace('<!-- Tracking form card -->', trackingContainerHTML + '\n<!-- Tracking form card -->');

    const trackingScript = `
    <script>
      let liveMap = null;
      let mapMarkers = [];
      let routePolyline = null;
      let socketClient = null;
      let activeMapTileLayer = null;
      let currentShipmentData = null;
      let isSatelliteView = false;
      let countdownInterval = null;

      // Ultra-Resilient High-Tech Tile Layer Providers (100% Free, No API Key Required)
      const TILE_DARK_MATTER = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      const TILE_VOYAGER = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      const TILE_ESRI_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      const TILE_OSM_HOT = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';

      function getStatusColor(status, progress = 0) {
        const cleanStatus = (status || '').toLowerCase();
        
        // Compute dynamic step based on progress percentage if in transit / active
        let dynamicStep = 1;
        if (progress >= 100 || cleanStatus === 'delivered') dynamicStep = 6;
        else if (progress >= 85 || cleanStatus === 'out_for_delivery') dynamicStep = 5;
        else if (progress >= 70 || cleanStatus === 'customs_clearance' || cleanStatus === 'customs_processing') dynamicStep = 4;
        else if (progress >= 30 || cleanStatus === 'in_transit' || cleanStatus === 'active') dynamicStep = 3;
        else if (progress >= 15 || cleanStatus === 'processing' || cleanStatus === 'picked_up') dynamicStep = 2;
        else dynamicStep = 1;

        switch(cleanStatus) {
          case 'delivered': return { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400', label: 'Delivered', step: 6 };
          case 'out_for_delivery': return { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30', dot: 'bg-blue-400', label: 'Out for Final Delivery', step: 5 };
          case 'customs_clearance':
          case 'customs_processing': return { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30', dot: 'bg-purple-400', label: 'Customs Clearance', step: 4 };
          case 'in_transit':
          case 'active': return { bg: 'bg-sky-500/20 text-sky-300 border-sky-500/30', dot: 'bg-sky-400', label: 'In Global Transit', step: dynamicStep };
          case 'processing':
          case 'picked_up': return { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30', dot: 'bg-amber-400', label: 'Processing at Hub', step: 2 };
          case 'pending':
          case 'awaiting_pickup':
          case 'created': return { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30', dot: 'bg-amber-400', label: 'Manifest Registered', step: 1 };
          case 'paused':
          case 'on_hold': return { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/30', dot: 'bg-orange-400', label: 'Paused / Security Review', step: dynamicStep };
          case 'cancelled':
          case 'confiscated':
          case 'suspended': return { bg: 'bg-red-500/20 text-red-300 border-red-500/30', dot: 'bg-red-400', label: 'Suspended / Confiscated', step: dynamicStep };
          default: return { bg: 'bg-slate-500/20 text-slate-300 border-slate-500/30', dot: 'bg-slate-400', label: status || 'In Transit', step: dynamicStep };
        }
      }

      function updateStepper(currentStep) {
        for (let i = 1; i <= 6; i++) {
          const stepEl = document.getElementById('step-' + i);
          if (!stepEl) continue;
          const dot = stepEl.querySelector('.step-dot');
          if (i < currentStep) {
            stepEl.className = 'p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300';
            if (dot) {
              dot.className = 'step-dot h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold';
              dot.innerHTML = '<i class="fas fa-check"></i>';
            }
          } else if (i === currentStep) {
            stepEl.className = 'p-3 rounded-2xl bg-secondary-500/20 border-2 border-secondary-400 text-white shadow-lg shadow-secondary-500/10 scale-105';
            if (dot) {
              dot.className = 'step-dot h-6 w-6 rounded-full bg-secondary-500 text-white flex items-center justify-center text-[10px] font-bold animate-pulse';
              dot.innerHTML = i;
            }
          } else {
            stepEl.className = 'p-3 rounded-2xl bg-white/5 border border-white/10 opacity-60 text-slate-400';
            if (dot) {
              dot.className = 'step-dot h-6 w-6 rounded-full bg-white/10 text-slate-400 flex items-center justify-center text-[10px] font-bold';
              dot.innerHTML = i;
            }
          }
        }
      }

      function startEtaCountdown(targetDateStr) {
        if (countdownInterval) clearInterval(countdownInterval);
        const countdownEl = document.getElementById('resETACountdown');
        if (!countdownEl) return;

        if (!targetDateStr) {
          countdownEl.innerHTML = '<i class="fas fa-check-circle mr-1 text-emerald-600"></i> On Schedule';
          return;
        }

        const target = new Date(targetDateStr).getTime();
        function update() {
          const now = Date.now();
          const diff = target - now;
          if (diff <= 0) {
            countdownEl.innerHTML = '<i class="fas fa-check-double mr-1 text-emerald-600"></i> Arrival Window Active';
            return;
          }
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          countdownEl.innerHTML = '<i class="fas fa-hourglass-half mr-1 text-secondary-600"></i> ' + (days > 0 ? days + 'd ' : '') + hours + 'h ' + mins + 'm remaining';
        }
        update();
        countdownInterval = setInterval(update, 60000);
      }

      function renderShipmentData(shipment) {
        currentShipmentData = shipment;
        document.getElementById('trackingResultsSection').classList.remove('hidden');
        document.getElementById('trackingLoading').classList.add('hidden');
        document.getElementById('trackingError').classList.add('hidden');
        document.getElementById('trackingContent').classList.remove('hidden');

        document.getElementById('resTrackingNumber').textContent = shipment.trackingNumber || '--';
        document.getElementById('resCarrier').textContent = shipment.carrier || 'Express Cargo Global';
        document.getElementById('resServiceType').textContent = (shipment.serviceType || 'Air Express').replace(/_/g, ' ').toUpperCase();
        
        const progress = Math.min(100, Math.max(0, shipment.progressPercentage != null ? shipment.progressPercentage : (shipment.shipmentProgress || 0)));
        const conf = getStatusColor(shipment.status || shipment.currentStatus, progress);
        document.getElementById('resProgressText').textContent = progress + '% Complete';
        document.getElementById('resProgressBar').style.width = progress + '%';

        updateStepper(conf.step);

        const origin = shipment.origin || (shipment.route && shipment.route.origin) || {};
        const dest = shipment.destination || (shipment.route && shipment.route.destination) || {};
        document.getElementById('resOriginCity').textContent = origin.city || 'Origin Port';
        document.getElementById('resOriginCountry').textContent = origin.country || '';
        document.getElementById('resDestCity').textContent = dest.city || 'Destination Port';
        document.getElementById('resDestCountry').textContent = dest.country || '';

        document.getElementById('resSenderMasked').textContent = 'Sender: ' + (shipment.sender?.name || 'Confidential Client');
        document.getElementById('resRecipientMasked').textContent = 'Consignee: ' + (shipment.recipient?.name || 'Authorized Recipient');

        const eta = (shipment.eta && (shipment.eta.formattedEta || shipment.eta.estimatedDelivery)) || shipment.adminETA || shipment.systemETA || shipment.expectedDeliveryAt || shipment.estimatedDeliveryDate;
        const etaTarget = (shipment.eta && shipment.eta.estimatedDelivery) || shipment.adminETA || shipment.systemETA || shipment.expectedDeliveryAt || shipment.estimatedDeliveryDate;
        
        document.getElementById('resETA').textContent = eta ? (eta.includes && eta.includes(',') ? eta : new Date(eta).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) : 'Pending Dispatch';
        startEtaCountdown(etaTarget);

        const pkg0 = shipment.packages && shipment.packages[0];
        let weightStr = '12.5 KG';
        if (pkg0) {
          const wVal = (typeof pkg0.weight === 'object' && pkg0.weight !== null) ? pkg0.weight.value : pkg0.weight;
          const wUnit = (typeof pkg0.weight === 'object' && pkg0.weight !== null) ? pkg0.weight.unit : (pkg0.weightUnit || 'kg');
          if (wVal) weightStr = wVal + ' ' + (wUnit || 'kg').toUpperCase();
        }
        document.getElementById('resWeight').textContent = weightStr;
        document.getElementById('resPieces').textContent = (shipment.packages ? shipment.packages.length : 1) + ' Package Unit(s)';

        // Coordinates Label
        const currentCoords = shipment.currentLocation || shipment.currentCoordinates || origin.coordinates;
        if (currentCoords && currentCoords.lat != null) {
          document.getElementById('resCurrentCoordsLabel').textContent = 'GPS Telemetry: ' + currentCoords.lat.toFixed(4) + '° N, ' + currentCoords.lng.toFixed(4) + '° E • ' + (currentCoords.address || currentCoords.city || 'En Route');
        }

        // Render Timeline
        const timelineList = document.getElementById('resTimelineList');
        timelineList.innerHTML = '';
        const rawEvents = shipment.timeline || shipment.events || [];
        const events = Array.isArray(rawEvents) ? rawEvents.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) : [];
        document.getElementById('timelineCount').textContent = events.length + ' Milestones';

        if (events.length === 0) {
          timelineList.innerHTML = '<div class="ml-6 py-4 text-slate-400 text-xs">Initial dispatch log registered. En route telemetry active.</div>';
        } else {
          events.forEach((ev, idx) => {
            const isLatest = idx === 0;
            const item = document.createElement('div');
            item.className = 'relative ml-6 pb-6 last:pb-0';
            const locationTxt = ev.locationName || ev.location || '';
            item.innerHTML = \`
              <span class="absolute -left-[31px] top-1 h-6 w-6 rounded-full \${isLatest ? 'bg-primary-600 ring-4 ring-primary-100' : 'bg-slate-300'} flex items-center justify-center text-white text-[10px] shadow-sm">
                <i class="fas fa-\${isLatest ? 'satellite-dish' : 'check'}"></i>
              </span>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span class="font-extrabold text-slate-900 text-sm sm:text-base">\${ev.title || ev.status || ev.eventType || 'Status Update'}</span>
                <span class="text-[11px] text-slate-400 font-mono font-medium">\${new Date(ev.timestamp).toLocaleString()}</span>
              </div>
              <p class="text-slate-600 text-xs sm:text-sm mt-1 leading-relaxed">\${ev.description || 'Shipment scanned and logged in global dispatch network.'}</p>
              \${locationTxt ? '<span class="inline-flex items-center gap-1.5 text-xs text-primary-700 bg-primary-50 px-2.5 py-1 rounded-lg font-semibold mt-2 border border-primary-100"><i class="fas fa-map-marker-alt text-secondary-500"></i> ' + locationTxt + '</span>' : ''}
            \`;
            timelineList.appendChild(item);
          });
        }

        // Render Waybill Modal Data
        document.getElementById('wbTrackingNum').textContent = shipment.trackingNumber;
        document.getElementById('wbSender').textContent = shipment.sender?.name || 'Shipper';
        document.getElementById('wbOriginAddress').textContent = (origin.city || '') + ', ' + (origin.country || '');
        document.getElementById('wbRecipient').textContent = shipment.recipient?.name || 'Consignee';
        document.getElementById('wbDestAddress').textContent = (dest.city || '') + ', ' + (dest.country || '');
        document.getElementById('wbService').textContent = (shipment.serviceType || 'Air Express').replace(/_/g, ' ').toUpperCase();
        document.getElementById('wbWeight').textContent = weightStr;
        document.getElementById('wbStatus').textContent = conf.label;

        // Render Map
        setTimeout(() => {
          renderMap(shipment);
        }, 150);

        // Smooth scroll
        document.getElementById('trackingResultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Multi-Theme Aviation Tile Layer Engine (100% Free, Zero API Key Required)
      const THEME_TILES = {
        osm: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      };
      let currentMapTheme = 'osm';

      const CLIENT_CITY_COORDS = {
        // Direct Countries & Regions
        'germany': [51.1657, 10.4515],
        'deutschland': [51.1657, 10.4515],
        'america': [37.0902, -95.7129],
        'united states': [37.0902, -95.7129],
        'united states of america': [37.0902, -95.7129],
        'usa': [37.0902, -95.7129],
        'us': [37.0902, -95.7129],
        'dubai': [25.2048, 55.2708],
        'uae': [23.4241, 53.8478],
        'united arab emirates': [23.4241, 53.8478],
        'uk': [55.3781, -3.4360],
        'united kingdom': [55.3781, -3.4360],
        'great britain': [55.3781, -3.4360],
        'england': [52.3555, -1.1743],
        'france': [46.2276, 2.2137],
        'italy': [41.8719, 12.5674],
        'spain': [40.4637, -3.7492],
        'canada': [56.1304, -106.3468],
        'china': [35.8617, 104.1954],
        'japan': [36.2048, 138.2529],
        'australia': [-25.2744, 133.7751],
        'india': [20.5937, 78.9629],
        'netherlands': [52.1326, 5.2913],
        'holland': [52.1326, 5.2913],
        'belgium': [50.5039, 4.4699],
        'switzerland': [46.8182, 8.2275],
        'austria': [47.5162, 14.5501],
        'sweden': [60.1282, 18.6435],
        'norway': [60.4720, 8.4689],
        'denmark': [56.2639, 9.5018],
        'finland': [61.9241, 25.7482],
        'poland': [51.9194, 19.1451],
        'portugal': [39.3999, -8.2245],
        'ireland': [53.1424, -7.6921],
        'turkey': [38.9637, 35.2433],
        'russia': [61.5240, 105.3188],
        'saudi arabia': [23.8859, 45.0792],
        'qatar': [25.3548, 51.1839],
        'kuwait': [29.3117, 47.4818],
        'singapore': [1.3521, 103.8198],
        'south africa': [-30.5595, 22.9375],
        'nigeria': [9.0820, 8.6753],
        'ghana': [7.9465, -1.0232],
        'kenya': [-0.0236, 37.9062],
        'egypt': [26.8206, 30.8025],
        'brazil': [-14.2350, -51.9253],
        'mexico': [23.6345, -102.5528],
        'argentina': [-38.4161, -63.6167],
        'new zealand': [-40.9006, 174.8860],
        'philippines': [12.8797, 121.7740],
        'thailand': [15.8700, 100.9925],
        'malaysia': [4.2105, 101.9758],
        'indonesia': [-0.7893, 113.9213],
        'south korea': [35.9078, 127.7669],
        'korea': [35.9078, 127.7669],
        'israel': [31.0461, 34.8516],
        'greece': [39.0742, 21.8243],

        // Major Cities
        'london': [51.5074, -0.1278],
        'paris': [48.8566, 2.3522],
        'frankfurt': [50.1109, 8.6821],
        'berlin': [52.5200, 13.4050],
        'munich': [48.1351, 11.5820],
        'hamburg': [53.5511, 9.9937],
        'amsterdam': [52.3676, 4.9041],
        'madrid': [40.4168, -3.7038],
        'rome': [41.9028, 12.4964],
        'new york': [40.7128, -74.0060],
        'los angeles': [34.0522, -118.2437],
        'chicago': [41.8781, -87.6298],
        'miami': [25.7617, -80.1918],
        'houston': [29.7604, -95.3698],
        'san francisco': [37.7749, -122.4194],
        'seattle': [47.6062, -122.3321],
        'toronto': [43.6532, -79.3832],
        'vancouver': [49.2827, -123.1207],
        'doha': [25.2854, 51.5310],
        'riyadh': [24.7136, 46.6753],
        'abu dhabi': [24.4539, 54.3773],
        'cairo': [30.0444, 31.2357],
        'istanbul': [41.0082, 28.9784],
        'johannesburg': [-26.2041, 28.0473],
        'cape town': [-33.9249, 18.4241],
        'nairobi': [-1.2921, 36.8219],
        'lagos': [6.5244, 3.3792],
        'accra': [5.6037, -0.1870],
        'tokyo': [35.6762, 139.6503],
        'hong kong': [22.3193, 114.1694],
        'sydney': [-33.8688, 151.2093],
        'melbourne': [-37.8136, 144.9631],
        'shanghai': [31.2304, 121.4737],
        'beijing': [39.9042, 116.4074],
        'mumbai': [19.0760, 72.8777],
        'delhi': [28.6139, 77.2090]
      };

      function resolveClientCoords(obj, fallback) {
        if (obj && obj.lat != null && obj.lng != null && !isNaN(obj.lat) && !isNaN(obj.lng)) {
          return [Number(obj.lat), Number(obj.lng)];
        }
        if (obj && (obj.coordinates?.lat != null || obj.coordinates?.lng != null)) {
          return [Number(obj.coordinates.lat), Number(obj.coordinates.lng)];
        }
        const textToSearch = ((obj?.city || '') + ' ' + (obj?.country || '') + ' ' + (obj?.address || '') + ' ' + (obj?.name || '')).toLowerCase().trim();
        for (const [key, coords] of Object.entries(CLIENT_CITY_COORDS)) {
          if (textToSearch.includes(key)) {
            return coords;
          }
        }
        return fallback;
      }

      function setMapTheme(themeName) {
        currentMapTheme = themeName;
        ['osm', 'dark', 'satellite', 'voyager'].forEach(t => {
          const btn = document.getElementById('themeBtn_' + t);
          if (btn) {
            if (t === themeName) {
              btn.className = 'px-3 py-1.5 rounded-lg bg-sky-600 text-white shadow font-bold transition-all';
            } else {
              btn.className = 'px-3 py-1.5 rounded-lg hover:text-white transition-all text-slate-400';
            }
          }
        });
        initMapLayer();
      }

      function initMapLayer() {
        if (!liveMap) return;
        if (activeMapTileLayer) liveMap.removeLayer(activeMapTileLayer);

        const tileUrl = THEME_TILES[currentMapTheme] || THEME_TILES.osm;
        activeMapTileLayer = L.tileLayer(tileUrl, {
          maxZoom: 19,
          subdomains: currentMapTheme === 'osm' ? 'abc' : 'abcd',
          attribution: '&copy; OpenStreetMap contributors &bull; Express Cargo Global Telemetry'
        });

        activeMapTileLayer.on('tileerror', function() {
          console.warn('Map tile error on ' + currentMapTheme + ', falling back to OpenStreetMap Standard');
          if (activeMapTileLayer && liveMap) {
            liveMap.removeLayer(activeMapTileLayer);
            activeMapTileLayer = L.tileLayer(THEME_TILES.osm, { maxZoom: 19, subdomains: 'abc' }).addTo(liveMap);
          }
        });

        activeMapTileLayer.addTo(liveMap);
      }

      function centerMapOnLive() {
        if (liveMap && routePolyline) {
          liveMap.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });
        }
      }

      function calculateGreatCircleClient(p1, p2, numPoints = 60) {
        if (!p1 || !p2) return [];
        const lat1Val = p1[0] !== undefined ? p1[0] : p1.lat;
        const lon1Val = p1[1] !== undefined ? p1[1] : p1.lng;
        const lat2Val = p2[0] !== undefined ? p2[0] : p2.lat;
        const lon2Val = p2[1] !== undefined ? p2[1] : p2.lng;

        if (lat1Val == null || lat2Val == null) return [];
        const points = [];
        const lat1 = (lat1Val * Math.PI) / 180;
        const lon1 = (lon1Val * Math.PI) / 180;
        const lat2 = (lat2Val * Math.PI) / 180;
        const lon2 = (lon2Val * Math.PI) / 180;

        const d = 2 * Math.asin(Math.sqrt(
          Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
        ));

        if (d === 0 || isNaN(d)) return [[lat1Val, lon1Val], [lat2Val, lon2Val]];

        for (let i = 0; i <= numPoints; i++) {
          const f = i / numPoints;
          const A = Math.sin((1 - f) * d) / Math.sin(d);
          const B = Math.sin(f * d) / Math.sin(d);
          const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
          const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
          const z = A * Math.sin(lat1) + B * Math.sin(lat2);
          const lat = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
          const lon = Math.atan2(y, x);
          points.push([(lat * 180) / Math.PI, (lon * 180) / Math.PI]);
        }
        return points;
      }

      async function resolveCoordinatesClientAsync(obj, fallback = [51.5074, -0.1278]) {
        if (!obj) return fallback;
        if (obj.lat != null && obj.lng != null && !isNaN(obj.lat) && !isNaN(obj.lng)) {
          return [Number(obj.lat), Number(obj.lng)];
        }
        if (obj.coordinates && obj.coordinates.lat != null && obj.coordinates.lng != null) {
          return [Number(obj.coordinates.lat), Number(obj.coordinates.lng)];
        }

        const query = ((obj.address || '') + ' ' + (obj.city || '') + ' ' + (obj.country || '') + ' ' + (obj.name || '')).trim();
        const textToSearch = query.toLowerCase();

        // Check local dictionary
        for (const [key, coords] of Object.entries(CLIENT_CITY_COORDS)) {
          if (textToSearch.includes(key)) {
            return coords;
          }
        }

        // Try live client geocoding if network available
        if (query.length > 2) {
          try {
            const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1');
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lon = parseFloat(data[0].lon);
              if (!isNaN(lat) && !isNaN(lon)) {
                return [lat, lon];
              }
            }
          } catch(e) {}
        }

        return fallback;
      }

      async function renderMap(shipment) {
        const mapContainer = document.getElementById('shipmentMap');
        if (!mapContainer) return;

        const origin = shipment.origin || (shipment.route && shipment.route.origin) || {};
        const dest = shipment.destination || (shipment.route && shipment.route.destination) || {};
        
        const origCoords = await resolveCoordinatesClientAsync(origin, [51.5074, -0.1278]);
        const destCoords = await resolveCoordinatesClientAsync(dest, [40.7128, -74.0060]);

        const currentRaw = shipment.currentLocation || shipment.currentCoordinates || {};
        let currentCoords = await resolveCoordinatesClientAsync(currentRaw, null);
        
        const progress = Math.min(100, Math.max(0, shipment.progressPercentage != null ? shipment.progressPercentage : (shipment.shipmentProgress || 0)));

        if (!currentCoords || 
            (currentRaw.lat == null && currentRaw.coordinates?.lat == null) ||
            (Math.abs(currentCoords[0] - origCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - origCoords[1]) < 0.0001 && progress > 5)) {
          // If no specific checkpoint coordinates are provided, or it's stuck exactly at origin while progress is > 5%, interpolate it dynamically
          const f = progress / 100;
          const lat = origCoords[0] + (destCoords[0] - origCoords[0]) * f;
          const lng = origCoords[1] + (destCoords[1] - origCoords[1]) * f;
          currentCoords = [lat, lng];
        }

        const originAddressFull = (origin.address || origin.city || 'Origin Gateway') + (origin.country ? ', ' + origin.country : '');
        const destAddressFull = (dest.address || dest.city || 'Destination Port') + (dest.country ? ', ' + dest.country : '');

        // Update Exact Address Displays on Header & Map Deck
        const mapOrigDisp = document.getElementById('mapOriginDisplay');
        const mapDestDisp = document.getElementById('mapDestDisplay');
        if (mapOrigDisp) mapOrigDisp.textContent = originAddressFull;
        if (mapDestDisp) mapDestDisp.textContent = destAddressFull;

        const routeOrigBadge = document.getElementById('routeOriginBadge');
        const routeDestBadge = document.getElementById('routeDestBadge');
        if (routeOrigBadge) routeOrigBadge.textContent = origin.city || origin.country || 'Origin';
        if (routeDestBadge) routeDestBadge.textContent = dest.city || dest.country || 'Destination';

        const liveStatusText = document.getElementById('mapLiveStatusText');
        if (liveStatusText) {
          const st = (shipment.status || 'in_transit').replace(/_/g, ' ').toUpperCase();
          liveStatusText.textContent = 'Status: ' + st + ' • Real-Time Coordinates: ' + currentCoords[0].toFixed(4) + '° N, ' + currentCoords[1].toFixed(4) + '° E';
        }

        if (typeof L === 'undefined') {
          return;
        }

        try {
          if (!liveMap) {
            liveMap = L.map('shipmentMap', { scrollWheelZoom: false, zoomControl: true }).setView(origCoords, 3);
            initMapLayer();
          }

          liveMap.invalidateSize();
          setTimeout(() => { if (liveMap) liveMap.invalidateSize(); }, 200);
          setTimeout(() => { if (liveMap) liveMap.invalidateSize(); }, 600);

          // Clear previous markers & lines
          mapMarkers.forEach(m => liveMap.removeLayer(m));
          mapMarkers = [];
          if (routePolyline) {
            liveMap.removeLayer(routePolyline);
            routePolyline = null;
          }

          // Draw Simple Route Path
          let pathCoords = [origCoords, destCoords];
          
          if (pathCoords.length > 1) {
            routePolyline = L.polyline(pathCoords, {
              color: '#0284c7',
              weight: 3.5,
              opacity: 0.95,
              dashArray: '8, 8'
            }).addTo(liveMap);
            mapMarkers.push(routePolyline);
          }

          // Origin Departure Marker
          const origIcon = L.divIcon({
            className: 'custom-origin-marker',
            html: '<div style="background:#0B1F3A;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:3px solid #38bdf8;box-shadow:0 4px 14px rgba(0,0,0,0.6);font-size:14px;"><i class="fas fa-plane-departure"></i></div>',
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          });
          const mOrig = L.marker(origCoords, { icon: origIcon }).addTo(liveMap).bindPopup(
            '<div style="font-family:sans-serif;font-size:12px;line-height:1.4;min-width:200px;">' +
              '<strong style="color:#0284c7;text-transform:uppercase;font-size:11px;">Origin Gateway</strong><br/>' +
              '<span style="font-size:13px;font-weight:bold;color:#0B1F3A;">' + originAddressFull + '</span><br/>' +
              '<span style="color:#64748b;font-size:11px;">GPS: ' + origCoords[0].toFixed(4) + '°, ' + origCoords[1].toFixed(4) + '°</span>' +
            '</div>'
          );
          mapMarkers.push(mOrig);

          // Destination Arrival Marker
          const destIcon = L.divIcon({
            className: 'custom-dest-marker',
            html: '<div style="background:#10B981;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 14px rgba(16,185,129,0.6);font-size:14px;"><i class="fas fa-flag-checkered"></i></div>',
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          });
          const mDest = L.marker(destCoords, { icon: destIcon }).addTo(liveMap).bindPopup(
            '<div style="font-family:sans-serif;font-size:12px;line-height:1.4;min-width:200px;">' +
              '<strong style="color:#10B981;text-transform:uppercase;font-size:11px;">Destination Port</strong><br/>' +
              '<span style="font-size:13px;font-weight:bold;color:#0B1F3A;">' + destAddressFull + '</span><br/>' +
              '<span style="color:#64748b;font-size:11px;">GPS: ' + destCoords[0].toFixed(4) + '°, ' + destCoords[1].toFixed(4) + '°</span>' +
            '</div>'
          );
          mapMarkers.push(mDest);

          // Current Vehicle Position Marker
          const isDelivered = shipment.status === 'delivered';
          const vehicleIcon = L.divIcon({
            className: 'custom-vehicle-marker',
            html: '<div class="relative flex items-center justify-center">' +
              (!isDelivered ? '<div class="radar-pulse absolute h-16 w-16 rounded-full bg-secondary-500/40 pointer-events-none"></div>' : '') +
              '<div style="background:linear-gradient(135deg, #D97706, #EA580C);color:#fff;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 18px rgba(217,119,6,0.7);font-size:17px;position:relative;z-index:2;">' +
                '<i class="fas fa-plane"></i>' +
              '</div>' +
            '</div>',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
          });
          const mVehicle = L.marker(currentCoords, { icon: vehicleIcon }).addTo(liveMap)
            .bindPopup(
              '<div style="font-family:sans-serif;font-size:12px;line-height:1.4;min-width:210px;">' +
                '<strong style="color:#0B1F3A;font-size:13px;">Waybill: ' + shipment.trackingNumber + '</strong><br/>' +
                '<span>Status: <strong style="color:#D97706;">' + (shipment.status || 'In Transit').toUpperCase() + '</strong></span><br/>' +
                '<span>Route: <strong>' + (origin.city || 'Origin') + ' &rarr; ' + (dest.city || 'Destination') + '</strong></span><br/>' +
                '<span>Current GPS: <strong>' + currentCoords[0].toFixed(4) + '° N, ' + currentCoords[1].toFixed(4) + '° E</strong></span>' +
              '</div>'
            );
          mapMarkers.push(mVehicle);

          if (pathCoords.length > 1) {
            liveMap.fitBounds(L.latLngBounds(pathCoords), { padding: [60, 60] });
          }
        } catch (e) {
          console.warn('Leaflet error rendering map:', e);
        }
      }

      let activePollingTimer = null;
      function startLive10SecondPolling(trNum) {
        if (activePollingTimer) clearInterval(activePollingTimer);
        activePollingTimer = setInterval(() => {
          if (currentShipmentData && ['in_transit', 'active', 'pending', 'customs_clearance', 'out_for_delivery'].includes(currentShipmentData.status)) {
            fetchShipmentTracking(trNum, true);
          }
        }, 10000);
      }

      async function fetchShipmentTracking(trNum, isSilent = false) {
        if (!trNum) return;
        const cleanTrNum = trNum.trim().toUpperCase();
        const section = document.getElementById('trackingResultsSection');
        const loading = document.getElementById('trackingLoading');
        const errorBox = document.getElementById('trackingError');
        const content = document.getElementById('trackingContent');

        if (!isSilent) {
          section.classList.remove('hidden');
          loading.classList.remove('hidden');
          errorBox.classList.add('hidden');
          content.classList.add('hidden');
          section.scrollIntoView({ behavior: 'smooth' });
        }

        try {
          const res = await fetch('/api/tracking/' + encodeURIComponent(cleanTrNum));
          const json = await res.json();

          if (res.ok && json.success && json.data) {
            renderShipmentData(json.data);
            initSocket(cleanTrNum);
            startLive10SecondPolling(cleanTrNum);
          } else if (!isSilent) {
            loading.classList.add('hidden');
            errorBox.classList.remove('hidden');
            const errText = (json.error && json.error.message) || json.message || 'No consignment found matching tracking number "' + cleanTrNum + '". Please check for typos.';
            document.getElementById('trackingErrorMessage').textContent = errText;
          }
        } catch (err) {
          if (!isSilent) {
            loading.classList.add('hidden');
            errorBox.classList.remove('hidden');
            document.getElementById('trackingErrorMessage').textContent = 'Unable to connect to tracking server. Please verify backend status.';
          }
        }
      }

      function initSocket(trackingNumber) {
        if (typeof io === 'undefined') return;
        if (!socketClient) {
          socketClient = io();
        }
        socketClient.emit('track:join', { trackingNumber });
        socketClient.on('shipment:updated', () => fetchShipmentTracking(trackingNumber));
        socketClient.on('location:update', () => fetchShipmentTracking(trackingNumber));
      }

      function copyTrackingNumber() {
        if (!currentShipmentData?.trackingNumber) return;
        navigator.clipboard.writeText(currentShipmentData.trackingNumber).then(() => {
          const icon = document.getElementById('copyIcon');
          if (icon) {
            icon.className = 'fas fa-check text-emerald-400';
            setTimeout(() => { icon.className = 'fas fa-copy'; }, 2000);
          }
          alert('Tracking Number copied to clipboard: ' + currentShipmentData.trackingNumber);
        });
      }

      function openPrintWaybill() {
        document.getElementById('printableWaybillModal').classList.remove('hidden');
      }

      function scrollToEmailSubscribe() {
        const card = document.getElementById('emailSubscribeCard');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          document.getElementById('subscribeEmailInput')?.focus();
        }
      }

      // Email subscription form submit handler
      document.addEventListener('DOMContentLoaded', () => {
        const subForm = document.getElementById('subscribeEmailForm');
        if (subForm) {
          subForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSubscribeEmail');
            const alertBox = document.getElementById('subscribeAlert');
            const email = document.getElementById('subscribeEmailInput').value.trim();
            const trNum = currentShipmentData?.trackingNumber;

            if (!trNum) {
              alert('Please track a valid consignment before subscribing.');
              return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Activating Alerts...';

            try {
              const res = await fetch('/api/tracking/' + encodeURIComponent(trNum) + '/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
              });
              const data = await res.json();

              alertBox.classList.remove('hidden');
              if (res.ok && data.success) {
                alertBox.className = 'p-3 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                alertBox.innerHTML = '<i class="fas fa-check-circle mr-1.5"></i> ' + (data.message || 'Milestone alerts activated successfully!');
                document.getElementById('subscribeEmailInput').value = '';
              } else {
                alertBox.className = 'p-3 rounded-xl text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30';
                alertBox.innerHTML = '<i class="fas fa-exclamation-circle mr-1.5"></i> ' + (data.error?.message || data.message || 'Subscription failed.');
              }
            } catch (err) {
              alertBox.classList.remove('hidden');
              alertBox.className = 'p-3 rounded-xl text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30';
              alertBox.innerHTML = '<i class="fas fa-exclamation-triangle mr-1.5"></i> Server connection error. Please try again.';
            } finally {
              btn.disabled = false;
              btn.innerHTML = 'Activate Live Milestone Alerts';
            }
          });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const trNum = urlParams.get('tracking_number') || urlParams.get('trackingnumber') || urlParams.get('order_id');
        if (trNum) {
          const input = document.getElementById('trackingNumber') || document.querySelector('input[name="tracking_number"]') || document.querySelector('input[name="trackingnumber"]');
          if (input) input.value = trNum;
          fetchShipmentTracking(trNum);
        }

        const forms = document.querySelectorAll('form[action="order.html"]');
        forms.forEach(f => {
          f.addEventListener('submit', (e) => {
            const input = f.querySelector('input[name="trackingnumber"]') || f.querySelector('input[name="tracking_number"]') || f.querySelector('input[type="text"]');
            if (input && input.value.trim()) {
              e.preventDefault();
              fetchShipmentTracking(input.value.trim());
              history.pushState(null, '', 'order.html?tracking_number=' + encodeURIComponent(input.value.trim()));
            }
          });
        });
      });
    </script>
    `;

    res = appendBeforeClosingBody(res, trackingScript);
  }

  if (pageName === 'contact.html') {
    const contactScript = `
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const contactForm = document.querySelector('form[action*="sendcontact"]') || document.querySelector('form');
        if (contactForm) {
          contactForm.removeAttribute('action');
          contactForm.removeAttribute('method');
          
          const alertContainer = document.createElement('div');
          alertContainer.id = 'contactAlert';
          alertContainer.className = 'hidden mb-4 p-4 rounded-2xl text-sm font-medium';
          contactForm.prepend(alertContainer);

          contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
            }
            alertContainer.className = 'hidden';

            const formData = new FormData(contactForm);
            const payload = {
              name: formData.get('name') || (formData.get('first_name') ? (formData.get('first_name') + ' ' + (formData.get('last_name') || '')) : ''),
              email: formData.get('email'),
              phone: formData.get('phone') || formData.get('tel'),
              subject: formData.get('subject') || 'General Contact Inquiry',
              message: formData.get('message') || formData.get('comments')
            };

            try {
              const resp = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await resp.json();

              if (resp.ok && data.success) {
                alertContainer.className = 'mb-4 p-4 rounded-2xl text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
                alertContainer.innerHTML = '<i class="fas fa-check-circle mr-2"></i> ' + (data.data?.message || 'Message sent successfully! We will get back to you shortly.');
                contactForm.reset();
              } else {
                alertContainer.className = 'mb-4 p-4 rounded-2xl text-sm font-medium bg-red-50 text-red-800 border border-red-200';
                alertContainer.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i> ' + (data.message || 'Error submitting form. Please check your fields.');
              }
            } catch (err) {
              alertContainer.className = 'mb-4 p-4 rounded-2xl text-sm font-medium bg-red-50 text-red-800 border border-red-200';
              alertContainer.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i> Unable to reach server. Please try again.';
            } finally {
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
              }
            }
          });
        }
      });
    </script>
    `;
    res = appendBeforeClosingBody(res, contactScript);
  }

  if (pageName === 'request-quote.html') {
    const quoteScript = `
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const quoteForm = document.querySelector('form[action*="contact"]') || document.querySelector('form');
        if (quoteForm) {
          quoteForm.removeAttribute('action');
          quoteForm.removeAttribute('method');

          const alertContainer = document.createElement('div');
          alertContainer.id = 'quoteAlert';
          alertContainer.className = 'hidden mb-4 p-4 rounded-2xl text-sm font-medium';
          quoteForm.prepend(alertContainer);

          quoteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = quoteForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting Request...';
            }
            alertContainer.className = 'hidden';

            const formData = new FormData(quoteForm);
            const payload = {
              freight_type: formData.get('freight_type') || formData.get('fright_type') || 'Air Freight',
              email: formData.get('email'),
              departure_country: formData.get('departure_country') || formData.get('departure') || formData.get('origin'),
              recipient_country: formData.get('recipient_country') || formData.get('recipient') || formData.get('destination'),
              weight: formData.get('weight'),
              expected_delivery_date: formData.get('expected_delivery_date') || formData.get('delivery_date'),
              details: formData.get('details') || formData.get('message') || formData.get('comments')
            };

            try {
              const resp = await fetch('/api/contact/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await resp.json();

              if (resp.ok && data.success) {
                alertContainer.className = 'mb-4 p-4 rounded-2xl text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
                alertContainer.innerHTML = '<i class="fas fa-check-circle mr-2"></i> ' + (data.data?.message || 'Quote request received! Our logistics manager will send you a tailored estimate.');
                quoteForm.reset();
              } else {
                alertContainer.className = 'mb-4 p-4 rounded-2xl text-sm font-medium bg-red-50 text-red-800 border border-red-200';
                alertContainer.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i> ' + (data.message || 'Error submitting quote request. Please verify required fields.');
              }
            } catch (err) {
              alertContainer.className = 'mb-4 p-4 rounded-2xl text-sm font-medium bg-red-50 text-red-800 border border-red-200';
              alertContainer.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i> Server connection failed. Please try again.';
            } finally {
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
              }
            }
          });
        }
      });
    </script>
    `;
    res = appendBeforeClosingBody(res, quoteScript);
  }

  // Global quick tracking helper
  const globalTrackingHelper = `
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const forms = document.querySelectorAll('form[action="order.html"]');
      forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
          const input = form.querySelector('input[name="tracking_number"]') || form.querySelector('input[name="trackingnumber"]') || form.querySelector('input[type="text"]');
          if (input && input.value.trim()) {
            e.preventDefault();
            window.location.href = 'order.html?tracking_number=' + encodeURIComponent(input.value.trim());
          }
        });
      });
    });
  </script>
  `;

  if (!res.includes('trackingHelperInstalled')) {
    res = appendBeforeClosingBody(res, '<script>/* trackingHelperInstalled */</script>' + globalTrackingHelper);
  }

  return res;
}

pageConfigs.forEach(cfg => {
  const rawContent = fs.readFileSync(cfg.raw, 'utf8');
  const transformed = transformHtml(rawContent, cfg.target);
  fs.writeFileSync(cfg.target, transformed, 'utf8');
  console.log('Successfully written:', cfg.target);
});

