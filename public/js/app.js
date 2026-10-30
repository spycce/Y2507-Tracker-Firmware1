// public/js/app.js - AeroTrack Real-Time Telemetry & Interactive Map Engine

(function () {
  'use strict';

  // State Management
  const state = {
    ws: null,
    wsConnected: false,
    activeImei: null,
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

  // DOM Elements
  const el = {
    deviceSelect: document.getElementById('deviceSelect'),
    liveModeBtn: document.getElementById('liveModeBtn'),
    historyModeBtn: document.getElementById('historyModeBtn'),
    logToggleBtn: document.getElementById('logToggleBtn'),
    connectionState: document.getElementById('connectionState'),
    serverStatusBadge: document.getElementById('serverStatusBadge'),
    
    // HUD
    hudSpeed: document.getElementById('hudSpeed'),
    speedGaugeArc: document.getElementById('speedGaugeArc'),
    speedState: document.getElementById('speedState'),
    hudAcc: document.getElementById('hudAcc'),
    hudBattery: document.getElementById('hudBattery'),
    hudSats: document.getElementById('hudSats'),
    hudHeading: document.getElementById('hudHeading'),
    hudCoords: document.getElementById('hudCoords'),
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
    sosDismissBtn: document.getElementById('sosDismissBtn')
  };

  // Leaflet Map & Layer References
  let map = null;
  let vehicleMarker = null;
  let trailPolyline = null;
  let historyPolyline = null;

  // ----------------------------------------------------------------
  // 1. INITIALIZE LEAFLET MAP
  // ----------------------------------------------------------------
  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([37.7749, -122.4194], 15);

    // Zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dark-themed tiles from OpenStreetMap with custom CSS filters
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c']
    }).addTo(map);

    // Primary Live Breadcrumb Polyline
    trailPolyline = L.polyline([], {
      color: '#06b6d4',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 1
    }).addTo(map);

    // History Trip Polyline (Distinct amber dashed styling)
    historyPolyline = L.polyline([], {
      color: '#f59e0b',
      weight: 4,
      opacity: 0.9,
      dashArray: '6, 8'
    }).addTo(map);

    // Disable live follow if user manually pans the map
    map.on('dragstart', () => {
      if (state.mode === 'live') {
        state.liveFollow = false;
        el.recenterBtn.classList.add('active');
      }
    });
  }

  // Create or Update Custom Animated Vehicle Marker
  function updateVehicleMarker(lat, lng, heading = 0) {
    const latlng = [lat, lng];

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
    } else {
      vehicleMarker.setLatLng(latlng);
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
      el.connectionState.textContent = 'CONNECTED';
      el.serverStatusBadge.classList.add('online');
      appendTerminalLog('SYSTEM', 'WebSocket link established. Awaiting telemetry stream.');
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
      el.connectionState.textContent = 'RECONNECTING';
      el.serverStatusBadge.classList.remove('online');
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
        const { devices, latestLocations } = msg.data;
        updateDeviceList(devices);

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

      case 'DEVICE_LOGIN': {
        const { imei } = msg.data;
        appendTerminalLog('LOGIN', `Hardware tracker connected [IMEI: ${imei}]`, 'login');
        if (!state.devices.has(imei)) {
          state.devices.set(imei, { imei, name: 'Y2507 Hardware Tracker' });
          refreshDeviceDropdown();
        }
        selectDevice(imei);
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

    const lat = loc.latitude;
    const lng = loc.longitude;
    const rawSpeed = loc.speed || 0;
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
    el.deviceSelect.innerHTML = '';
    devices.forEach((d) => {
      const label = getDeviceLabel(d);
      state.devices.set(d.imei, { ...d, label });
      const opt = document.createElement('option');
      opt.value = d.imei;
      opt.textContent = label;
      el.deviceSelect.appendChild(opt);
    });
  }

  function refreshDeviceDropdown() {
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
    if (!imei) return;
    const isNew = state.activeImei !== imei;
    state.activeImei = imei;
    el.deviceSelect.value = imei;

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
  el.deviceSelect.addEventListener('change', (e) => {
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

  function triggerAlarmModal(imei, alarm) {
    el.sosDetails.textContent = `EMERGENCY ALERT: ${alarm.type} triggered by tracker ${imei}`;
    if (state.currentLocation) {
      el.sosCoords.textContent = `Location: ${state.currentLocation.latitude.toFixed(6)}, ${state.currentLocation.longitude.toFixed(6)}`;
    }
    el.sosAlertModal.classList.remove('hidden');
  }

  // Diagnostic Log Drawer Toggle
  el.logToggleBtn.addEventListener('click', () => {
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
  });
})();
