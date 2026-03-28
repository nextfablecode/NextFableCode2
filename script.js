// 🔥 1. FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAzeBgUadTRtqGgAejLQnEfA4ngG6h694o",
  authDomain: "locationshare-1c651.firebaseapp.com",
  databaseURL: "https://locationshare-1c651-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "locationshare-1c651",
  storageBucket: "locationshare-1c651.firebasestorage.app",
  messagingSenderId: "207038124129",
  appId: "1:207038124129:web:5a0faaf62d164286e55a20"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 🌍 STATE
let map;
let myMarker = null;
let userName = "";
let userColor = "#ff3b3b";
let groupCode = "";
let isSharing = false;
let watchInterval = null;
let markers = {};

// 🎯 UI
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const usernameInput = document.getElementById("usernameInput");
const colorInput = document.getElementById("colorInput");
const groupCodeInput = document.getElementById("groupCodeInput");
const groupLabelInput = document.getElementById("groupLabelInput");
const savedGroupsList = document.getElementById("savedGroupsList");
const loginError = document.getElementById("loginError");
const groupInfo = document.getElementById("groupInfo");
const membersList = document.getElementById("membersList");

const createGroupBtn = document.getElementById("createGroupBtn");
const joinGroupBtn = document.getElementById("joinGroupBtn");
const toggleShareBtn = document.getElementById("toggleShareBtn");
const showCodeBtn = document.getElementById("showCodeBtn");
const centerBtn = document.getElementById("centerBtn");
// ⏱️ Presence settings
const ONLINE_THRESHOLD = 15 * 1000;   // 15 seconds = online
const CLEANUP_THRESHOLD = 2 * 60 * 1000; // 2 minutes = hide/remove


// 🧭 Navigate helper
function openNavigation(lat, lng) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, "_blank");
}

// ⭐ SAVED GROUPS (LocalStorage)
function getSavedGroups() {
  try {
    return JSON.parse(localStorage.getItem("hawk_saved_groups")) || [];
  } catch {
    return [];
  }
}

function setSavedGroups(list) {
  localStorage.setItem("hawk_saved_groups", JSON.stringify(list));
}

function saveCurrentGroup(label) {
  const list = getSavedGroups();

  // Avoid duplicates (same code + same user)
  const exists = list.some(g => g.code === groupCode && g.user === userName);
  if (exists) return;

  list.push({
    label: label || "My Group",
    code: groupCode,
    user: userName,
    color: userColor
  });

  setSavedGroups(list);
  renderSavedGroups();
}

function deleteSavedGroup(index) {
  const list = getSavedGroups();
  list.splice(index, 1);
  setSavedGroups(list);
  renderSavedGroups();
}

function renderSavedGroups() {
  if (!savedGroupsList) return;

  const list = getSavedGroups();
  savedGroupsList.innerHTML = "";

  if (list.length === 0) {
    savedGroupsList.innerHTML = `<div style="color:#666;font-size:13px;">No saved groups yet</div>`;
    return;
  }

  list.forEach((g, idx) => {
    const item = document.createElement("div");
    item.className = "savedItem";

    item.innerHTML = `
      <div class="left">
        <span class="dot" style="background:${g.color}"></span>
        <div>
          <div><b>${g.label}</b></div>
          <div class="meta">${g.user} • ${g.code}</div>
        </div>
      </div>
      <div>
        <button class="joinBtn">Join</button>
        <button class="delBtn">✕</button>
      </div>
    `;

    // Join saved group
    item.querySelector(".joinBtn").onclick = () => {
      usernameInput.value = g.user;
      colorInput.value = g.color;
      groupCodeInput.value = g.code;
      groupLabelInput.value = g.label;

      userName = g.user;
      userColor = g.color;
      groupCode = g.code;

      showApp();
    };

    // Delete saved group
    item.querySelector(".delBtn").onclick = () => {
      if (confirm("Remove this saved group?")) {
        deleteSavedGroup(idx);
      }
    };

    savedGroupsList.appendChild(item);
  });
}

// 🧩 HELPERS
function generateGroupCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function showApp() {
  loginScreen.classList.remove("active");
  appScreen.classList.add("active");
  groupInfo.textContent = "Group: " + groupCode;
  initMap();
  listenToGroup();
}

