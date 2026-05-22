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
    "description": "Gets the expense summary, statistics, or custom lists of expenses for a single date or date range. Use this for all analytical questions about expenses.",
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
        },
        "query": {
          "type": "STRING",
          "description": "The user's original query asking for custom analysis, listing, or calculations (e.g. 'How many times have I had Chowman?')."
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
 * @description Centralized helper to call the Gemini API with automatic retry on rate limits (429) or transient 5xx errors.
 * It uses exponential backoff and parses the retryDelay parameter from Google API's error response.
 * @param {object} payload - The request payload.
 * @param {string} [modelName] - The Gemini model to call (defaults to GEMINI_MODEL).
 * @param {number} [chatId] - The Telegram chat ID to notify during retries.
 * @returns {object} The parsed JSON response from the API.
 * @throws {Error} Throws an error on non-retryable status codes or after maximum retries.
 */
function callGemini(payload, modelName, chatId) {
  const model = modelName || GEMINI_MODEL;
  const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set in script properties.");
  }
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`callGemini [${model}]: Attempt ${attempt} of ${maxAttempts}...`);
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 200) {
      try {
        return JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Failed to parse successful Gemini response: ${parseErr.message}`);
      }
    }

    // Handle retryable status codes: 429 (Resource Exhausted) and 5xx (Server errors)
    if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
      log(`callGemini warning (status ${statusCode}): ${responseText}`);
      if (attempt === maxAttempts) {
        throw new Error(`Gemini API failed after ${maxAttempts} attempts with status ${statusCode}: ${responseText}`);
      }

      // Calculate delay: Try to parse retryDelay from error response, fallback to exponential backoff
      let delayMs = Math.pow(2, attempt) * 2000 + Math.floor(Math.random() * 1000); // 4s, 8s, 16s, 32s + jitter
      try {
        const errorJson = JSON.parse(responseText);
        const details = errorJson.error?.details;
        if (details && Array.isArray(details)) {
          for (let i = 0; i < details.length; i++) {
            if (details[i].retryDelay) {
              const delayStr = details[i].retryDelay; // e.g. "28s" or "28.9s"
              const seconds = parseFloat(delayStr);
              if (!isNaN(seconds)) {
                delayMs = Math.ceil(seconds * 1000) + 1000; // Add 1s safety buffer
                log(`Parsed retryDelay from API: ${delayStr}. Sleeping for ${delayMs}ms.`);
                break;
              }
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors for non-JSON or malformed responses
      }

      // Cap synchronous sleep to prevent Telegram webhook timeout retries
      const MAX_SYNC_SLEEP_MS = 8000;
      if (delayMs > MAX_SYNC_SLEEP_MS) {
        log(`Delay of ${delayMs}ms exceeds maximum synchronous sleep limit (${MAX_SYNC_SLEEP_MS}ms). Aborting execution.`);
        throw new Error("RATE_LIMIT_EXCEEDED");
      }

      if (chatId) {
        const delaySecs = Math.ceil(delayMs / 1000);
        let notice = `⏳ I encountered a temporary Google API rate limit. Retrying in ${delaySecs} seconds...`;
        if (statusCode >= 500) {
          notice = `⏳ Google API returned an error (status ${statusCode}). Retrying in ${delaySecs} seconds...`;
        }
        sendMessage(chatId, notice);
      }

      log(`Rate limit / server error hit. Sleeping for ${delayMs}ms before retrying...`);
      Utilities.sleep(delayMs);
    } else {
      // Non-retryable error (e.g. 400 Bad Request, 403 Forbidden/Invalid API key, 404 Not Found)
      throw new Error(`Gemini API non-retryable failure (status ${statusCode}): ${responseText}`);
    }
  }
}

/**
 * @description Routes the user's intent using the Gemini API.
 * It sends the user's message and conversation history to the
 * Gemini API and returns the model's response.
 * @param {string} userInput - The user's input.
 * @param {string} history - The conversation history.
 * @param {number} [chatId] - The Telegram chat ID to notify during retries.
 * @returns {object|null} The model's response or null on error.
 */
function routeUserIntent(userInput, history, chatId) {
  try {
    const now = new Date();
    const todayISO = toISO(now);

    const tools = [{ "functionDeclarations": functionDeclarations }];

    const systemInstruction = `
You are an expert intent router for an expense-tracking bot.
The CURRENT DATE is ${todayISO}.
Resolve all dates (like 'today', 'yesterday', 'this week', 'last week', 'this month') relative to this date.

Routing rules:
1. If the user wants to add expenses (e.g., "add paneer 65, garage 80", "lunch 120"), call 'add_expense'.
2. If the user wants to delete, remove, or clear expenses (e.g., "remove tea", "delete eggs today", "clear all expenses"), call 'delete_expense'.
3. If the user wants to update or modify expenses (e.g., "update coffee to 60", "change rent to 9000"), call 'update_expense'.
4. If the user asks for summaries, comparisons, lists, category totals, or general questions about their expenses (e.g., "how much spent on food?", "Chowman count", "weekly report"), call 'get_summary'. Pass the original question in the 'query' parameter, and resolve the relevant 'start_date' and 'end_date'.
5. When resolving relative date ranges (like 'this month', 'this week', 'today', 'yesterday'), ALWAYS use the CURRENT DATE to compute the start and end dates. Do NOT reuse or be biased by date ranges from the conversation history unless the user explicitly refers to them (e.g., "for that period").

If the user is just chatting (e.g., "hi", "how's the weather"), do not call any function.
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

    const jsonResponse = callGemini(payload, null, chatId);
    log("Model response: " + JSON.stringify(jsonResponse, null, 2));

    if (jsonResponse.candidates && jsonResponse.candidates.length > 0) {
      return jsonResponse.candidates[0];
    }
    return null;

  } catch (err) {
    log("routeUserIntent error: " + (err.message || JSON.stringify(err, null, 2)));
    if (err.message === "RATE_LIMIT_EXCEEDED") {
      throw err;
    }
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
 * @param {number} [chatId] - The Telegram chat ID to notify during retries.
 * @returns {object|null} The modification object or null on error.
 */
function callModificationAPI(oldDescription, oldAmount, userRequest, targetDateISO, chatId) {
  log("---- callModificationAPI invoked ----");
  log("targetDateISO: " + targetDateISO);
  log("oldDescription: " + oldDescription);
  log("oldAmount: " + oldAmount);
  log("userRequest passed: " + userRequest);
  try {
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
    const jsonResponse = callGemini(payload, null, chatId);
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
    log("callModificationAPI error: " + (err.message || JSON.stringify(err, null, 2)));
    if (err.message === "RATE_LIMIT_EXCEEDED") {
      throw err;
    }
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

    const jsonResponse = callGemini(payload, null, chatId);
    log("handleChat response: " + JSON.stringify(jsonResponse, null, 2));
    const reply = jsonResponse.candidates[0].content.parts[0].text.trim();
    sendMessage(chatId, reply);
  } catch (err) {
    log("handleChat error: " + (err.message || JSON.stringify(err, null, 2)));
    if (err.message === "RATE_LIMIT_EXCEEDED") {
      throw err;
    }
    let errorMsg = "Sorry, I couldn't think of a reply right now.";
    if (err.message && err.message.indexOf("status 403") !== -1) {
      errorMsg = "Your API key is invalid or unauthorized. Please check and update it.";
    } else if (err.message && err.message.indexOf("status 429") !== -1) {
      errorMsg = "⚠️ I am currently receiving too many requests. Please try again shortly.";
    }
    sendMessage(chatId, errorMsg);
  }
}

/**
 * @description Analyzes a list of raw expenses using Gemini to answer a specific user query.
 * @param {Array<object>} rawData - An array of raw expense objects containing date, amount, and description.
 * @param {string} userQuery - The user's specific question.
 * @param {number} [chatId] - The Telegram chat ID to notify during retries.
 * @returns {string} The natural language answer from Gemini.
 */
function analyzeExpensesWithLLM(rawData, userQuery, chatId) {
  try {
    const dataStr = JSON.stringify(rawData, null, 2);
    
    const prompt = `
You are a precise financial analysis assistant for an expense-tracking bot.

Below is the raw expense data retrieved from the user's spreadsheet for the relevant period.
Raw Expense Data:
${dataStr}

User's Question:
"${userQuery}"

Task:
Analyze the Raw Expense Data and write a concise, direct answer to the User's Question.
Rules:
1. Be mathematically precise. Calculate totals, averages, or counts if asked. Double-check your arithmetic by listing out each matching item and adding/counting them step-by-step to avoid errors.
2. Group or list matching items if the user asks for lists/breakdowns.
3. If the user asks about a specific item, keyword, or category, perform a case-insensitive search in the item descriptions. Note that the description column contains comma-separated values of format "<item> <amount>", e.g., "Eggs 96.64, Dinner 30".
4. Format your answer using Telegram-compatible Markdown (use single '*' for bold, e.g. *bold text*, do NOT use '**' for bold, and do NOT use markdown headers like '#' or '##'. Use simple bullet points with '*' followed by a space).
5. If there are no expenses matching the query, state that politely.
6. Do NOT make up any information or reference expenses not present in the Raw Expense Data.
7. Keep the response friendly but concise (suitable for a Telegram chat).
`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const jsonResponse = callGemini(payload, null, chatId);
    log("analyzeExpensesWithLLM response: " + JSON.stringify(jsonResponse, null, 2));
    
    if (jsonResponse.candidates && jsonResponse.candidates.length > 0) {
      return jsonResponse.candidates[0].content.parts[0].text.trim();
    }
    return "⚠️ No analysis could be generated.";
  } catch (err) {
    log("analyzeExpensesWithLLM error: " + (err.message || JSON.stringify(err, null, 2)));
    if (err.message === "RATE_LIMIT_EXCEEDED") {
      throw err;
    }
    if (err.message && err.message.indexOf("status 429") !== -1) {
      return "⚠️ The analysis could not be completed because the request limit was exceeded. Please try again in a few seconds.";
    }
    return "⚠️ Something went wrong during data analysis.";
  }
}
