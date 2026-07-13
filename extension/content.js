// Guard against duplicate injection
if (!window.__GOOGLE_PHOTOS_EXTENSION_LOADED) {
  window.__GOOGLE_PHOTOS_EXTENSION_LOADED = true;

  (function () {
    "use strict";

    const LOG = (...args) => console.log("[GP-Extension]", ...args);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // ==========================================
    // 1. BRIDGE: WEB APP <-> EXTENSION
    // ==========================================
    LOG("Bridge loaded on:", window.location.href);

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "GOOGLE_PHOTOS_EXTENSION_COMMAND") {
        LOG("Web App -> Extension:", event.data.action);
        chrome.runtime.sendMessage(event.data, (response) => {
          if (chrome.runtime.lastError) {
            LOG("Error sending message:", chrome.runtime.lastError.message);
          } else {
            LOG("Response from background:", response);
          }
        });
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "GOOGLE_PHOTOS_EXTENSION_EVENT") {
        window.postMessage(message, "*");
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "PING") {
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "GET_ACCOUNT") {
        const email = detectEmailFromPage();
        sendResponse({ email: email || "" });
        return false;
      }

      if (message.action === "DELETE_CURRENT_PHOTO") {
        deletePhotoOnPage()
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error.message || String(error),
            }),
          );
        return true;
      }
    });

    // ==========================================
    // 2. ACCOUNT DETECTION
    // ==========================================
    const detectEmailFromPage = () => {
      const accountBtn = document.querySelector(
        'a[aria-label*="@"], button[aria-label*="@"], [aria-label*="Google Account"]',
      );
      if (accountBtn) {
        const label = accountBtn.getAttribute("aria-label") || "";
        const match = label.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (match) return match[0];
      }
      const allElements = document.querySelectorAll(
        "header a, header span, [data-email]",
      );
      for (const el of allElements) {
        const text = el.getAttribute("data-email") || el.textContent || "";
        const match = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (match) return match[0];
      }
      return "";
    };

    setTimeout(() => {
      const email = detectEmailFromPage();
      if (email) {
        chrome.runtime.sendMessage({ action: "ACCOUNT_DETECTED", email });
      }
    }, 2000);

    // ==========================================
    // 3. GOOGLE PHOTOS DELETE AUTOMATION (optimized)
    // ==========================================

    const POLL_MS = 200;
    const TRASH_PATTERN =
      /move to trash|chuyển vào thùng rác|đưa vào thùng rác|delete|xóa|thùng rác/i;

    const isVisible = (el) =>
      el instanceof HTMLElement && (el.offsetWidth > 0 || el.offsetHeight > 0);

    const waitFor = async (check, maxMs = 6000, intervalMs = POLL_MS) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        const result = check();
        if (result) return result;
        await sleep(intervalMs);
      }
      return null;
    };

    const findTrashButton = () => {
      const ariaLabels = [
        "Move to trash",
        "Chuyển vào thùng rác",
        "Đưa vào thùng rác",
        "Delete",
        "Xóa",
        "Move to Trash",
        "Move to bin",
      ];

      for (const label of ariaLabels) {
        const el = document.querySelector(`[aria-label="${label}"]`);
        if (isVisible(el)) return el;
      }

      const buttons = document.querySelectorAll(
        'button, [role="button"], [role="menuitem"], [jsaction]',
      );
      for (const btn of buttons) {
        if (!isVisible(btn)) continue;
        const combined = `${btn.getAttribute("aria-label") || ""} ${btn.textContent || ""} ${btn.getAttribute("title") || ""}`;
        if (TRASH_PATTERN.test(combined)) return btn;
      }

      return null;
    };

    const findMoreButton = () => {
      for (const label of [
        "More options",
        "Tùy chọn khác",
        "More actions",
        "Thao tác khác",
        "More",
      ]) {
        const el = document.querySelector(`[aria-label="${label}"]`);
        if (isVisible(el)) return el;
      }
      return null;
    };

    const findConfirmButton = () => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-is-dialog]',
      );

      for (const dialog of dialogs) {
        const buttons = dialog.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
          if (!isVisible(btn)) continue;
          const text = (btn.textContent || "").trim();
          const aria = btn.getAttribute("aria-label") || "";
          if (/cancel|hủy|đóng|close|^×$/i.test(`${text} ${aria}`)) continue;
          return btn;
        }
      }

      const overlays = document.querySelectorAll(
        '[class*="dialog"], [class*="modal"], [class*="overlay"], [class*="popup"]',
      );
      for (const overlay of overlays) {
        if (!isVisible(overlay)) continue;
        const style = window.getComputedStyle(overlay);
        if (style.position !== "fixed" && style.position !== "absolute")
          continue;

        const buttons = overlay.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
          if (!isVisible(btn)) continue;
          const text = (btn.textContent || "").trim();
          if (/cancel|hủy|đóng|close|^×$/i.test(text)) continue;
          return btn;
        }
      }

      return null;
    };

    const clickTrash = async () => {
      let btn = await waitFor(findTrashButton, 5000);
      if (btn) {
        btn.click();
        return true;
      }

      const moreBtn = findMoreButton();
      if (!moreBtn) return false;

      moreBtn.click();
      btn = await waitFor(() => {
        const items = document.querySelectorAll(
          '[role="menuitem"], [role="menuitemradio"], [role="option"]',
        );
        for (const item of items) {
          if (!isVisible(item)) continue;
          const text = `${item.getAttribute("aria-label") || ""} ${item.textContent || ""}`;
          if (TRASH_PATTERN.test(text)) return item;
        }
        return null;
      }, 3000);

      if (btn) {
        btn.click();
        return true;
      }

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return false;
    };

    const confirmTrashDialog = async () => {
      const btn = await waitFor(findConfirmButton, 4000);
      if (!btn) return false;

      btn.click();
      await sleep(600);
      return true;
    };

    const waitForPageReady = async () => {
      const ready = await waitFor(() => {
        if (document.readyState !== "complete") return null;
        const hasContent =
          document.querySelector('img[src*="googleusercontent"]') ||
          document.querySelector('img[src*="lh3"]') ||
          document.querySelector('[role="main"]') ||
          document.querySelector("c-wiz");
        return hasContent ? true : null;
      }, 6000);

      return !!ready;
    };

    const isPhotoMissingOnPage = () => {
      const text = (document.body?.innerText || "").slice(0, 5000);
      return /can't access photo|cannot access photo|doesn't exist or your current account doesn't have permission|không thể truy cập ảnh|không tồn tại hoặc tài khoản hiện tại không có quyền/i.test(
        text,
      );
    };

    const deletePhotoOnPage = async () => {
      LOG("DELETE start:", window.location.href);
      await waitForPageReady();

      if (isPhotoMissingOnPage()) {
        return {
          success: false,
          orphan: true,
          error: "Ảnh không còn trên Google Photos",
        };
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const clicked = await clickTrash();
        if (!clicked) {
          if (isPhotoMissingOnPage()) {
            return {
              success: false,
              orphan: true,
              error: "Ảnh không còn trên Google Photos",
            };
          }
          await sleep(300);
          continue;
        }

        const confirmed = await confirmTrashDialog();
        if (confirmed) {
          LOG("DELETE success");
          return { success: true };
        }

        await sleep(300);
      }

      if (isPhotoMissingOnPage()) {
        return {
          success: false,
          orphan: true,
          error: "Ảnh không còn trên Google Photos",
        };
      }

      return {
        success: false,
        error: "Không tìm thấy nút xóa trên Google Photos.",
      };
    };
  })();
}
