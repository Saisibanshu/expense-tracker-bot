/**************************************************************
 * Constants.gs
 * ------------------------------------------------------------
 * This file contains the constants that are used throughout
 * the project.
 **************************************************************/

/**
 * @description The name of the sheet that contains the expenses.
 * @type {string}
 */
const SHEET_NAME = "Expenses";

/**
 * @description The maximum number of conversation turns to store in the cache.
 * @type {number}
 */
const MAX_HISTORY_TURNS = 6;

/**
 * @description The column number for the date in the sheet.
 * @type {number}
 */
const DATE_COL = 1;

/**
 * @description The column number for the amount in the sheet.
 * @type {number}
 */
const AMOUNT_COL = 2;

/**
 * @description The column number for the description in the sheet.
 * @type {number}
 */
const DESC_COL = 3;

/**
 * @description The model name to use for the Gemini API.
 * Free Tier Models & Approx. Limits (Project-wide):
 * - "gemini-2.5-flash-lite" (Default): ~15–20 RPM, 1,000 RPD - Fastest, lowest latency.
 * - "gemini-2.5-flash": ~10 RPM, 1,500 RPD - Balanced reasoning and math.
 * - "gemini-1.5-flash": ~15 RPM, 1,500 RPD - Stable legacy model.
 * - "gemini-2.5-pro": ~2 RPM, 50 RPD - High intelligence but strict limits.
 * @type {string}
 */
const GEMINI_MODEL = "gemini-2.5-flash-lite";

/**
 * @description The fallback priority list of models to use when a 429 occurs.
 * @type {Array<string>}
 */
const GEMINI_MODELS_PRIORITY = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

