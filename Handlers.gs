/**************************************************************
 * Handlers.gs
 * ------------------------------------------------------------
 * This file contains the handler functions for the different
 * intents that the bot can understand.
 **************************************************************/

/**
 * @description Handles the "add_expense" intent.
 * It adds one or more expense items to the sheet for a given date.
 * @param {number} chatId - The chat ID of the user.
 * @param {object} args - The arguments for the intent, including the
 * date and a list of items to add.
 */
function handleAddExpense(chatId, args) {
  try {
    log(`handleAddExpense started. Args: ${JSON.stringify(args)}`);

    // 1. Validate the arguments
    if (!args.date || !args.items || args.items.length === 0) {
      sendMessage(chatId, "⚠️ Please specify items and amounts. Example: `Add coffee 25 today`.");
      log("handleAddExpense: Missing date or items.");
      return;
    }

    // 2. Find the row for the given date
    const rowNumber = findRowByDate(args.date);
    if (!rowNumber) {
      sendMessage(chatId, `❌ I couldn't find a row for ${args.date}. Please make sure the date row exists in your sheet.`);
      log(`handleAddExpense: No row found for date: ${args.date}`);
      return;
    }

    // 3. Get the current values from the sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const amountCell = sheet.getRange(rowNumber, AMOUNT_COL);
    const descCell = sheet.getRange(rowNumber, DESC_COL);

    let currentAmount = parseFloat(amountCell.getValue()) || 0;
    let currentDesc = (descCell.getValue() || "").toString();
    log(`handleAddExpense: Found row ${rowNumber}. Current val: ${currentAmount}, "${currentDesc}"`);

    // 4. Filter out items that are already in the sheet
    const existingItems = parseItems(currentDesc);
    const existingItemsMap = new Map(existingItems.map(i => [i.item.toLowerCase(), i]));

    const newItemsToAdd = [];
    for (const modelItem of args.items) {
      const name = (modelItem.item || "").toString().trim();
      const amt = Number(modelItem.amount);
      if (!name || isNaN(amt) || amt <= 0) continue; // Basic validation

      if (!existingItemsMap.has(name.toLowerCase())) {
        newItemsToAdd.push({ item: name, amount: amt });
      }
    }

    if (newItemsToAdd.length === 0) {
      sendMessage(chatId, `ℹ️ No new expenses to add for ${args.date}. Total is still *₹${fmt(currentAmount)}*.`);
      log("handleAddExpense: No new items found after filtering.");
      return;
    }

    // 5. Calculate the new total and description
    let addTotal = 0;
    for (const it of newItemsToAdd) {
      addTotal += it.amount;
    }

    const addSegments = newItemsToAdd.map(x => `${x.item} ${fmt(x.amount)}`).join(", ");
    const finalAmount = currentAmount + addTotal;
    const finalDesc = mergeDescriptions(currentDesc, addSegments);
    log(`handleAddExpense: New total: ${finalAmount}. New desc: "${finalDesc}"`);

    // 6. Update the sheet with the new values
    amountCell.setValue(Number(finalAmount));
    descCell.setValue(finalDesc);

    sendMessage(chatId, `✅ Added: ${addSegments}\nNew total for ${args.date}: *₹${fmt(finalAmount)}*.`);
  } catch (err) {
    log("handleAddExpense error: " + JSON.stringify(err, null, 2));
    sendMessage(chatId, "⚠️ Couldn't add the expense. Please try again.");
  }
}

/**
 * @description Handles the "get_summary" intent.
 * It retrieves a summary of expenses for a given date or date range.
 * @param {number} chatId - The chat ID of the user.
 * @param {object} args - The arguments for the intent, including the
 * date or date range.
 */
