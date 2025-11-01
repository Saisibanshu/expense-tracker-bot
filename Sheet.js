/**************************************************************
 * Sheet.gs
 * ------------------------------------------------------------
 * This file contains all the functions that interact with the
 * Google Sheet.
 **************************************************************/

/**
 * @description Finds a row in the sheet by its ISO date.
 * It searches the first column of the sheet for a date that
 * matches the given date string.
 * @param {string} dateString - The date string in ISO format.
 * @returns {number|null} The row number or null if not found.
 */
function findRowByDate(dateString) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
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
 * @description Logs a message to the "Logs" sheet.
 * This function appends a new row to the "Logs" sheet with the
 * current timestamp and the given message.
 * @param {string} message - The message to log.
 */
function log(message) {
  try {
    // Fetch LOG_SHEET_ID from script properties
    const LOG_SHEET_ID = PropertiesService.getScriptProperties().getProperty("LOG_SHEET_ID");
    if (!LOG_SHEET_ID) {
      console.error("LOG_SHEET_ID not set in script properties.");
      // Fallback to Stackdriver if logging sheet ID is missing
      console.log("log() fallback: " + message);
      return;
    }
    const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
    const sheet = ss.getSheetByName("Logs") || ss.insertSheet("Logs");
    sheet.appendRow([new Date(), message]);
  } catch (e) {
    // Fall back to Stackdriver if logging sheet missing
    console.error("log() fallback: " + message + " (reason: " + e.toString() + ")");
  }
}