// 🗺️ MAP INIT
function initMap() {
  map = L.map("map").setView([20.5937, 78.9629], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

// 📡 REALTIME
function listenToGroup() {
  const groupRef = db.ref("groups/" + groupCode);
  groupRef.on("value", (snapshot) => {
    const data = snapshot.val() || {};
    updateMembers(data);
  });
}

function createMarkerIcon(color) {
  const el = document.createElement("div");
  el.className = "custom-marker";
  el.style.background = color;
  return L.divIcon({
    html: el,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function updateMembers(data) {
  membersList.innerHTML = "";
  const keys = Object.keys(data);
  membersList.innerHTML = `Members (${keys.length}): `;

  const now = Date.now();

  keys.forEach((userId) => {
    const user = data[userId];

    const last = user.updated || 0;
    const diff = now - last;

    const isOnline = diff <= ONLINE_THRESHOLD;
    const isTooOld = diff > CLEANUP_THRESHOLD;

    // Auto cleanup: hide very old users
    if (isTooOld) {
      // Remove marker if exists
      if (markers[userId]) {
        map.removeLayer(markers[userId]);
        delete markers[userId];
      }
      return; // skip rendering this user
    }

    // Status color
    const statusColor = isOnline ? "#22c55e" : "#9ca3af"; // green / gray

    // Members list with status dot + user color dot
    const statusDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:4px;"></span>`;
    const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${user.color};margin-right:4px;"></span>`;

    membersList.innerHTML += `
  <span>
    ${statusDot}
    ${colorDot}
    ${user.name}
  </span>
`;
    if (user.lat && user.lng) {
      if (!markers[userId]) {
        const markerColor = isOnline ? user.color : "#9ca3af"; // gray if offline

        const marker = L.marker([user.lat, user.lng], {
          icon: createMarkerIcon(markerColor)
        }).addTo(map);

        const popupHtml = `
          <div style="text-align:center;">
            <div style="font-weight:600; margin-bottom:6px;">${user.name}</div>
            <div style="font-size:12px; margin-bottom:8px; color:${isOnline ? "#16a34a" : "#6b7280"};">
              ${isOnline ? "🟢 Online" : "⚪ Offline"}
            </div>
            <button 
              style="padding:8px 12px;border:none;border-radius:8px;background:#3b82f6;color:white;font-weight:600;cursor:pointer;"
              onclick="openNavigation(${user.lat}, ${user.lng})"
            >
              🧭 Navigate
            </button>
          </div>
        `;

        marker.bindPopup(popupHtml);
        markers[userId] = marker;
      } else {
        // Update position
        markers[userId].setLatLng([user.lat, user.lng]);

        // Update color if status changed
        const markerColor = isOnline ? user.color : "#9ca3af";
        markers[userId].setIcon(createMarkerIcon(markerColor));
      }
    }
  });
}

// 📍 LOCATION SHARING
function startSharing() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  isSharing = true;
  toggleShareBtn.textContent = "⛔ Stop";

  watchInterval = setInterval(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const userId = userName.replace(/\s+/g, "_");

      db.ref("groups/" + groupCode + "/" + userId).set({
        name: userName,
        color: userColor,
        lat,
        lng,
        updated: Date.now()
      });

      if (!myMarker) {
        myMarker = L.marker([lat, lng], {
          icon: createMarkerIcon(userColor)
        }).addTo(map).bindPopup("<b>Me</b>");

        map.setView([lat, lng], 16);
      } else {
        myMarker.setLatLng([lat, lng]);
      }
    }, (err) => {
      console.error(err);
      alert("Could not get location. Please allow location access.");
    });
  }, 4000);
}

function stopSharing() {
  isSharing = false;
  toggleShareBtn.textContent = "📍 Share";
  clearInterval(watchInterval);
}

// 🖱️ EVENTS
createGroupBtn.onclick = () => {
  userName = usernameInput.value.trim();
  userColor = colorInput.value;

  if (!userName) {
    loginError.textContent = "Enter your name";
    return;
  }

  loginError.textContent = "";
  groupCode = generateGroupCode();
  showApp();

  const label = groupLabelInput.value.trim() || "My Group";
  saveCurrentGroup(label);
};

joinGroupBtn.onclick = () => {
  userName = usernameInput.value.trim();
  userColor = colorInput.value;
  groupCode = groupCodeInput.value.trim();

  if (!userName || !groupCode) {
    loginError.textContent = "Enter name and group code";
    return;
  }

  loginError.textContent = "";
  showApp();

  const label = groupLabelInput.value.trim() || "My Group";
  saveCurrentGroup(label);
};

toggleShareBtn.onclick = () => {
  if (!isSharing) startSharing();
  else stopSharing();
};

showCodeBtn.onclick = () => {
  alert("HAWK Group Code: " + groupCode);
};

centerBtn.onclick = () => {
  if (myMarker) {
    const p = myMarker.getLatLng();
    map.setView(p, 16);
  }
};

window.addEventListener("beforeunload", () => {
  if (groupCode && userName) {
    const userId = userName.replace(/\s+/g, "_");
    db.ref("groups/" + groupCode + "/" + userId + "/updated").set(0);
  }
});

window.openNavigation = openNavigation;
renderSavedGroups();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("Service Worker registered"))
      .catch(err => console.error("SW registration failed", err));
  });
}