const apiUrlInput = document.getElementById("apiUrl");
const emailInput = document.getElementById("email");
const accountBanner = document.getElementById("accountBanner");
const refreshAccountBtn = document.getElementById("refreshAccountBtn");
const autoDeleteEnabled = document.getElementById("autoDeleteEnabled");
const delayMinutesInput = document.getElementById("delayMinutes");
const autoStatus = document.getElementById("autoStatus");
const photoStats = document.getElementById("photoStats");
const saveAutoBtn = document.getElementById("saveAutoBtn");
const deleteExpiredBtn = document.getElementById("deleteExpiredBtn");
const deleteBtn = document.getElementById("deleteBtn");
const statusEl = document.getElementById("status");

function showStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function setLoading(loading) {
  deleteBtn.disabled = loading;
  deleteExpiredBtn.disabled = loading;
  deleteBtn.textContent = loading ? "Đang xóa..." : "Xóa ngay (tất cả)";
  deleteExpiredBtn.textContent = loading ? "Đang xóa..." : "Xóa ảnh đã quá hạn";
}

function updateAccountBanner(email) {
  if (email) {
    accountBanner.textContent = `✅ Đang dùng nick: ${email}`;
    accountBanner.className = "account-banner";
    emailInput.value = email;
    return;
  }

  accountBanner.textContent =
    "⚠️ Chưa nhận diện được nick. Mở tab photos.google.com đang đăng nhập, rồi bấm ↻";
  accountBanner.className = "account-banner warn";
  emailInput.value = "";
}

function updateAutoStatus(enabled, delayMinutes, email, lastAutoRun) {
  const accountRun = email && lastAutoRun ? lastAutoRun[email] : null;

  if (enabled) {
    let text = `✅ Tự động xóa nick này: BẬT — sau ${delayMinutes} phút`;
    if (accountRun?.at) {
      const time = new Date(accountRun.at).toLocaleTimeString("vi-VN");
      text += `\nLần chạy gần nhất: ${time}`;
      if (accountRun.deleted > 0) {
        text += ` (đã xóa ${accountRun.deleted} ảnh)`;
      }
    }
    autoStatus.textContent = text;
    autoStatus.className = "auto-status active";
  } else {
    autoStatus.textContent = "⏸️ Tự động xóa nick này: TẮT";
    autoStatus.className = "auto-status";
  }
}

function updatePhotoStats(stats, email) {
  if (!email) {
    photoStats.textContent = "Cần nhận diện nick Google Photos trước.";
    return;
  }

  if (!stats) {
    photoStats.textContent = "Chưa có dữ liệu ảnh.";
    return;
  }

  photoStats.innerHTML = `
    <strong>📷 ${email}</strong><br>
    <strong>Tổng:</strong> ${stats.total} ảnh<br>
    <strong>⏳ Chưa đến hạn:</strong> ${stats.pending} ảnh<br>
    <strong>🗑️ Đủ điều kiện xóa:</strong> ${stats.expired} ảnh
  `;
}

async function detectActiveEmail() {
  const result = await chrome.runtime.sendMessage({
    action: "GET_ACTIVE_EMAIL",
  });
  return result?.email || "";
}

async function refreshPhotoStats() {
  const apiUrl = apiUrlInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const delayMinutes = Number(delayMinutesInput.value) || 5;

  if (!email) {
    updatePhotoStats(null, "");
    return;
  }

  if (!apiUrl) {
    photoStats.textContent = "Nhập Backend API URL.";
    return;
  }

  const result = await chrome.runtime.sendMessage({
    action: "GET_PHOTO_STATS",
    apiUrl,
    email,
    delayMinutes,
  });

  if (result?.error) {
    photoStats.textContent = `Lỗi: ${result.error}`;
    return;
  }

  updatePhotoStats(result.stats, email);
}

async function loadSettings() {
  const detectedEmail = await detectActiveEmail();
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "GET_SETTINGS",
      preferredEmail: detectedEmail,
    });
  } catch (e) {
    showStatus("Không kết nối được background. Thử reload extension.", "error");
    return;
  }

  if (!result) {
    showStatus("Background chưa sẵn sàng. Thử reload extension.", "error");
    return;
  }

  if (result.error) {
    showStatus(result.error, "error");
    return;
  }

  apiUrlInput.value = result.apiUrl || "http://localhost:5000";
  updateAccountBanner(result.email || detectedEmail);
  autoDeleteEnabled.checked = result.autoDeleteEnabled === true;
  delayMinutesInput.value = result.delayMinutes || 5;
  updateAutoStatus(
    result.autoDeleteEnabled,
    result.delayMinutes || 5,
    result.email,
    result.lastAutoRun,
  );

  await refreshPhotoStats();
}

