/**************************************************************
 Expense Tracker Bot - Google Apps Script (Model-first version)
 - Paste the entire file into Apps Script editor.
 - Set script properties: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, LOG_SHEET_ID, WEBAPP_URL
 - Sheet layout expected: Columns A=Date (display text like "1st Jan"),
                          B=Amount (number), C=Description (string)
 - All natural-language intent/range parsing is delegated to the model.
**************************************************************/

const SHEET_NAME = "Expenses";
const MAX_HISTORY_TURNS = 6;
const DATE_COL = 1, AMOUNT_COL = 2, DESC_COL = 3;

// ---------------------------
// Main webhook entry
// ---------------------------
function doPost(e) {
  let chatIdForError = null;
  try {
    const contents = JSON.parse(e.postData.contents);
    const message = contents.message || contents.edited_message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    chatIdForError = chatId;
    const text = message.text.trim();
    const history = getConversationHistory(chatId);

    // 1) Ask the model to route intent(s)
    const modelResponse = routeUserIntent(text, history);
    log("modelResponse_Intent: " + JSON.stringify(modelResponse, null, 2));

    if (!modelResponse || !modelResponse.content || !modelResponse.content.parts) {
      handleChat(chatId, text, history); // Fallback to chat if response is weird
      return;
    }

    const parts = modelResponse.content.parts;
    const functionCalls = parts.filter(part => part.functionCall); // Get all function calls

    // 2) Multi-action support (now native!)
    if (functionCalls.length > 0) {

      // Your smart sorting logic can stay!
      functionCalls.sort((a, b) => {
        const nameA = a.functionCall.name;
        const nameB = b.functionCall.name;
        const dateA = a.functionCall.args.date;
        const dateB = b.functionCall.args.date;

        if (dateA && dateB && dateA === dateB) {
          const rank = (name) =>
            (name === "delete_expense" || name === "update_expense") ? 0 :
              (name === "add_expense" ? 1 : 2);
          return rank(nameA) - rank(nameB);
        }
        return 0;
      });

      // Loop through all calls
      for (const part of functionCalls) {
        const call = part.functionCall;
        const args = call.args || {}; // The arguments are already a parsed JSON object

        // Add raw_text for logging/history
        args.raw_text = text;
        args.action_text = args.action_text || text; // Use arg if present, else full text

        updateConversationHistory(chatId, text, call.name); // Log the function name as the "bot response"

        switch (call.name) {
          case "add_expense":
            handleAddExpense(chatId, args);
            break;
          case "update_expense":
          case "delete_expense":
            handleModification(chatId, args);
            break;
          case "get_summary":
            handleGetSummary(chatId, args);
            break;
          default:
            sendMessage(chatId, `🤔 I understood the action '${call.name}' but don't know how to perform it.`);
        }
      }
      return;
    }

    // 3) No function call = chat
    const chatResponse = parts.find(part => part.text);
    if (chatResponse && chatResponse.text) {
      updateConversationHistory(chatId, text, chatResponse.text);
      sendMessage(chatId, chatResponse.text);
    } else {
      // Fallback if there's no function and no text
      handleChat(chatId, text, history);
    }

  } catch (err) {
    log("Critical Error in doPost: " + JSON.stringify(err, null, 2));
    if (chatIdForError) {
      sendMessage(chatIdForError, "⚠️ Something went wrong processing your message. Please try again.");
    }
  }
}

