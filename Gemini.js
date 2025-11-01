/**************************************************************
 * Gemini.gs
 * ------------------------------------------------------------
 * This file contains all the functions that interact with the
 * Gemini API.
 **************************************************************/

/**
 * @description The function declarations for the Gemini API.
 * This object defines the functions that the Gemini API can call.
 * @type {Array<object>}
 */
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

/**
 * @description Routes the user's intent using the Gemini API.
 * It sends the user's message and conversation history to the
 * Gemini API and returns the model's response.
 * @param {string} userInput - The user's input.
 * @param {string} history - The conversation history.
 * @returns {object|null} The model's response or null on error.
 */
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

/**
 * @description Calls the modification API to update expenses.
 * It sends the user's modification request to the Gemini API
 * and returns the updated description and amount.
 * @param {string} oldDescription - The old expense description.
 * @param {number} oldAmount - The old total amount.
 * @param {string} userRequest - The user's modification request.
 * @param {string} targetDateISO - The target date in ISO format.
 * @returns {object|null} The modification object or null on error.
 */
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

/**
 * @description Handles the chat fallback.
 * This function is called when the Gemini API does not return a
 * function call. It sends a chat response to the user.
 * @param {number} chatId - The chat ID.
 * @param {string} text - The user's input.
 * @param {string} history - The conversation history.
 */
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