async function saveAutoSettings() {
  const apiUrl = apiUrlInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const delayMinutes = Number(delayMinutesInput.value) || 5;

  if (!apiUrl) {
    showStatus("Vui lòng nhập Backend API URL.", "error");
    return false;
  }

  if (!email) {
    showStatus(
      "Chưa nhận diện được nick. Mở photos.google.com rồi bấm ↻",
      "error",
    );
    return false;
  }

  if (delayMinutes < 1) {
    showStatus("Thời gian xóa phải >= 1 phút.", "error");
    return false;
  }

  const result = await chrome.runtime.sendMessage({
    action: "SET_AUTO_DELETE",
    apiUrl,
    email,
    enabled: autoDeleteEnabled.checked,
    delayMinutes,
  });

  if (result?.error) {
    showStatus(result.error, "error");
    return false;
  }

  updateAutoStatus(autoDeleteEnabled.checked, delayMinutes, email);
  await refreshPhotoStats();
  showStatus(
    autoDeleteEnabled.checked
      ? `Đã bật tự động xóa cho ${email} sau ${delayMinutes} phút.`
      : `Đã tắt tự động xóa cho ${email}.`,
    "success",
  );
  return true;
}

async function runDelete(mode) {
  const apiUrl = apiUrlInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const delayMinutes = Number(delayMinutesInput.value) || 5;

  if (!apiUrl || !email) {
    showStatus("Chưa nhận diện được nick hoặc thiếu API URL.", "error");
    return;
  }

  const confirmText =
    mode === "expired"
      ? `Xóa ảnh đã upload quá ${delayMinutes} phút của ${email}?`
      : `Xóa TẤT CẢ ảnh đã upload của ${email} ngay bây giờ?`;

  if (!confirm(confirmText)) {
    return;
  }

  setLoading(true);
  showStatus("Đang mở Google Photos và xóa từng ảnh...", "info");

  try {
    const result = await chrome.runtime.sendMessage({
      action: "START_DELETE",
      apiUrl,
      email,
      mode,
      delayMinutes,
    });

    if (result?.error) {
      showStatus(result.error, "error");
      return;
    }

    let message =
      result.message || `Đã xóa ${result.deleted}/${result.total} ảnh`;
    if (result.errors?.length) {
      message += `\n\nLỗi:\n${result.errors.slice(0, 3).join("\n")}`;
      if (result.errors.length > 3) {
        message += `\n... và ${result.errors.length - 3} lỗi khác`;
      }
    }

    showStatus(message, result.deleted > 0 ? "success" : "info");
    await refreshPhotoStats();
  } catch (error) {
    showStatus(error.message || "Không thể chạy extension.", "error");
  } finally {
    setLoading(false);
  }
}

refreshAccountBtn.addEventListener("click", async () => {
  accountBanner.textContent = "Đang nhận diện tài khoản...";
  const email = await detectActiveEmail();
  updateAccountBanner(email);

  if (!email) {
    showStatus(
      "Không tìm thấy email. Hãy mở photos.google.com đã đăng nhập.",
      "error",
    );
    return;
  }

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "GET_SETTINGS",
      preferredEmail: email,
    });
  } catch (e) {
    showStatus("Lỗi kết nối background.", "error");
    return;
  }

  if (!result) return;

  autoDeleteEnabled.checked = result.autoDeleteEnabled === true;
  delayMinutesInput.value = result.delayMinutes || 5;
  updateAutoStatus(
    result.autoDeleteEnabled,
    result.delayMinutes || 5,
    email,
    result.lastAutoRun,
  );
  await refreshPhotoStats();
  showStatus(`Đã nhận diện nick: ${email}`, "success");
});

saveAutoBtn.addEventListener("click", saveAutoSettings);
deleteExpiredBtn.addEventListener("click", () => runDelete("expired"));
deleteBtn.addEventListener("click", () => runDelete("all"));
apiUrlInput.addEventListener("change", refreshPhotoStats);
delayMinutesInput.addEventListener("change", refreshPhotoStats);

loadSettings();
