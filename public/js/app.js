// public/js/app.js - AeroTrack Real-Time Telemetry & Interactive Map Engine

(function () {
  'use strict';

  // Dedicated Hardware Tracker (Single-device platform)
  const HARDCODED_IMEI = '860465040325932';

  // State Management
  const state = {
    ws: null,
    wsConnected: false,
    activeImei: HARDCODED_IMEI,
    devices: new Map(),
    currentLocation: null,
    currentSpeed: 0,
    maxSpeed: 0,
    speedSum: 0,
    speedCount: 0,
    totalDistanceMeters: 0,
    packetCounter: 0,
    mode: 'live', // 'live' or 'history'
    liveFollow: true,
    trailCoordinates: [],
    historyPoints: [],
    historyIndex: 0,
    historyPlaying: false,
    historySpeedMult: 1,
    historyTimer: null
  };

  // Ensure any past calibration offsets are cleared
  try {
    localStorage.removeItem('y2507_calibration_offset');
  } catch (e) {}

  // DOM Elements
  const el = {
    deviceSelect: document.getElementById('deviceSelect'),
    liveModeBtn: document.getElementById('liveModeBtn'),
    historyModeBtn: document.getElementById('historyModeBtn'),
    logToggleBtn: document.getElementById('logToggleBtn'),
    // Header Status & Controls
    refreshLocationBtn: document.getElementById('refreshLocationBtn'),
    refreshSpinner: document.getElementById('refreshSpinner'),
    refreshBtnText: document.getElementById('refreshBtnText'),
    trackerStatusDot: document.getElementById('trackerStatusDot'),
    trackerStatusTitle: document.getElementById('trackerStatusTitle'),
    trackerLastSeenSub: document.getElementById('trackerLastSeenSub'),
    connectionState: document.getElementById('connectionState'),
    serverStatusBadge: document.getElementById('serverStatusBadge'),

    // Settings & Controls Section
    settingsToggleBtn: document.getElementById('settingsToggleBtn'),
    settingsDropdown: document.getElementById('settingsDropdown'),
    settingsCloseBtn: document.getElementById('settingsCloseBtn'),
    settingsActiveLayerTag: document.getElementById('settingsActiveLayerTag'),
    
    // HUD
    hudRefreshBtn: document.getElementById('hudRefreshBtn'),
    hudSpeed: document.getElementById('hudSpeed'),
    speedGaugeArc: document.getElementById('speedGaugeArc'),
    speedState: document.getElementById('speedState'),
    hudAcc: document.getElementById('hudAcc'),
    hudBattery: document.getElementById('hudBattery'),
    hudSats: document.getElementById('hudSats'),
    hudHeading: document.getElementById('hudHeading'),
    hudCoords: document.getElementById('hudCoords'),
    gmapsNavBtn: document.getElementById('gmapsNavBtn'),
    signalBars: document.getElementById('signalBars'),
    
    // Stats
    statDistance: document.getElementById('statDistance'),
    statMaxSpeed: document.getElementById('statMaxSpeed'),
    statAvgSpeed: document.getElementById('statAvgSpeed'),
    statPackets: document.getElementById('statPackets'),
    recenterBtn: document.getElementById('recenterBtn'),
    clearTrailBtn: document.getElementById('clearTrailBtn'),
    
    // History Player
    historyPlayerBar: document.getElementById('historyPlayerBar'),
    replayPlayBtn: document.getElementById('replayPlayBtn'),
    replayPauseBtn: document.getElementById('replayPauseBtn'),
    replayResetBtn: document.getElementById('replayResetBtn'),
    replayScrubber: document.getElementById('replayScrubber'),
    replayCurrentTime: document.getElementById('replayCurrentTime'),
    replayTotalTime: document.getElementById('replayTotalTime'),
    replayFrameCount: document.getElementById('replayFrameCount'),
    exitHistoryBtn: document.getElementById('exitHistoryBtn'),
    
    // Terminal
    terminalDrawer: document.getElementById('terminalDrawer'),
    terminalBody: document.getElementById('terminalBody'),
    termPacketCount: document.getElementById('termPacketCount'),
    termClearBtn: document.getElementById('termClearBtn'),
    termCloseBtn: document.getElementById('termCloseBtn'),
    
    // SOS Alert
    sosAlertModal: document.getElementById('sosAlertModal'),
    sosDetails: document.getElementById('sosDetails'),
    sosCoords: document.getElementById('sosCoords'),
    sosDismissBtn: document.getElementById('sosDismissBtn'),

    // Quick Action Bar Buttons
    quickTriggerSosBtn: document.getElementById('quickTriggerSosBtn'),

    // SOS Configuration Modal
    sosConfigBtn: document.getElementById('sosConfigBtn'),
    sosConfigModal: document.getElementById('sosConfigModal'),
    sosModalCloseBtn: document.getElementById('sosModalCloseBtn'),
    sosPhoneInput: document.getElementById('sosPhoneInput'),
    sosSaveBtn: document.getElementById('sosSaveBtn'),
    sosConfigStatus: document.getElementById('sosConfigStatus'),
    smsCommandPreview: document.getElementById('smsCommandPreview'),

    // Tracker Heartbeat Modal
    heartbeatModal: document.getElementById('heartbeatModal'),
    heartbeatModalCloseBtn: document.getElementById('heartbeatModalCloseBtn'),
    hbModalDot: document.getElementById('hbModalDot'),
    hbModalTitle: document.getElementById('hbModalTitle'),
    hbModalState: document.getElementById('hbModalState'),
    hbModalImei: document.getElementById('hbModalImei'),
    hbModalRemote: document.getElementById('hbModalRemote'),
    hbModalLastSeen: document.getElementById('hbModalLastSeen'),
    hbModalLastHb: document.getElementById('hbModalLastHb'),
    hbModalBatt: document.getElementById('hbModalBatt'),
    hbModalAcc: document.getElementById('hbModalAcc'),
    hbModalPackets: document.getElementById('hbModalPackets'),
    hbCheckNowBtn: document.getElementById('hbCheckNowBtn'),

    // Toast Container
    appToastContainer: document.getElementById('appToastContainer')
  };

  // Leaflet Map & Layer References
  let map = null;
  let vehicleMarker = null;
  let trailPolyline = null;
  let historyPolyline = null;
  let mapLayers = {};

  // ----------------------------------------------------------------
  // 1. INITIALIZE LEAFLET MAP (Google Maps & OpenStreetMap Layers)
  // ----------------------------------------------------------------
  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([18.623, 73.727], 16);

    // Zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // High-Resolution Google Maps & Custom Tile Layers
    mapLayers = {
      'google-hybrid': L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      }),
      'google-streets': L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      }),
      'google-terrain': L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      }),
      'dark-cyber': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
      })
    };

    // Default to Google Satellite Hybrid view (sharpest photorealistic view)
    setBaseMap('google-hybrid');

    // Primary Live Breadcrumb Polyline
    trailPolyline = L.polyline([], {
      color: '#06b6d4',
      weight: 4,
      opacity: 0.9,
      smoothFactor: 1
    }).addTo(map);

    // History Trip Polyline (Distinct amber dashed styling)
    historyPolyline = L.polyline([], {
      color: '#f59e0b',
      weight: 4,
      opacity: 0.95,
      dashArray: '6, 8'
    }).addTo(map);

    // Disable live follow if user manually pans the map
    map.on('dragstart', () => {
      if (state.mode === 'live') {
        state.liveFollow = false;
        el.recenterBtn.classList.add('active');
      }
    });

    // Layer switch buttons
    document.querySelectorAll('.layer-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setBaseMap(btn.dataset.layer);
      });
    });
  }

  function setBaseMap(layerKey) {
    if (!map || !mapLayers) return;
    Object.values(mapLayers).forEach(l => {
      if (map.hasLayer(l)) map.removeLayer(l);
    });

    const targetLayer = mapLayers[layerKey] || mapLayers['google-hybrid'];
    targetLayer.addTo(map);

    const mapEl = document.getElementById('map');
    if (layerKey === 'dark-cyber') {
      mapEl.classList.add('dark-mode');
    } else {
      mapEl.classList.remove('dark-mode');
    }

    document.querySelectorAll('.layer-pill-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layer === layerKey);
    });

    const layerLabels = {
      'google-hybrid': 'SATELLITE',
      'google-streets': 'STREETS',
      'google-terrain': 'TERRAIN',
      'dark-cyber': 'DARK'
    };
    if (el.settingsActiveLayerTag && layerLabels[layerKey]) {
      el.settingsActiveLayerTag.textContent = layerLabels[layerKey];
    }
  }

  // Create or Update Custom Animated Vehicle Marker
  function updateVehicleMarker(lat, lng, heading = 0) {
    const latlng = [lat, lng];

    const popupHtml = `
      <div style="font-family: var(--font-ui); color: #0f172a; padding: 6px; min-width: 175px;">
        <div style="font-weight: 800; font-size: 0.85rem; color: #0f172a; margin-bottom: 2px;">📡 Y2507 Tracker</div>
        <div style="font-size: 0.72rem; color: #64748b; font-family: var(--font-mono); margin-bottom: 8px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
        <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener noreferrer" 
           style="display: block; text-align: center; background: #2563eb; color: #fff; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-size: 0.72rem; font-weight: 700; box-shadow: 0 2px 6px rgba(37,99,235,0.4);">
          Open Google Maps &rarr;
        </a>
      </div>
    `;

    if (!vehicleMarker) {
      const customIcon = L.divIcon({
        className: 'vehicle-div-icon',
        html: `
          <div class="vehicle-marker-wrapper">
            <div class="vehicle-radar-ripple"></div>
            <div class="vehicle-icon-core" id="markerCore">
              <svg class="vehicle-arrow-svg" viewBox="0 0 24 24">
                <polygon points="12,2 22,21 12,17 2,21"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      vehicleMarker = L.marker(latlng, { icon: customIcon }).addTo(map);
      vehicleMarker.bindPopup(popupHtml);
    } else {
      vehicleMarker.setLatLng(latlng);
      vehicleMarker.setPopupContent(popupHtml);
    }

    // Smoothly rotate the arrow to match compass heading
    const markerCore = document.getElementById('markerCore');
    if (markerCore) {
      markerCore.style.transform = `rotate(${heading}deg)`;
    }

    if (state.liveFollow && state.mode === 'live') {
      map.panTo(latlng, { animate: true, duration: 0.8 });
    }
  }

  // ----------------------------------------------------------------
  // 2. WEBSOCKET REAL-TIME TELEMETRY ENGINE
  // ----------------------------------------------------------------
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    appendTerminalLog('SYSTEM', `Establishing real-time link to ${wsUrl}...`);
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.wsConnected = true;
      appendTerminalLog('SYSTEM', 'WebSocket link established. Ingestion engine online.');
      pollHeartbeat();
    };

    state.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('Error handling WS message:', e);
      }
    };

    state.ws.onclose = () => {
      state.wsConnected = false;
      if (el.serverStatusBadge) el.serverStatusBadge.className = 'status-indicator offline';
      if (el.trackerStatusDot) el.trackerStatusDot.className = 'status-dot offline';
      if (el.trackerStatusTitle) el.trackerStatusTitle.textContent = 'SERVER LINK';
      if (el.connectionState) el.connectionState.textContent = 'RECONNECTING';
      if (el.trackerLastSeenSub) el.trackerLastSeenSub.textContent = 'WS Lost';
      appendTerminalLog('SYSTEM', 'WebSocket link lost. Retrying in 2 seconds...');
      setTimeout(connectWebSocket, 2000);
    };

    state.ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
    };
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'SYNC_INIT': {
        const { devices, latestLocations, trackerStatus } = msg.data;
        updateDeviceList(devices);

        if (trackerStatus) {
          updateTrackerConnectionHud(trackerStatus);
        }

        if (devices.length > 0) {
          const activeDev = devices[0];
          selectDevice(activeDev.imei);
          updateDeviceStatusHud({
            acc: activeDev.ignition !== undefined ? activeDev.ignition : 1,
            batteryPercent: activeDev.battery || 100,
            voltage: activeDev.voltage ? parseFloat(activeDev.voltage.toFixed(1)) : 4.1,
            gsmSignal: 25
          });
          if (latestLocations && latestLocations[activeDev.imei]) {
            processLocationUpdate(latestLocations[activeDev.imei], true);
          }
        }
        break;
      }

      case 'TRACKER_STATUS': {
        updateTrackerConnectionHud(msg.data);
        break;
      }

      case 'CLIENT_CONNECT': {
        appendTerminalLog('CONNECT', `Hardware socket connected: ${msg.data.remote}`, 'login');
        pollHeartbeat();
        break;
      }

      case 'CLIENT_DISCONNECT': {
        appendTerminalLog('DISCONNECT', `Hardware socket closed: ${msg.data.remote}`, 'system');
        pollHeartbeat();
        break;
      }

      case 'DEVICE_LOGIN': {
        const { imei } = msg.data;
        appendTerminalLog('LOGIN', `Hardware tracker authenticated [IMEI: ${imei}]`, 'login');
        if (!state.devices.has(imei)) {
          state.devices.set(imei, { imei, name: 'Y2507 Hardware Tracker' });
          refreshDeviceDropdown();
        }
        selectDevice(imei);
        pollHeartbeat();
        break;
      }

      case 'CACHED_HISTORY_SYNC': {
        const { dateString } = msg.data;
        appendTerminalLog('BUFFER', `Flushed stored historical log from flash: ${dateString}`, 'system');
        break;
      }

      case 'LIVE_LOCATION': {
        const { imei, location } = msg.data;
        // Auto-switch if no active device or if no location was loaded yet
        if (!state.activeImei || (!state.currentLocation && state.activeImei !== imei)) {
          selectDevice(imei);
        }
        if (state.activeImei === imei) {
          processLocationUpdate(location);
        }
        break;
      }

      case 'DEVICE_STATUS': {
        const { imei, status } = msg.data;
        if (state.activeImei === imei) {
          updateDeviceStatusHud(status);
        }
        break;
      }

      case 'DEVICE_ALARM': {
        const { imei, alarm } = msg.data;
        triggerAlarmModal(imei, alarm);
        appendTerminalLog('ALARM', `EMERGENCY ALERT: ${alarm.type} from ${imei}`, 'alarm');
        break;
      }

      case 'RAW_PACKET': {
        const p = msg.data;
        appendTerminalLog(p.type, `Proto: 0x${p.protocol.toString(16).toUpperCase()} | Hex: ${p.hex}`);
        break;
      }

      case 'TRAIL_DATA': {
        if (msg.imei === state.activeImei && msg.trail) {
          loadHistoricalTrail(msg.trail);
        }
        break;
      }

      default:
        break;
    }
  }

  // ----------------------------------------------------------------
  // 3. TELEMETRY PROCESSING & HUD UPDATES
  // ----------------------------------------------------------------
  function processLocationUpdate(loc, isInitial = false) {
    state.packetCounter++;
    el.statPackets.textContent = state.packetCounter;

    let lat = loc.latitude;
    let lng = loc.longitude;
    let rawSpeed = loc.speed || 0;

    // Building Precision Anchor: Adiamville Society South Wing (18.624220, 73.727630)
    // Corrects 50-130m indoor satellite multipath drift when stationary at desk/building
    const dLat = (lat - 18.624220) * 111320;
    const dLng = (lng - 73.727630) * 111320 * 0.9476;
    if (Math.sqrt(dLat * dLat + dLng * dLng) <= 180 && (rawSpeed < 4 || loc.isGpsPositioned === false)) {
      lat = 18.624220;
      lng = 73.727630;
      rawSpeed = 0;
    }

    // Static Drift Filter: If speed < 3 km/h or not positioned, speed is 0
    const speed = (rawSpeed >= 3 && loc.isGpsPositioned !== false) ? Math.round(rawSpeed) : 0;
    
    // Heading stability: do not jitter heading arrow when stationary
    let heading = Math.round(loc.course || 0);
    if (speed === 0 && state.lastValidHeading !== undefined) {
      heading = state.lastValidHeading;
    } else if (speed >= 3) {
      state.lastValidHeading = heading;
    }

    // Calculate distance from previous point (Haversine formula)
    if (state.currentLocation) {
      const d = haversineDistance(
        state.currentLocation.latitude,
        state.currentLocation.longitude,
        lat,
        lng
      );
      // Only accumulate distance if the vehicle is genuinely moving (speed >= 3 km/h and distance > 15m)
      if (speed >= 3 && d > 15) {
        state.totalDistanceMeters += d;
        el.statDistance.textContent = `${(state.totalDistanceMeters / 1000).toFixed(2)} km`;
      }
    }

    state.currentLocation = loc;
    state.currentSpeed = speed;

    // Track speed stats
    if (speed > state.maxSpeed) {
      state.maxSpeed = speed;
      el.statMaxSpeed.textContent = `${state.maxSpeed} km/h`;
    }
    if (speed > 0) {
      state.speedSum += speed;
      state.speedCount++;
      el.statAvgSpeed.textContent = `${Math.round(state.speedSum / state.speedCount)} km/h`;
    }

    // Update Speed Gauge
    el.hudSpeed.textContent = speed;
    if (loc.isGpsPositioned === false) {
      el.speedState.textContent = 'NO GPS FIX (INDOORS)';
    } else if (speed === 0) {
      el.speedState.textContent = 'STATIONARY / PARKED';
    } else if (speed > 60) {
      el.speedState.textContent = 'HIGH SPEED';
    } else {
      el.speedState.textContent = 'CRUISING';
    }

    // SVG Speedometer Arc calculation (0 to 140 km/h -> 264 stroke-dashoffset)
    const maxGaugeSpeed = 120;
    const progress = Math.min(speed / maxGaugeSpeed, 1.0);
    const offset = 264 - (264 * progress);
    el.speedGaugeArc.style.strokeDashoffset = offset;
    el.speedGaugeArc.style.stroke = speed > 70 ? 'var(--rose-500)' : (speed > 40 ? 'var(--cyan-400)' : 'var(--emerald-400)');

    // Update Telemetry Metrics
    el.hudCoords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    el.hudHeading.textContent = `${heading}°`;
    el.hudSats.textContent = loc.satellites !== undefined ? loc.satellites : '--';
    if (el.gmapsNavBtn) {
      el.gmapsNavBtn.href = `https://www.google.com/maps?q=${lat},${lng}`;
    }

    // Update Marker and Breadcrumb Path
    updateVehicleMarker(lat, lng, heading);

    // Only add breadcrumbs when in live mode AND actively moving or on initial fix
    if (state.mode === 'live') {
      if (isInitial) {
        state.trailCoordinates = [[lat, lng]];
        trailPolyline.setLatLngs(state.trailCoordinates);
      } else if (speed >= 3) {
        state.trailCoordinates.push([lat, lng]);
        trailPolyline.setLatLngs(state.trailCoordinates);
      }
    }

    if (isInitial) {
      map.setView([lat, lng], 17);
    }
  }

  function updateDeviceStatusHud(status) {
    if (status.acc !== undefined) {
      el.hudAcc.textContent = status.acc === 1 ? 'RUNNING' : 'OFF';
      el.hudAcc.className = `metric-value ${status.acc === 1 ? 'status-on' : 'status-off'}`;
    }
    if (status.batteryPercent !== undefined) {
      el.hudBattery.textContent = `${status.batteryPercent}% (${status.voltage}V)`;
    }
    if (status.gsmSignal !== undefined) {
      updateSignalBars(status.gsmSignal);
    }
  }

  function updateSignalBars(csq) {
    const bars = el.signalBars.querySelectorAll('.bar');
    bars.forEach((b) => b.classList.remove('active'));
    if (csq >= 5) bars[0]?.classList.add('active');
    if (csq >= 12) bars[1]?.classList.add('active');
    if (csq >= 18) bars[2]?.classList.add('active');
    if (csq >= 24) bars[3]?.classList.add('active');
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ----------------------------------------------------------------
  // 4. DEVICE MANAGEMENT & REPLAY
  // ----------------------------------------------------------------
  function getDeviceLabel(d) {
    return `📡 Y2507 Hardware Tracker (${d.imei.slice(-6)})`;
  }

  function updateDeviceList(devices) {
    state.devices.clear();
    if (el.deviceSelect) el.deviceSelect.innerHTML = '';
    devices.forEach((d) => {
      const label = getDeviceLabel(d);
      state.devices.set(d.imei, { ...d, label });
      if (el.deviceSelect) {
        const opt = document.createElement('option');
        opt.value = d.imei;
        opt.textContent = label;
        el.deviceSelect.appendChild(opt);
      }
    });
  }

  function refreshDeviceDropdown() {
    if (!el.deviceSelect) return;
    el.deviceSelect.innerHTML = '';
    state.devices.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.imei;
      opt.textContent = d.label || getDeviceLabel(d);
      if (d.imei === state.activeImei) {
        opt.selected = true;
      }
      el.deviceSelect.appendChild(opt);
    });
  }

  function selectDevice(imei) {
    imei = imei || HARDCODED_IMEI;
    const isNew = state.activeImei !== imei;
    state.activeImei = imei;
    if (el.deviceSelect) el.deviceSelect.value = imei;

    if (isNew) {
      // Clear previous device metrics
      state.trailCoordinates = [];
      trailPolyline.setLatLngs([]);
      state.currentLocation = null;
      state.currentSpeed = 0;
      state.totalDistanceMeters = 0;
      el.statDistance.textContent = '0.00 km';
      el.hudSpeed.textContent = '0';
      el.speedState.textContent = 'STATIONARY / PARKED';
      el.hudCoords.textContent = '--.------, --.------';
      el.hudHeading.textContent = '--°';
      el.hudSats.textContent = '--';
      if (vehicleMarker) {
        map.removeLayer(vehicleMarker);
        vehicleMarker = null;
      }
    }

    // Request trail history for this device
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'GET_TRAIL', imei }));
    }
  }

  function loadHistoricalTrail(trail) {
    if (!trail || trail.length === 0) return;
    const movingPoints = trail.filter(p => (p.speed || 0) >= 3);
    const last = trail[trail.length - 1];
    if (movingPoints.length > 1) {
      state.trailCoordinates = movingPoints.map((p) => [p.latitude, p.longitude]);
      trailPolyline.setLatLngs(state.trailCoordinates);
    } else {
      state.trailCoordinates = [[last.latitude, last.longitude]];
      trailPolyline.setLatLngs(state.trailCoordinates);
    }
    processLocationUpdate(last, true);
  }

  // ----------------------------------------------------------------
  // 5. TRIP HISTORY REPLAY MODE
  // ----------------------------------------------------------------
  function enterHistoryMode() {
    state.mode = 'history';
    el.liveModeBtn.classList.remove('active');
    el.historyModeBtn.classList.add('active');
    el.historyPlayerBar.classList.remove('hidden');

    // Fetch full history from server
    fetch(`/api/history/${state.activeImei}?limit=1000`)
      .then((res) => res.json())
      .then((points) => {
        if (!points || points.length === 0) {
          alert('No historical breadcrumbs recorded for this device yet.');
          exitHistoryMode();
          return;
        }

        state.historyPoints = points;
        state.historyIndex = 0;
        el.replayScrubber.max = points.length - 1;
        el.replayScrubber.value = 0;
        el.replayFrameCount.textContent = `1 / ${points.length} points`;

        // Draw complete historical route
        const routeCoords = points.map((p) => [p.latitude, p.longitude]);
        historyPolyline.setLatLngs(routeCoords);
        map.fitBounds(historyPolyline.getBounds(), { padding: [50, 50] });

        // Place marker at start
        renderHistoryFrame(0);
      });
  }

  function exitHistoryMode() {
    stopHistoryReplay();
    state.mode = 'live';
    state.liveFollow = true;
    el.liveModeBtn.classList.add('active');
    el.historyModeBtn.classList.remove('active');
    el.historyPlayerBar.classList.add('hidden');
    historyPolyline.setLatLngs([]);

    if (state.currentLocation) {
      updateVehicleMarker(
        state.currentLocation.latitude,
        state.currentLocation.longitude,
        state.currentLocation.course
      );
      map.setView([state.currentLocation.latitude, state.currentLocation.longitude], 16);
    }
  }

  function renderHistoryFrame(index) {
    if (!state.historyPoints[index]) return;
    const pt = state.historyPoints[index];
    state.historyIndex = index;
    el.replayScrubber.value = index;
    el.replayFrameCount.textContent = `${index + 1} / ${state.historyPoints.length} points`;

    const d = new Date(pt.timestamp);
    el.replayCurrentTime.textContent = d.toLocaleTimeString();

    updateVehicleMarker(pt.latitude, pt.longitude, pt.course);
    el.hudSpeed.textContent = Math.round(pt.speed || 0);
    el.hudCoords.textContent = `${pt.latitude.toFixed(6)}, ${pt.longitude.toFixed(6)}`;
    el.hudHeading.textContent = `${Math.round(pt.course || 0)}°`;
  }

  function startHistoryReplay() {
    state.historyPlaying = true;
    el.replayPlayBtn.classList.add('hidden');
    el.replayPauseBtn.classList.remove('hidden');

    state.historyTimer = setInterval(() => {
      if (state.historyIndex >= state.historyPoints.length - 1) {
        stopHistoryReplay();
        return;
      }
      renderHistoryFrame(state.historyIndex + 1);
    }, 500 / state.historySpeedMult);
  }

  function stopHistoryReplay() {
    state.historyPlaying = false;
    el.replayPlayBtn.classList.remove('hidden');
    el.replayPauseBtn.classList.add('hidden');
    if (state.historyTimer) {
      clearInterval(state.historyTimer);
      state.historyTimer = null;
    }
  }

  // ----------------------------------------------------------------
  // 6. UI EVENT LISTENERS
  // ----------------------------------------------------------------
  el.deviceSelect?.addEventListener('change', (e) => {
    selectDevice(e.target.value);
  });

  el.liveModeBtn.addEventListener('click', () => {
    if (state.mode === 'history') exitHistoryMode();
  });

  el.historyModeBtn.addEventListener('click', () => {
    if (state.mode === 'live') enterHistoryMode();
  });

  el.exitHistoryBtn.addEventListener('click', exitHistoryMode);

  el.recenterBtn.addEventListener('click', () => {
    state.liveFollow = true;
    el.recenterBtn.classList.remove('active');
    if (state.currentLocation) {
      map.panTo([state.currentLocation.latitude, state.currentLocation.longitude], { animate: true });
    }
  });

  el.clearTrailBtn.addEventListener('click', () => {
    state.trailCoordinates = [];
    trailPolyline.setLatLngs([]);
    state.totalDistanceMeters = 0;
    el.statDistance.textContent = '0.00 km';
  });



  el.sosDismissBtn.addEventListener('click', () => {
    el.sosAlertModal.classList.add('hidden');
  });

  // SOS Configuration Handlers
  el.sosConfigBtn?.addEventListener('click', () => {
    closeSettingsDropdown();
    el.sosConfigModal.classList.remove('hidden');
    el.sosConfigStatus.classList.add('hidden');
    el.sosPhoneInput.focus();
  });

  el.sosModalCloseBtn?.addEventListener('click', () => {
    el.sosConfigModal.classList.add('hidden');
  });

  el.sosConfigModal?.addEventListener('click', (e) => {
    if (e.target === el.sosConfigModal) {
      el.sosConfigModal.classList.add('hidden');
    }
  });

  el.sosPhoneInput?.addEventListener('input', () => {
    const cleanNumber = el.sosPhoneInput.value.trim().replace(/[^0-9]/g, '');
    el.smsCommandPreview.textContent = `SOS,A,${cleanNumber || '919876543210'}#`;
  });

  el.sosSaveBtn?.addEventListener('click', async () => {
    const phone = el.sosPhoneInput.value.trim().replace(/[^0-9]/g, '');

    if (!phone) {
      el.sosConfigStatus.className = 'config-status-msg error';
      el.sosConfigStatus.textContent = 'Please enter a valid phone number with country code.';
      el.sosConfigStatus.classList.remove('hidden');
      return;
    }

    // Save configuration on server
    fetch('/api/sos/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sosPhone: phone })
    }).catch(() => {});

    const imei = state.activeImei || HARDCODED_IMEI;
    el.sosSaveBtn.disabled = true;
    el.sosSaveBtn.textContent = 'TRANSMITTING VIA TCP (0x80)...';
    el.sosConfigStatus.classList.add('hidden');

    try {
      const res = await fetch(`/api/device/${imei}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        el.sosConfigStatus.className = 'config-status-msg success';
        el.sosConfigStatus.textContent = `✅ Settings saved! Tracker ${imei} programmed for SOS contact: +${phone}`;
        el.sosConfigStatus.classList.remove('hidden');
        appendTerminalLog('COMMAND', `Sent GT06 0x80 to ${imei}: SOS,A,${phone}#`, 'tx');
      } else {
        el.sosConfigStatus.className = 'config-status-msg error';
        el.sosConfigStatus.textContent = `⚠️ Tracker Offline / Not Connected to TCP. Send SMS instead: SOS,A,${phone}#`;
        el.sosConfigStatus.classList.remove('hidden');
      }
    } catch (err) {
      el.sosConfigStatus.className = 'config-status-msg error';
      el.sosConfigStatus.textContent = `Network error: ${err.message}`;
      el.sosConfigStatus.classList.remove('hidden');
    } finally {
      el.sosSaveBtn.disabled = false;
      el.sosSaveBtn.textContent = 'SAVE & CONFIGURE OVER TCP (0x80)';
    }
  });

  el.quickTriggerSosBtn?.addEventListener('click', () => {
    triggerAlarmModal(state.activeImei || HARDCODED_IMEI, { type: 'SOS_PANIC (Manual Alert Trigger)' });
    appendTerminalLog('EMERGENCY', 'Manual SOS panic triggered from operator console', 'alarm');
  });

  function triggerAlarmModal(imei, alarm) {
    const lat = state.currentLocation ? state.currentLocation.latitude : 18.624220;
    const lng = state.currentLocation ? state.currentLocation.longitude : 73.727630;
    el.sosCoords.textContent = `Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    el.sosAlertModal.classList.remove('hidden');
  }

  // Settings & Controls Dropdown Handlers
  function toggleSettingsDropdown() {
    if (!el.settingsDropdown) return;
    const isHidden = el.settingsDropdown.classList.toggle('hidden');
    el.settingsToggleBtn?.classList.toggle('active', !isHidden);
  }

  function closeSettingsDropdown() {
    if (!el.settingsDropdown) return;
    el.settingsDropdown.classList.add('hidden');
    el.settingsToggleBtn?.classList.remove('active');
  }

  el.settingsToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsDropdown();
  });

  el.settingsCloseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSettingsDropdown();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (el.settingsDropdown && !el.settingsDropdown.classList.contains('hidden')) {
      if (!el.settingsDropdown.contains(e.target) && !el.settingsToggleBtn?.contains(e.target)) {
        closeSettingsDropdown();
      }
    }
  });

  // Close dropdown on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsDropdown();
      if (el.sosConfigModal && !el.sosConfigModal.classList.contains('hidden')) {
        el.sosConfigModal.classList.add('hidden');
      }
      if (el.heartbeatModal && !el.heartbeatModal.classList.contains('hidden')) {
        el.heartbeatModal.classList.add('hidden');
      }
    }
  });

  // ----------------------------------------------------------------
  // HEARTBEAT & REAL-TIME REFRESH LOCATION ENGINE
  // ----------------------------------------------------------------
  function showToast(title, message, type = 'toast-info', durationMs = 4000) {
    if (!el.appToastContainer) return;
    const toast = document.createElement('div');
    toast.className = `cyber-toast ${type}`;
    const icon = type === 'toast-success' ? '✅' : (type === 'toast-warning' ? '⚠️' : 'ℹ️');
    toast.innerHTML = `
      <div class="cyber-toast-icon">${icon}</div>
      <div class="cyber-toast-content">
        <span class="cyber-toast-title">${title}</span>
        <span class="cyber-toast-msg">${message}</span>
      </div>
    `;
    el.appToastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  function updateTrackerConnectionHud(status) {
    if (!status) return;
    state.trackerConnected = !!status.connected;
    state.trackerStatus = status;

    if (status.connected) {
      if (el.serverStatusBadge) el.serverStatusBadge.className = 'status-indicator online';
      if (el.trackerStatusDot) el.trackerStatusDot.className = 'status-dot online';
      if (el.trackerStatusTitle) el.trackerStatusTitle.textContent = 'TRACKER :5023';
      if (el.connectionState) el.connectionState.textContent = 'CONNECTED';
      if (el.trackerLastSeenSub) {
        el.trackerLastSeenSub.textContent = status.lastSeenAgo ? `Active (${status.lastSeenAgo})` : 'Active';
      }

      // Update Diagnostics Modal
      if (el.hbModalDot) el.hbModalDot.className = 'hb-indicator-dot online';
      if (el.hbModalState) {
        el.hbModalState.textContent = 'CONNECTED & COMMUNICATING';
        el.hbModalState.style.color = 'var(--emerald-400)';
      }
    } else {
      if (el.serverStatusBadge) el.serverStatusBadge.className = 'status-indicator offline';
      if (el.trackerStatusDot) el.trackerStatusDot.className = 'status-dot offline';
      if (el.trackerStatusTitle) el.trackerStatusTitle.textContent = 'TRACKER :5023';
      if (el.connectionState) el.connectionState.textContent = 'OFFLINE';
      if (el.trackerLastSeenSub) {
        el.trackerLastSeenSub.textContent = status.lastSeenAgo && status.lastSeenAgo !== 'Never' ? `Last: ${status.lastSeenAgo}` : 'No TCP Client';
      }

      // Update Diagnostics Modal
      if (el.hbModalDot) el.hbModalDot.className = 'hb-indicator-dot offline';
      if (el.hbModalState) {
        el.hbModalState.textContent = 'OFFLINE (WAITING FOR TCP :5023)';
        el.hbModalState.style.color = '#f59e0b';
      }
    }

    if (el.hbModalImei) el.hbModalImei.textContent = status.imei || HARDCODED_IMEI;
    if (el.hbModalRemote) el.hbModalRemote.textContent = status.remoteAddress || 'None (Socket not connected)';
    if (el.hbModalLastSeen) el.hbModalLastSeen.textContent = status.lastSeen ? `${status.lastSeenAgo} (${new Date(status.lastSeen).toLocaleTimeString()})` : 'Never';
    if (el.hbModalLastHb) el.hbModalLastHb.textContent = status.lastHeartbeatAt ? `${status.lastHeartbeatAgo} (${new Date(status.lastHeartbeatAt).toLocaleTimeString()})` : 'Never';
    if (el.hbModalPackets) el.hbModalPackets.textContent = `${status.stats?.totalPackets || 0} packets`;

    if (status.heartbeat) {
      if (el.hbModalBatt) el.hbModalBatt.textContent = `${status.heartbeat.batteryPercent || '--'}% (${status.heartbeat.voltage ? status.heartbeat.voltage + 'V' : '--'})`;
      if (el.hbModalAcc) el.hbModalAcc.textContent = status.heartbeat.acc ? 'RUNNING (ON)' : 'OFF';
      updateDeviceStatusHud(status.heartbeat);
    }
  }

  async function pollHeartbeat() {
    try {
      const res = await fetch('/api/heartbeat');
      if (res.ok) {
        const data = await res.json();
        updateTrackerConnectionHud(data);
      }
    } catch (e) {
      // Offline fallback
    }
  }

  let isRefreshingLocation = false;
  async function triggerLocationRefresh() {
    if (isRefreshingLocation) return;
    isRefreshingLocation = true;

    // Visual loading state
    if (el.refreshLocationBtn) {
      el.refreshLocationBtn.classList.add('loading');
      el.refreshLocationBtn.disabled = true;
    }
    if (el.hudRefreshBtn) {
      el.hudRefreshBtn.disabled = true;
    }
    if (el.refreshBtnText) {
      el.refreshBtnText.textContent = 'REFRESHING...';
    }

    appendTerminalLog('COMMAND', 'Transmitting instant location refresh query (WHERE# / DW#) over TCP 0x80...');

    try {
      const res = await fetch('/api/tracker/refresh-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imei: state.activeImei || HARDCODED_IMEI })
      });
      const data = await res.json();

      if (data.latestLocation) {
        processLocationUpdate(data.latestLocation, false);
        if (map && data.latestLocation.latitude && data.latestLocation.longitude) {
          map.flyTo([data.latestLocation.latitude, data.latestLocation.longitude], 17, {
            duration: 1.2
          });
        }
      }

      // Marker radar ripple effect
      const markerCore = document.getElementById('markerCore');
      if (markerCore) {
        markerCore.classList.add('pulse-beacon');
        setTimeout(() => markerCore.classList.remove('pulse-beacon'), 3000);
      }

      if (data.trackerConnected) {
        showToast(
          'GPS Location Refreshed',
          `Live position fix queried from tracker! Lat: ${data.latestLocation?.latitude?.toFixed(6)}, Lng: ${data.latestLocation?.longitude?.toFixed(6)}`,
          'toast-success'
        );
        appendTerminalLog('GPS', `Refreshed coordinates: ${data.latestLocation?.latitude}, ${data.latestLocation?.longitude}`);
      } else {
        showToast(
          'Tracker Offline on TCP :5023',
          'Tracker not connected. Displaying latest saved fix from database.',
          'toast-warning'
        );
        appendTerminalLog('WARN', 'Tracker is offline on TCP 5023. Displaying latest saved fix.');
      }

      if (el.refreshLocationBtn) {
        el.refreshLocationBtn.classList.remove('loading');
        el.refreshLocationBtn.classList.add('success');
      }
      if (el.refreshBtnText) {
        el.refreshBtnText.textContent = '✓ UPDATED!';
      }

      setTimeout(() => {
        if (el.refreshLocationBtn) {
          el.refreshLocationBtn.classList.remove('success');
          el.refreshLocationBtn.disabled = false;
        }
        if (el.hudRefreshBtn) {
          el.hudRefreshBtn.disabled = false;
        }
        if (el.refreshBtnText) {
          el.refreshBtnText.textContent = 'REFRESH GPS';
        }
        isRefreshingLocation = false;
      }, 2000);

    } catch (err) {
      console.error('Error refreshing location:', err);
      showToast('Refresh Failed', err.message || 'Could not query server', 'toast-warning');
      if (el.refreshLocationBtn) {
        el.refreshLocationBtn.classList.remove('loading');
        el.refreshLocationBtn.disabled = false;
      }
      if (el.hudRefreshBtn) {
        el.hudRefreshBtn.disabled = false;
      }
      if (el.refreshBtnText) {
        el.refreshBtnText.textContent = 'REFRESH GPS';
      }
      isRefreshingLocation = false;
    }

    // Refresh heartbeat status
    pollHeartbeat();
  }

  // Refresh Location Button Listeners
  el.refreshLocationBtn?.addEventListener('click', triggerLocationRefresh);
  el.hudRefreshBtn?.addEventListener('click', triggerLocationRefresh);

  // Status Indicator click -> open Heartbeat Diagnostics Modal
  el.serverStatusBadge?.addEventListener('click', () => {
    el.heartbeatModal?.classList.remove('hidden');
    pollHeartbeat();
  });

  el.heartbeatModalCloseBtn?.addEventListener('click', () => {
    el.heartbeatModal?.classList.add('hidden');
  });

  el.hbCheckNowBtn?.addEventListener('click', () => {
    el.hbCheckNowBtn.disabled = true;
    el.hbCheckNowBtn.textContent = 'Checking...';
    pollHeartbeat().finally(() => {
      setTimeout(() => {
        if (el.hbCheckNowBtn) {
          el.hbCheckNowBtn.disabled = false;
          el.hbCheckNowBtn.textContent = 'Check Now';
        }
      }, 500);
    });
  });

  // Close heartbeat modal when clicking overlay backdrop
  el.heartbeatModal?.addEventListener('click', (e) => {
    if (e.target === el.heartbeatModal) {
      el.heartbeatModal.classList.add('hidden');
    }
  });

  // Diagnostic Log Drawer Toggle
  el.logToggleBtn?.addEventListener('click', () => {
    closeSettingsDropdown();
    el.terminalDrawer.classList.toggle('open');
  });

  el.termCloseBtn.addEventListener('click', () => {
    el.terminalDrawer.classList.remove('open');
  });

  el.termClearBtn.addEventListener('click', () => {
    el.terminalBody.innerHTML = '';
  });

  let termPacketCount = 0;
  function appendTerminalLog(tag, msg, extraClass = '') {
    termPacketCount++;
    el.termPacketCount.textContent = `${termPacketCount} PACKETS`;

    const now = new Date();
    const timeStr = `[${now.toTimeString().split(' ')[0]}]`;

    const row = document.createElement('div');
    row.className = `terminal-line ${extraClass}`;
    row.innerHTML = `<span class="t-time">${timeStr}</span> <span class="t-tag">[${tag}]</span> <span class="t-msg">${msg}</span>`;

    el.terminalBody.appendChild(row);
    // Keep max 200 lines in DOM
    if (el.terminalBody.children.length > 200) {
      el.terminalBody.removeChild(el.terminalBody.firstChild);
    }
    el.terminalBody.scrollTop = el.terminalBody.scrollHeight;
  }

  // Replay Player Controls
  el.replayPlayBtn.addEventListener('click', startHistoryReplay);
  el.replayPauseBtn.addEventListener('click', stopHistoryReplay);
  el.replayResetBtn.addEventListener('click', () => {
    stopHistoryReplay();
    renderHistoryFrame(0);
  });

  el.replayScrubber.addEventListener('input', (e) => {
    stopHistoryReplay();
    renderHistoryFrame(parseInt(e.target.value, 10));
  });

  document.querySelectorAll('.mult-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.mult-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      state.historySpeedMult = parseFloat(e.target.dataset.speed);
      if (state.historyPlaying) {
        stopHistoryReplay();
        startHistoryReplay();
      }
    });
  });

  // ----------------------------------------------------------------
  // 7. BOOTSTRAP
  // ----------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    connectWebSocket();
    pollHeartbeat();
    // Continuously check tracker heartbeat every 4 seconds
    setInterval(pollHeartbeat, 4000);
  });
})();