function handleGetSummary(chatId, args) {
  try {
    log(`handleGetSummary started. Args: ${JSON.stringify(args)}`);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const values = (lastRow > 0) ? sheet.getRange(1, 1, lastRow, 3).getValues() : [];

    // 1. Handle range summaries
    if (args.start_date && args.end_date) {
      log(`handleGetSummary: Range summary for ${args.start_date} to ${args.end_date}`);
      const start = new Date(args.start_date);
      const end = new Date(args.end_date);
      const startKey = yyyymmdd(start);
      const endKey = yyyymmdd(end);

      let total = 0;
      const dayTotals = [];
      const itemRows = []; // {raw: desc, rowIndex, dateDisplay}

      const dateDisplayValues = sheet.getRange(1, DATE_COL, lastRow, 1).getDisplayValues();

      for (let i = 0; i < values.length; i++) {
        const dateText = dateDisplayValues[i][0];
        if (!dateText) continue;
        const rowDate = parseSheetDate(dateText, start.getFullYear());
        if (!rowDate) continue;
        const k = yyyymmdd(rowDate);
        if (k >= startKey && k <= endKey) {
          const amt = Number(values[i][AMOUNT_COL - 1]) || 0;
          total += amt;
          dayTotals.push({ date: dateText, amount: amt });
          const d = (values[i][DESC_COL - 1] || "").toString();
          if (d) itemRows.push({ raw: d, rowIndex: i + 1, dateDisplay: dateText });
        }
      }

      if (args.summary_type === "highest_day" && dayTotals.length > 0) {
        const maxDay = dayTotals.reduce((a, b) => (b.amount > a.amount ? b : a));
        sendMessage(chatId, `📊 Highest day between ${args.start_date} and ${args.end_date}: *${maxDay.date}* with *₹${fmt(maxDay.amount)}*.`);
        return;
      }

      if (args.summary_type === "lowest_day" && dayTotals.length > 0) {
        const minDay = dayTotals.reduce((a, b) => (b.amount < a.amount ? b : a));
        sendMessage(
          chatId,
          `📊 Lowest day between ${args.start_date} and ${args.end_date}: *${minDay.date}* with *₹${fmt(minDay.amount)}*.`
        );
        return;
      }

      if (args.summary_type === "highest_item") {
        let maxItem = { item: "", amount: 0, date: "" };
        for (const entry of itemRows) {
          const parsed = parseItems(entry.raw);
          for (const p of parsed) {
            if (p.amount > maxItem.amount) {
              maxItem = { item: p.item, amount: p.amount, date: entry.dateDisplay };
            }
          }
        }
        if (maxItem.amount > 0) {
          sendMessage(chatId, `📌 Highest single expense: *${maxItem.item}* ₹${fmt(maxItem.amount)} on ${maxItem.date}.`);
        } else {
          sendMessage(chatId, `No individual items found between ${args.start_date} and ${args.end_date}. Total: *₹${fmt(total)}*.`);
        }
        return;
      }

      if (args.summary_type === "lowest_item") {
        let minItem = { item: "", amount: Infinity, date: "" };
        for (const entry of itemRows) {
          const parsed = parseItems(entry.raw);
          for (const p of parsed) {
            if (p.amount > 0 && p.amount < minItem.amount) {
              minItem = { item: p.item, amount: p.amount, date: entry.dateDisplay };
            }
          }
        }
        if (minItem.amount !== Infinity) {
          sendMessage(
            chatId,
            `📌 Lowest single expense: *${minItem.item}* ₹${fmt(minItem.amount)} on ${minItem.date}.`
          );
        } else {
          sendMessage(
            chatId,
            `No individual items found between ${args.start_date} and ${args.end_date}. Total: *₹${fmt(total)}*.`
          );
        }
        return;
      }

      sendMessage(chatId, `From ${args.start_date} to ${args.end_date}, total: *₹${fmt(total)}*.`);
      return;
    }

    // 2. Handle single date summaries
    if (args.date) {
      log(`handleGetSummary: Single date summary for ${args.date}`);
      const rowNumber = findRowByDate(args.date);
      if (!rowNumber) {
        sendMessage(chatId, `❌ I couldn't find the date row for ${args.date}.`);
        log(`handleGetSummary: No row found for date: ${args.date}`);
        return;
      }
      const amount = Number(sheet.getRange(rowNumber, AMOUNT_COL).getValue()) || 0;
      const desc = (sheet.getRange(rowNumber, DESC_COL).getValue() || "").toString();
      sendMessage(chatId, `On ${args.date}, total: *₹${fmt(amount)}*.\nExpenses: ${desc || "No expenses recorded."}`);
      return;
    }

    log("handleGetSummary: Could not determine date or range.");
    sendMessage(chatId, "🤔 I couldn't figure out the date or range. Try `summary for July` or `expenses this week`.");
  } catch (err) {
    log("handleGetSummary error: " + JSON.stringify(err, null, 2));
    sendMessage(chatId, "⚠️ I had trouble computing the summary. Please try again.");
  }
}

