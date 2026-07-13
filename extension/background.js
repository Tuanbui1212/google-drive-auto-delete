let deleting = false;
let currentDeleteTabId = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPhotoUrl(photo) {
  if (photo.productUrl) return photo.productUrl;
  if (photo.mediaItemId) {
    return `https://photos.google.com/lr/photo/${photo.mediaItemId}`;
  }
  return null;
}

function waitTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        resolve();
        return;
      }
      chrome.tabs.onUpdated.addListener(function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await sleep(400);
  }
}

async function fetchPhotos(apiUrl, email) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/upload/my-files?email=${encodeURIComponent(email)}`,
  );

  if (!response.ok) {
    throw new Error(`Không lấy được danh sách ảnh (HTTP ${response.status})`);
  }

  return response.json();
}

async function removeLocalRecord(apiUrl, email, photoId) {
  const base = apiUrl.replace(/\/$/, "");
  const response = await fetch(
    `${base}/upload/${photoId}?email=${encodeURIComponent(email)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Không xóa được bản ghi local (${response.status}): ${body}`,
    );
  }
}

async function sendProgressToWebApp(message) {
  // Find the Web App tab to send the event back
  const tabs = await chrome.tabs.query({
    url: [
      "http://localhost:3000/*",
      "http://127.0.0.1:3000/*",
      "http://localhost:3001/*",
      "http://127.0.0.1:3001/*",
    ],
  });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "GOOGLE_PHOTOS_EXTENSION_EVENT",
        ...message,
      });
    } catch (e) {
      // ignore
    }
  }
}

async function startDeleteAll(apiUrl, email, options = {}) {
  const { mode = "all", delayMinutes = 5 } = options;

  if (deleting) {
    sendProgressToWebApp({
      action: "DELETE_ERROR",
      message: "Đang chạy tiến trình xóa, vui lòng đợi.",
    });
    return { error: "Đang chạy tiến trình xóa, vui lòng đợi." };
  }

  deleting = true;
  let deletedCount = 0;
  const errors = [];

  try {
    sendProgressToWebApp({
      action: "DELETE_PROGRESS",
      message: "Đang tải danh sách ảnh cần xóa...",
    });

    const photos = await fetchPhotos(apiUrl, email);
    let toDelete;
    if (mode === "expired") {
      toDelete = filterExpiredPhotos(photos, delayMinutes);
    } else {
      toDelete = photos.filter((photo) => buildPhotoUrl(photo));
    }

    if (toDelete.length === 0) {
      sendProgressToWebApp({
        action: "DELETE_COMPLETE",
        message: "Không có ảnh nào để xóa.",
      });
      return {
        deleted: 0,
        total: 0,
        errors: [],
        message: "Không có ảnh nào để xóa",
      };
    }

    sendProgressToWebApp({
      action: "DELETE_PROGRESS",
      message: `Bắt đầu xóa ${toDelete.length} ảnh...`,
    });

    // Create a minimized popup window for silent deletion
    const win = await chrome.windows.create({
      url: "https://photos.google.com/",
      type: "popup",
      state: "minimized",
      focused: false,
    });
    const tab = win.tabs[0];
    currentDeleteTabId = tab.id;

    await waitTabLoad(tab.id);
    await ensureContentScript(tab.id);

    for (let i = 0; i < toDelete.length; i++) {
      const photo = toDelete[i];
      const url = buildPhotoUrl(photo);

      try {
        sendProgressToWebApp({
          action: "DELETE_PROGRESS",
          message: `Đang xóa ${i + 1}/${toDelete.length}: ${photo.fileName || "Ảnh"}`,
        });

        // Navigate to the photo
        await chrome.tabs.update(tab.id, { url });
        await waitTabLoad(tab.id);
        await ensureContentScript(tab.id);

        // Tell content script to click trash
        const result = await chrome.tabs.sendMessage(tab.id, {
          action: "DELETE_CURRENT_PHOTO",
        });

        if (!result?.success) {
          throw new Error(result?.error || "Lỗi không xác định khi bấm xóa");
        }

        // Remove from DB if UI deletion succeeded
        await removeLocalRecord(apiUrl, email, photo.id);
        deletedCount++;
      } catch (err) {
        errors.push(`${photo.fileName || photo.id}: ${err.message}`);
      }
    }

    // Close the popup window after finishing
    try {
      await chrome.windows.remove(win.id);
    } catch (e) {}

    let finalMessage = `Đã xóa thành công ${deletedCount}/${toDelete.length} ảnh.`;
    if (errors.length > 0) {
      finalMessage += `\nLỗi:\n${errors.join("\n")}`;
    }

    sendProgressToWebApp({ action: "DELETE_COMPLETE", message: finalMessage });

    return {
      deleted: deletedCount,
      total: toDelete.length,
      errors,
      message: finalMessage,
    };
  } catch (error) {
    sendProgressToWebApp({
      action: "DELETE_ERROR",
      message: `Lỗi: ${error.message}`,
    });
    return { error: error.message };
  } finally {
    deleting = false;
    currentDeleteTabId = null;
  }
}

// ==========================================
// AUTO-DELETE (ALARM EVERY 1 MINUTE)
// ==========================================
const ALARM_NAME = "auto-delete-check";

function filterExpiredPhotos(photos, delayMinutes) {
  const delayMs = delayMinutes * 60 * 1000;
  const now = Date.now();
  return photos.filter((photo) => {
    if (!buildPhotoUrl(photo) || !photo.createdAt) return false;
    const uploadedAt = new Date(photo.createdAt).getTime();
    if (isNaN(uploadedAt)) return false;
    return now - uploadedAt >= delayMs;
  });
}

async function syncAutoDeleteAlarm() {
  await chrome.alarms.clear(ALARM_NAME);

  const saved = await chrome.storage.sync.get("accountSettings");
  const accountSettings = saved.accountSettings || {};
  const hasEnabled = Object.values(accountSettings).some(
    (s) => s?.autoDeleteEnabled === true,
  );

  if (hasEnabled) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    console.log("[Auto-Delete] Alarm ON — kiểm tra mỗi phút");
  }
}

async function runAutoDelete() {
  if (deleting) return; // skip if already running a manual delete

  const saved = await chrome.storage.sync.get(["apiUrl", "accountSettings"]);
  const apiUrl = saved.apiUrl || "http://localhost:5000";
  const accountSettings = saved.accountSettings || {};

  const enabledAccounts = Object.entries(accountSettings).filter(
    ([, s]) => s?.autoDeleteEnabled === true,
  );

  if (enabledAccounts.length === 0) return;

  for (const [email, settings] of enabledAccounts) {
    const delayMinutes = Number(settings.delayMinutes) || 5;

    try {
      const photos = await fetchPhotos(apiUrl, email);
      const expired = filterExpiredPhotos(photos, delayMinutes);

      if (expired.length === 0) continue;

      console.log(
        `[Auto-Delete] ${email}: ${expired.length} ảnh quá hạn, bắt đầu xóa...`,
      );

      deleting = true;

      // Open a minimized popup window for silent deletion
      const win = await chrome.windows.create({
        url: "https://photos.google.com/",
        type: "popup",
        state: "minimized",
        focused: false,
      });
      const tab = win.tabs[0];

      await waitTabLoad(tab.id);
      await ensureContentScript(tab.id);

      let deletedCount = 0;

      for (const photo of expired) {
        const url = buildPhotoUrl(photo);
        try {
          await chrome.tabs.update(tab.id, { url });
          await waitTabLoad(tab.id);
          await ensureContentScript(tab.id);

          const result = await chrome.tabs.sendMessage(tab.id, {
            action: "DELETE_CURRENT_PHOTO",
          });

          if (result?.success) {
            await removeLocalRecord(apiUrl, email, photo.id);
            deletedCount++;
          }
        } catch (err) {
          console.error(`[Auto-Delete] ${photo.fileName}: ${err.message}`);
        }
      }

      // Close the popup window
      try {
        await chrome.windows.remove(win.id);
      } catch (e) {}

      // Save last run info
      const local = await chrome.storage.local.get("lastAutoRun");
      const lastAutoRun = local.lastAutoRun || {};
      lastAutoRun[email] = {
        at: new Date().toISOString(),
        deleted: deletedCount,
        total: expired.length,
      };
      await chrome.storage.local.set({ lastAutoRun });

      if (deletedCount > 0) {
        console.log(
          `[Auto-Delete] ${email}: đã xóa ${deletedCount}/${expired.length} ảnh`,
        );
      }

      deleting = false;
    } catch (error) {
      console.error(`[Auto-Delete] ${email}: ${error.message}`);
      deleting = false;
    }
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runAutoDelete();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  syncAutoDeleteAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  syncAutoDeleteAlarm();
});

// ==========================================
// RESOLVE ACTIVE EMAIL (query content.js on photos tabs)
// ==========================================
async function resolveActiveEmail() {
  // Try active tab first
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (activeTab?.id && activeTab.url?.includes("photos.google.com")) {
    try {
      await ensureContentScript(activeTab.id);
      const result = await chrome.tabs.sendMessage(activeTab.id, {
        action: "GET_ACCOUNT",
      });
      if (result?.email) {
        await chrome.storage.local.set({
          activePhotosEmail: result.email.toLowerCase(),
          activePhotosEmailAt: Date.now(),
        });
        return result.email.toLowerCase();
      }
    } catch {
      /* fallback */
    }
  }

  // Try any photos tab
  const photosTabs = await chrome.tabs.query({
    url: "https://photos.google.com/*",
  });
  for (const tab of photosTabs) {
    if (!tab.id) continue;
    try {
      await ensureContentScript(tab.id);
      const result = await chrome.tabs.sendMessage(tab.id, {
        action: "GET_ACCOUNT",
      });
      if (result?.email) {
        await chrome.storage.local.set({
          activePhotosEmail: result.email.toLowerCase(),
          activePhotosEmailAt: Date.now(),
        });
        return result.email.toLowerCase();
      }
    } catch {
      /* try next */
    }
  }

  // Fallback to stored value
  const local = await chrome.storage.local.get("activePhotosEmail");
  return local.activePhotosEmail || "";
}

// ==========================================
// MESSAGE LISTENER
// ==========================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // --- Account detected by content.js ---
  if (message.action === "ACCOUNT_DETECTED" && message.email) {
    chrome.storage.local.set({
      activePhotosEmail: message.email.toLowerCase(),
      activePhotosEmailAt: Date.now(),
    });
    return false;
  }

  // --- Popup: get active email ---
  if (message.action === "GET_ACTIVE_EMAIL") {
    resolveActiveEmail()
      .then((email) => sendResponse({ email }))
      .catch((error) => sendResponse({ error: error.message, email: "" }));
    return true;
  }

  // --- Popup: get settings ---
  if (message.action === "GET_SETTINGS") {
    (async () => {
      const saved = await chrome.storage.sync.get([
        "apiUrl",
        "accountSettings",
      ]);
      const local = await chrome.storage.local.get([
        "activePhotosEmail",
        "lastAutoRun",
      ]);
      const email = (
        message.preferredEmail ||
        local.activePhotosEmail ||
        ""
      ).toLowerCase();
      const accountSettings = saved.accountSettings || {};
      const account = accountSettings[email] || {
        autoDeleteEnabled: false,
        delayMinutes: 5,
      };

      sendResponse({
        apiUrl: saved.apiUrl || "http://localhost:5000",
        email,
        autoDeleteEnabled: account.autoDeleteEnabled === true,
        delayMinutes: Number(account.delayMinutes) || 5,
        lastAutoRun: local.lastAutoRun || null,
      });
    })().catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  // --- Popup: get photo stats ---
  if (message.action === "GET_PHOTO_STATS") {
    if (!message.email) {
      sendResponse({ error: "Chưa nhận diện được email Google Photos" });
      return false;
    }
    fetchPhotos(message.apiUrl, message.email)
      .then((photos) => {
        const delayMinutes = message.delayMinutes || 5;
        const delayMs = delayMinutes * 60 * 1000;
        const now = Date.now();
        const expired = photos.filter((p) => {
          if (!buildPhotoUrl(p) || !p.createdAt) return false;
          const t = new Date(p.createdAt).getTime();
          return !isNaN(t) && now - t >= delayMs;
        });
        sendResponse({
          stats: {
            total: photos.length,
            expired: expired.length,
            pending: Math.max(photos.length - expired.length, 0),
          },
        });
      })
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  // --- Popup: save auto-delete settings ---
  if (message.action === "SET_AUTO_DELETE") {
    (async () => {
      const email = (message.email || "").toLowerCase();
      if (!email) throw new Error("Chưa nhận diện được email");

      const saved = await chrome.storage.sync.get("accountSettings");
      const accountSettings = { ...(saved.accountSettings || {}) };
      accountSettings[email] = {
        autoDeleteEnabled: message.enabled === true,
        delayMinutes: message.delayMinutes || 5,
      };

      await chrome.storage.sync.set({
        apiUrl: message.apiUrl,
        accountSettings,
      });
      await syncAutoDeleteAlarm();
      sendResponse({ success: true });
    })().catch((error) =>
      sendResponse({ error: error.message || String(error) }),
    );
    return true;
  }

  // --- Web App: start delete all ---
  if (message.action === "START_DELETE_ALL") {
    startDeleteAll(message.apiUrl, message.email)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Popup: start delete (manual) ---
  if (message.action === "START_DELETE") {
    startDeleteAll(message.apiUrl, message.email, {
      mode: message.mode || "all",
      delayMinutes: message.delayMinutes || 5,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Popup: get current status ---
  if (message.action === "GET_STATUS") {
    sendResponse({ deleting });
    return false;
  }
});