// This is the JSON object you'll send to the API
const functionDeclarations = [
  {
    "name": "add_expense",
    "description": "Adds one or more expense items to a specific date.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "date": {
          "type": "STRING",
          "description": "The date for the expense in YYYY-MM-DD format. Defaults to today if not specified."
        },
        "items": {
          "type": "ARRAY",
          "description": "A list of expense items to add.",
          "items": {
            "type": "OBJECT",
            "properties": {
              "item": { "type": "STRING", "description": "The name of the item (e.g., 'Coffee')." },
              "amount": { "type": "NUMBER", "description": "The cost of the item." }
            },
            "required": ["item", "amount"]
          }
        }
      },
      "required": ["date", "items"]
    }
  },
  {
    "name": "get_summary",
    "description": "Gets the expense summary for a single date or a date range.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "date": {
          "type": "STRING",
          "description": "A single date in YYYY-MM-DD format."
        },
        "start_date": {
          "type": "STRING",
          "description": "The start date for a range in YYYY-MM-DD format."
        },
        "end_date": {
          "type": "STRING",
          "description": "The end date for a range in YYYY-MM-DD format."
        },
        "summary_type": {
          "type": "STRING",
          "description": "The type of summary, e.g., 'highest_day', 'highest_item'.",
          "enum": ["highest_day", "highest_item", "lowest_day", "lowest_item"]
        }
      }
    }
  },
  {
    "name": "delete_expense",
    "description": "Deletes or removes one or more expense items from a specific date. Can also be used to clear all expenses for a date.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "date": {
          "type": "STRING",
          "description": "The date to modify in YYYY-MM-DD format. Defaults to today."
        },
        "action_text": {
          "type": "STRING",
          "description": "The user's specific request, e.g., 'remove tea' or 'clear all'."
        }
      },
      "required": ["date", "action_text"]
    }
  },
  {
    "name": "update_expense",
    "description": "Updates an existing expense item's amount or description on a specific date.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "date": {
          "type": "STRING",
          "description": "The date to modify in YYYY-MM-DD format. Defaults to today."
        },
        "action_text": {
          "type": "STRING",
          "description": "The user's specific request, e.g., 'update dinner to 40' or 'combine coffee and tea'."
        }
      },
      "required": ["date", "action_text"]
    }
  }
];

// ---------------------------
// Intent routing (LLM-only, strict JSON)
// ---------------------------
function routeUserIntent(userInput, history) {
  try {
    const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + GEMINI_API_KEY;

    const now = new Date();
    const todayISO = toISO(now);

    const tools = [{ "functionDeclarations": functionDeclarations }];

    const systemInstruction = `
You are an expert intent router for an expense-tracking bot.
The CURRENT DATE is ${todayISO}.
Resolve all dates (like 'today', 'yesterday') relative to this date.
Call the appropriate functions to fulfill the user's request.
If the user is just chatting, do not call any function.
`;

    const payload = {
      "contents": [
        {
          "role": "user",
          "parts": [{ "text": `Conversation History:\n${history}\n\nUser's Latest Message: "${userInput}"` }]
        }
      ],
      "systemInstruction": {
        "parts": [{ "text": systemInstruction }]
      },
      "tools": tools
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    };

    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());
    log("Model response: " + JSON.stringify(jsonResponse, null, 2));

    if (jsonResponse.candidates && jsonResponse.candidates.length > 0) {
      return jsonResponse.candidates[0];
    }
    return null;

  } catch (err) {
    log("routeUserIntent error: " + JSON.stringify(err, null, 2));
    return null;
  }
}