/**
 * @description Handles the "update_expense" and "delete_expense" intents.
 * It modifies an existing expense item in the sheet.
 * @param {number} chatId - The chat ID of the user.
 * @param {object} args - The arguments for the intent, including the
 * date and the action to perform.
 */
function handleModification(chatId, args) {
  try {
    const targetDate = args.date;
    const actionText = (args.action_text || args.raw_text || "").toString().trim();

    log(`handleModification started for date: ${targetDate} with action: "${actionText}"`);

    // 1. Validate the arguments
    if (!targetDate || !actionText) {
      sendMessage(chatId, "⚠️ I couldn't understand what you want to modify.");
      return;
    }

    // 2. Find the row for the given date
    const rowNumber = findRowByDate(targetDate);
    if (!rowNumber) {
      sendMessage(chatId, `❌ No row found for ${targetDate}`);
      log(`handleModification: No row found for ${targetDate}`);
      return;
    }

    // 3. Get the current values from the sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const amountCell = sheet.getRange(rowNumber, AMOUNT_COL);
    const descCell = sheet.getRange(rowNumber, DESC_COL);

    const currentAmount = Number(amountCell.getValue()) || 0;
    const currentDesc = (descCell.getValue() || "").toString();

    log(`handleModification - targetDate=${targetDate} row=${rowNumber}`);
    log(`actionText: ${actionText}`);
    log(`before: desc="${currentDesc}" amount=${currentAmount}`);

    let modification = null;

    // 4. Determine if the user wants to clear all expenses
    const removeAllRegex = /\b(remove|delete|clear)\b.*\b(all|everything)\b.*\b(expense|expenses)\b/i;
    if (removeAllRegex.test(actionText)) {
      log("Applying deterministic 'clear all' rule.");
      modification = { newDescription: "", newAmount: 0 };
    } else {
      log("Calling Modification LLM API...");
      modification = callModificationAPI(currentDesc, currentAmount, actionText, targetDate);
    }

    if (!modification) {
      sendMessage(chatId, `⚠️ Couldn't apply update for ${targetDate}`);
      log("handleModification: callModificationAPI returned null.");
      return;
    }

    log(`Modification API result: ${JSON.stringify(modification)}`);

    // 5. Check if any changes were made
    const beforeNormalized = currentDesc.trim();
    const afterNormalized = (modification.newDescription || "").trim();
    const beforeAmount = Number(currentAmount) || 0;
    const afterAmount = Number(modification.newAmount) || 0;

    if (beforeNormalized === afterNormalized && beforeAmount === afterAmount) {
      sendMessage(chatId, `ℹ️ No changes needed for ${targetDate} (total ₹${fmt(afterAmount)})`);
      log("handleModification: No changes detected.");
      return;
    }

    // 6. Apply the update to the sheet
    amountCell.setValue(afterAmount);
    descCell.setValue(afterNormalized);
    log(`handleModification: Updated sheet. New Amount=${afterAmount}. New Desc="${afterNormalized}"`);

    // 7. Describe the changes to the user
    const beforeItems = parseItems(beforeNormalized);
    const afterItems = parseItems(afterNormalized);
    const diffMessage = describeDiff(beforeItems, afterItems);

    sendMessage(chatId, `✅ ${targetDate}: ${diffMessage} (new total ₹${fmt(afterAmount)})`);

  } catch (err) {
    log("handleModification error: " + JSON.stringify(err, null, 2));
    sendMessage(chatId, "⚠️ Something went wrong while applying modifications.");
  }
}
