/**************************************************************
 * Sheet.gs
 * ------------------------------------------------------------
 * This file contains all the functions that interact with the
 * Google Sheet.
 **************************************************************/

/**
 * @description The buffer for log statements to write in a single batch.
 * @type {Array<Array<Date|string>>}
 */
let logBuffer = [];

/**
 * @description Retrieves the correct expenses sheet dynamically based on the current year.
 * Checks for "Expenses [YEAR]", "[YEAR]", defaulting to SHEET_NAME ("Expenses") or the first sheet.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The Spreadsheet Sheet object.
 */
function getExpensesSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return null;
    
    const year = new Date().getFullYear();
    const yearSheetName = "Expenses " + year;
    
    let sheet = ss.getSheetByName(yearSheetName) || ss.getSheetByName(String(year));
    if (!sheet) {
      sheet = ss.getSheetByName(SHEET_NAME);
    }
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }
    return sheet;
  } catch (e) {
    console.error("getExpensesSheet error: " + e.toString());
    return null;
  }
}

/**
 * @description Finds a row in the sheet by its ISO date.
 * It searches the first column of the sheet for a date that
 * matches the given date string.
 * @param {string} dateString - The date string in ISO format.
 * @returns {number|null} The row number or null if not found.
 */
function findRowByDate(dateString) {
  try {
    const sheet = getExpensesSheet();
    if (!sheet) return null;

    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) return null;
    const targetKey = yyyymmdd(targetDate);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 0) return null;

    const dateDisplayValues = sheet.getRange(1, DATE_COL, lastRow, 1).getDisplayValues();
    for (let i = 0; i < dateDisplayValues.length; i++) {
      const cellText = dateDisplayValues[i][0];
      if (!cellText) continue;
      const rowDate = parseSheetDate(cellText, targetDate.getFullYear());
      if (!rowDate) continue;
      if (yyyymmdd(rowDate) === targetKey) return i + 1;
    }
    return null;
  } catch (e) {
    log("findRowByDate error: " + JSON.stringify(e, null, 2));
    return null;
  }
}

/**
 * @description Logs a message to the "Logs" sheet by adding it to the log buffer.
 * This function is non-blocking and relies on flushLogs() to execute at the end.
 * @param {string} message - The message to log.
 */
function log(message) {
  console.log(message); // Fallback to Stackdriver
  logBuffer.push([new Date(), message]);
}

/**
 * @description Flushes all buffered logs to the "Logs" sheet in a single batch.
 */
function flushLogs() {
  if (logBuffer.length === 0) return;
  try {
    const LOG_SHEET_ID = PropertiesService.getScriptProperties().getProperty("LOG_SHEET_ID");
    if (!LOG_SHEET_ID) {
      console.log("flushLogs() warning: LOG_SHEET_ID not set. Logs are output only to console.");
      return;
    }
    const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
    const sheet = ss.getSheetByName("Logs") || ss.insertSheet("Logs");
    sheet.getRange(sheet.getLastRow() + 1, 1, logBuffer.length, 2).setValues(logBuffer);
    logBuffer = [];
  } catch (e) {
    console.error("flushLogs() error: " + e.toString());
  }
}