// ---------------------------
// Add expense
// ---------------------------
function handleAddExpense(chatId, args) {
  try {
    log(`handleAddExpense started. Args: ${JSON.stringify(args)}`);

    if (!args.date || !args.items || args.items.length === 0) {
      sendMessage(chatId, "⚠️ Please specify items and amounts. Example: `Add coffee 25 today`.");
      log("handleAddExpense: Missing date or items.");
      return;
    }

    const rowNumber = findRowByDate(args.date);
    if (!rowNumber) {
      sendMessage(chatId, `❌ I couldn't find a row for ${args.date}. Please make sure the date row exists in your sheet.`);
      log(`handleAddExpense: No row found for date: ${args.date}`);
      return;
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const amountCell = sheet.getRange(rowNumber, AMOUNT_COL);
    const descCell = sheet.getRange(rowNumber, DESC_COL);

    let currentAmount = parseFloat(amountCell.getValue()) || 0;
    let currentDesc = (descCell.getValue() || "").toString();
    log(`handleAddExpense: Found row ${rowNumber}. Current val: ${currentAmount}, "${currentDesc}"`);

    // --- FIX START: Compare model's list with current sheet state ---

    // 1. Parse the items already in the sheet into a map for quick lookup.
    const existingItems = parseItems(currentDesc);
    const existingItemsMap = new Map(existingItems.map(i => [i.item.toLowerCase(), i]));

    // 2. Filter the model's list to find only the items that are NOT already in the sheet.
    const newItemsToAdd = [];
    for (const modelItem of args.items) {
      const name = (modelItem.item || "").toString().trim();
      const amt = Number(modelItem.amount);
      if (!name || isNaN(amt) || amt <= 0) continue; // Basic validation

      // If the item from the model doesn't exist in our sheet map, it's new.
      if (!existingItemsMap.has(name.toLowerCase())) {
        newItemsToAdd.push({ item: name, amount: amt });
      }
    }
    // --- FIX END ---

    if (newItemsToAdd.length === 0) {
      sendMessage(chatId, `ℹ️ No new expenses to add for ${args.date}. Total is still *₹${fmt(currentAmount)}*.`);
      log("handleAddExpense: No new items found after filtering.");
      return;
    }

    // 3. Calculate the total and description segment for ONLY the new items.
    let addTotal = 0;
    for (const it of newItemsToAdd) {
      addTotal += it.amount;
    }

    const addSegments = newItemsToAdd.map(x => `${x.item} ${fmt(x.amount)}`).join(", ");
    const finalAmount = currentAmount + addTotal;
    const finalDesc = mergeDescriptions(currentDesc, addSegments);
    log(`handleAddExpense: New total: ${finalAmount}. New desc: "${finalDesc}"`);

    amountCell.setValue(Number(finalAmount));
    descCell.setValue(finalDesc);

    sendMessage(chatId, `✅ Added: ${addSegments}\nNew total for ${args.date}: *₹${fmt(finalAmount)}*.`);
  } catch (err) {
    log("handleAddExpense error: " + JSON.stringify(err, null, 2));
    sendMessage(chatId, "⚠️ Couldn't add the expense. Please try again.");
  }
}

// ---------------------------
// Get summary (single date or inclusive range)
// ---------------------------
function handleGetSummary(chatId, args) {
  try {
    log(`handleGetSummary started. Args: ${JSON.stringify(args)}`);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const values = (lastRow > 0) ? sheet.getRange(1, 1, lastRow, 3).getValues() : [];

    // Range summary
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

    // Single date summary
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


// ---------------------------
// Main modification handler (Single-action)
// ---------------------------
function handleModification(chatId, args) {
  try {
    const targetDate = args.date;
    const actionText = (args.action_text || args.raw_text || "").toString().trim();

    log(`handleModification started for date: ${targetDate} with action: "${actionText}"`);

    if (!targetDate || !actionText) {
      sendMessage(chatId, "⚠️ I couldn't understand what you want to modify.");
      return;
    }

    const rowNumber = findRowByDate(targetDate);
    if (!rowNumber) {
      sendMessage(chatId, `❌ No row found for ${targetDate}`);
      log(`handleModification: No row found for ${targetDate}`);
      return;
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const amountCell = sheet.getRange(rowNumber, AMOUNT_COL);
    const descCell = sheet.getRange(rowNumber, DESC_COL);

    const currentAmount = Number(amountCell.getValue()) || 0;
    const currentDesc = (descCell.getValue() || "").toString();

    log(`handleModification - targetDate=${targetDate} row=${rowNumber}`);
    log(`actionText: ${actionText}`);
    log(`before: desc="${currentDesc}" amount=${currentAmount}`);

    let modification = null;

    // deterministic clear
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

    const beforeNormalized = currentDesc.trim();
    const afterNormalized = (modification.newDescription || "").trim();
    const beforeAmount = Number(currentAmount) || 0;
    const afterAmount = Number(modification.newAmount) || 0;

    if (beforeNormalized === afterNormalized && beforeAmount === afterAmount) {
      sendMessage(chatId, `ℹ️ No changes needed for ${targetDate} (total ₹${fmt(afterAmount)})`);
      log("handleModification: No changes detected.");
      return;
    }

    // Apply update
    amountCell.setValue(afterAmount);
    descCell.setValue(afterNormalized);
    log(`handleModification: Updated sheet. New Amount=${afterAmount}. New Desc="${afterNormalized}"`);

    const beforeItems = parseItems(beforeNormalized);
    const afterItems = parseItems(afterNormalized);
    const diffMessage = describeDiff(beforeItems, afterItems);

    sendMessage(chatId, `✅ ${targetDate}: ${diffMessage} (new total ₹${fmt(afterAmount)})`);

  } catch (err) {
    log("handleModification error: " + JSON.stringify(err, null, 2));
    sendMessage(chatId, "⚠️ Something went wrong while applying modifications.");
  }
}


// ---------------------------
// LLM call for modification (rename/amount change/remove)
// ---------------------------
function callModificationAPI(oldDescription, oldAmount, userRequest, targetDateISO) {
  log("---- callModificationAPI invoked ----");
  log("targetDateISO: " + targetDateISO);
  log("oldDescription: " + oldDescription);
  log("oldAmount: " + oldAmount);
  log("userRequest passed: " + userRequest);
  try {
    const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + GEMINI_API_KEY;

    const prompt = `
You are a Google Sheets expense modification assistant.

Context:
- You are modifying ONLY the expenses for TARGET_DATE = ${targetDateISO}.
- The sheet stores one day's expenses in a single Description cell.
- The Description uses a canonical format (comma-separated list):
    "<item1> <amount1>, <item2> <amount2>, ..."
  where amounts are plain numbers (no currency symbols).
- The Amount cell stores the day's total (numeric).

STRICT SCOPE RULE:
- Apply ONLY changes that affect TARGET_DATE.
- If the user request mentions actions for any other date (e.g., "today", "yesterday", explicit dates) that do NOT equal TARGET_DATE, ignore those parts completely.
- Never add or modify items for a different date.
- If the request says "remove all expenses" for this day, the result must be an empty description and total 0.

Input:
- User request (action-scoped for this date): "${userRequest}"
- Current cell description: "${oldDescription}"
- Current total amount: ${Number(oldAmount)}

Task:
Return ONLY a JSON object with EXACT keys:
  {
    "newDescription": "<updated description in the same canonical format>",
    "newAmount": NUMBER
  }

Transformation rules:
- Removing items: delete them from the description and subtract their amounts.
- Updating/renaming/changing amounts: update the line in the description and adjust the total.
- Adding items for TARGET_DATE: append "<item> <amount>" and update the total.
- Keep item order stable where possible.
- "newAmount" must equal the sum of all item amounts in "newDescription".
- If the user's request is ambiguous or not applicable for TARGET_DATE, return the original description and amount unchanged.

Examples:
1) Remove tea
   Before: "tea 10, coffee 20"
   After:  "coffee 20"   (newAmount=20)

2) Update dinner 30 to 40
   Before: "breakfast 20, dinner 30"
   After:  "breakfast 20, dinner 40" (newAmount=60)

3) Remove all expenses
   Before: "cab 120, tea 10"
   After:  "" (empty string), newAmount=0

Respond ONLY with the JSON object.
`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload) };
    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());
    log("modification API raw response: " + JSON.stringify(jsonResponse, null, 2));
    const raw = jsonResponse.candidates[0].content.parts[0].text.trim().replace(/^```json|```$/g, "");
    log("mod response raw: " + JSON.stringify(raw, null, 2));
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.newDescription === "string" && typeof parsed.newAmount !== "undefined") {
        return parsed;
      } else {
        log("callModificationAPI invalid structure: " + JSON.stringify(raw, null, 2));
        return null;
      }
    } catch (e) {
      log("callModificationAPI JSON parse error: " + JSON.stringify(raw, null, 2));
      return null;
    }
  } catch (err) {
    log("callModificationAPI error: " + JSON.stringify(err, null, 2));
    return null;
  }
}


