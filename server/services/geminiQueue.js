/**
 * geminiQueue.js
 * Semaphore queue，限制同時送給 Gemini 的請求數
 * 避免超過免費方案 15 RPM 限制
 */

const MAX_CONCURRENT = 8; // 安全低於 15 RPM

let active = 0;
const waiters = [];

/**
 * 佔用一個 Gemini 名額
 * 若已滿則等待，直到有人 release
 */
function acquire() {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENT) {
      active++;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

/**
 * 釋放名額，讓下一個等待者繼續
 */
function release() {
  if (waiters.length > 0) {
    const next = waiters.shift();
    next(); // 直接把名額交給下一位，不減 active
  } else {
    active--;
  }
}

function getStatus() {
  return { active, waiting: waiters.length };
}

module.exports = { acquire, release, getStatus };
