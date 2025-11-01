/**************************************************************
 * Utils.gs
 * ------------------------------------------------------------
 * This file contains utility functions that are used throughout
 * the project.
 **************************************************************/

/**
 * @description Formats a number to a string with up to 2 decimal places.
 * @param {number} num - The number to format.
 * @returns {string} The formatted number.
 */
function fmt(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  const n = Number(num);
  return (n % 1 === 0) ? String(n) : n.toFixed(2);
}

/**
 * @description Merges new expense descriptions with the current description.
 * @param {string} currentDesc - The current description.
 * @param {string} addSegments - The new description segments.
 * @returns {string} The merged description.
 */
function mergeDescriptions(currentDesc, addSegments) {
  const cleanCurrent = (currentDesc || "").toString().trim();
  if (!cleanCurrent || cleanCurrent.toLowerCase() === "no expense" || cleanCurrent === "0") {
    return addSegments;
  }
  return `${cleanCurrent}, ${addSegments}`;
}

/**
 * @description Parses a canonical description into an array of items.
 * @param {string} desc - The description to parse.
 * @returns {Array<object>} An array of item objects.
 */
function parseItems(desc) {
  const out = [];
  if (!desc) return out;
  // Split by commas, parse "<item> <amount>" at end
  const parts = desc.split(",").map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)$/);
    if (m) {
      out.push({ item: m[1].trim(), amount: Number(m[2]) });
    }
  }
  return out;
}

/**
 * @description Describes the difference between two arrays of items.
 * @param {Array<object>} before - The array of items before the change.
 * @param {Array<object>} after - The array of items after the change.
 * @returns {string} A string describing the difference.
 */
function describeDiff(before, after) {
  const bMap = {}; before.forEach(x => bMap[x.item] = x.amount);
  const aMap = {}; after.forEach(x => aMap[x.item] = x.amount);

  const msgs = [];
  for (const b in bMap) if (!(b in aMap)) msgs.push(`Removed ${b} ₹${fmt(bMap[b])}`);
  for (const a in aMap) if (!(a in bMap)) msgs.push(`Added ${a} ₹${fmt(aMap[a])}`);
  for (const k in aMap) if (bMap[k] && aMap[k] !== bMap[k]) msgs.push(`Updated ${k}: ${fmt(bMap[k])} → ${fmt(aMap[k])}`);
  return msgs.join("; ") || "No visible change.";
}

/**
 * @description Converts a Date object to a YYYYMMDD number.
 * @param {Date} d - The Date object.
 * @returns {number} The date in YYYYMMDD format.
 */
function yyyymmdd(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * @description Converts a Date object to an ISO date string (YYYY-MM-DD).
 * @param {Date} d - The Date object.
 * @returns {string} The date in ISO format.
 */
function toISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * @description Parses date strings from Column A.
 * @param {string} cellText - The text from the date cell.
 * @param {number} yearHint - The year to use as a hint.
 * @returns {Date|null} The parsed Date object or null on error.
 */
function parseSheetDate(cellText, yearHint) {
  if (!cellText) return null;
  try {
    const txt = cellText.toString().trim().toLowerCase()
      .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")   // remove ordinals
      .replace(/[,\.]/g, " ")                         // punctuation to space
      .replace(/\s+/g, " ")
      .trim();

    const months = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };

    // try formats: "1 jan", "jan 1", "1-jan", "jan-1"
    const tokens = txt.split(/[\s\-\/]+/);
    let day = null, mon = null;

    // find numeric + month token
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (months.hasOwnProperty(t)) mon = months[t];
      if (/^\d{1,2}$/.test(t)) day = parseInt(t, 10);
    }

    if (day != null && mon != null) {
      const y = (typeof yearHint === "number" && !isNaN(yearHint)) ? yearHint : (new Date()).getFullYear();
      const d = new Date(y, mon, day);
      if (!isNaN(d.getTime())) return d;
    }

    // final fallback: try native parser by injecting year hint
    const fallback = new Date(`${cellText} ${yearHint}`);
    if (!isNaN(fallback.getTime())) return fallback;
    return null;
  } catch (e) {
    log("parseSheetDate error: " + JSON.stringify(e, null, 2) + " for text: " + JSON.stringify(cellText, null, 2));
    return null;
  }
}

/**
 * @description Gets the start of the current month.
 * @returns {string} The start of the month in ISO format.
 */
function startOfThisMonth() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * @description Gets the end of the current month.
 * @returns {string} The end of the month in ISO format.
 */
function endOfThisMonth() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * @description Gets the conversation history from the cache.
 * @param {number} chatId - The chat ID.
 * @returns {string} The conversation history.
 */
function getConversationHistory(chatId) {
  const cache = CacheService.getScriptCache();
  const historyJson = cache.get(String(chatId) + "_hist");
  const history = historyJson ? JSON.parse(historyJson) : [];
  return history.map(turn => `User: ${turn.user}\nBot: ${turn.bot}`).join("\n");
}

/**
 * @description Updates the conversation history in the cache.
 * @param {number} chatId - The chat ID.
 * @param {string} userInput - The user's input.
 * @param {string} botResponse - The bot's response.
 */
function updateConversationHistory(chatId, userInput, botResponse) {
  const cache = CacheService.getScriptCache();
  const historyJson = cache.get(String(chatId) + "_hist");
  let history = historyJson ? JSON.parse(historyJson) : [];
  history.push({ user: userInput, bot: botResponse });
  if (history.length > MAX_HISTORY_TURNS) history = history.slice(-MAX_HISTORY_TURNS);
  cache.put(String(chatId) + "_hist", JSON.stringify(history), 600);
}