// ---------------------------
// Chat fallback (concise)
// ---------------------------
function handleChat(chatId, text, history) {
  try {
    const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + GEMINI_API_KEY;
    const prompt = `You are ExpenseTracker, a concise, friendly assistant for chatting about expenses. 

Capabilities:
- You do NOT fetch or calculate actual expenses. That is handled elsewhere in the system.
- If the user asks for summaries, totals, updates, deletions, or other expense actions, politely tell them to rephrase clearly so the system can process it.
- Do NOT ask users to provide expense amounts that should already be tracked.
- In chat mode, your only role is to have natural conversation, clarify misunderstandings, or guide the user back to supported commands.

Examples:
User: "How much have I spent in January and March?"
Assistant: "I can’t calculate directly here. Try asking: 'Summary for January and March'."
User: "What’s your favorite food?"
Assistant: "Haha, if I could eat, probably samosas while tracking expenses. 😄"

Now, continue the conversation.
Conversation History:
${history}
User Input: "${text}"`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true, // <--- IMPORTANT
    };
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode !== 200) {
      let errorMsg = "The request failed with status " + statusCode;
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.error?.details) {
          const reason = errorJson.error.details[0]?.reason;
          if (reason === "API_KEY_INVALID") {
            errorMsg = "Your API key is invalid. Please check and update it.";
          }
        }
      } catch (parseErr) {
        // ignore parse errors, fall back to generic errorMsg
      }
      sendMessage(chatId, errorMsg);
      return;
    }

    const jsonResponse = JSON.parse(responseText);
    log("handleChat response: " + JSON.stringify(jsonResponse, null, 2));
    const reply = jsonResponse.candidates[0].content.parts[0].text.trim();
    sendMessage(chatId, reply);
  } catch (err) {
    log("handleChat error: " + JSON.stringify(err, null, 2));
    sendMessage(chatId, "Sorry, I couldn't think of a reply right now.");
  }
}

