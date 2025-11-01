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