// ---------------------------
// Helpers: formatting, items, dates, diff, sheet lookup
// ---------------------------
function fmt(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  const n = Number(num);
  return (n % 1 === 0) ? String(n) : n.toFixed(2);
}

function mergeDescriptions(currentDesc, addSegments) {
  const cleanCurrent = (currentDesc || "").toString().trim();
  if (!cleanCurrent || cleanCurrent.toLowerCase() === "no expense" || cleanCurrent === "0") {
    return addSegments;
  }
  return `${cleanCurrent}, ${addSegments}`;
}

// Parse our own canonical description into [{item, amount}]
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

function describeDiff(before, after) {
  const bMap = {}; before.forEach(x => bMap[x.item] = x.amount);
  const aMap = {}; after.forEach(x => aMap[x.item] = x.amount);

  const msgs = [];
  for (const b in bMap) if (!(b in aMap)) msgs.push(`Removed ${b} ₹${fmt(bMap[b])}`);
  for (const a in aMap) if (!(a in bMap)) msgs.push(`Added ${a} ₹${fmt(aMap[a])}`);
  for (const k in aMap) if (bMap[k] && aMap[k] !== bMap[k]) msgs.push(`Updated ${k}: ${fmt(bMap[k])} → ${fmt(aMap[k])}`);
  return msgs.join("; ") || "No visible change.";
}

function yyyymmdd(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function toISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Parse date strings in Column A like "1st Jan", "01 Jan", "Jan 1", "1-Jan", "15th August"
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

function startOfThisMonth() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}
function endOfThisMonth() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

// Find row by ISO date (YYYY-MM-DD) against display text in Col A
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

// ---------------------------
// Conversation history (cached short context)
// ---------------------------
function getConversationHistory(chatId) {
  const cache = CacheService.getScriptCache();
  const historyJson = cache.get(String(chatId) + "_hist");
  const history = historyJson ? JSON.parse(historyJson) : [];
  return history.map(turn => `User: ${turn.user}\nBot: ${turn.bot}`).join("\n");
}
function updateConversationHistory(chatId, userInput, botResponse) {
  const cache = CacheService.getScriptCache();
  const historyJson = cache.get(String(chatId) + "_hist");
  let history = historyJson ? JSON.parse(historyJson) : [];
  history.push({ user: userInput, bot: botResponse });
  if (history.length > MAX_HISTORY_TURNS) history = history.slice(-MAX_HISTORY_TURNS);
  cache.put(String(chatId) + "_hist", JSON.stringify(history), 600);
}

// ---------------------------
// Telegram send message
// ---------------------------
function sendMessage(chatId, text) {
  try {
    const TELEGRAM_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      log("TELEGRAM_BOT_TOKEN not set");
      return;
    }
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    const payload = {
      chat_id: String(chatId),
      text: text,
      parse_mode: "Markdown"
    };
    const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload) };
    UrlFetchApp.fetch(url, options);
  } catch (err) {
    log("sendMessage error: " + JSON.stringify(err, null, 2));
  }
}

// ---------------------------
// Logging helper (writes to a "Logs" sheet in LOG_SHEET_ID)
// ---------------------------
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

// ---------------------------
// Utility: set webhook
// ---------------------------
function setWebhook() {
  const TELEGRAM_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  const webAppUrl = PropertiesService.getScriptProperties().getProperty("WEBAPP_URL");

  if (!TELEGRAM_BOT_TOKEN) {
    log("TELEGRAM_BOT_TOKEN not set in script properties. Cannot set webhook.");
    return;
  }
  if (!webAppUrl) {
    log("WEBAPP_URL not set in script properties. Cannot set webhook.");
    return;
  }

  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook?url=" + webAppUrl;
  const resp = UrlFetchApp.fetch(url);
  log(resp.getContentText());
}