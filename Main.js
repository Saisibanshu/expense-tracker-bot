/**************************************************************
 * Main.gs
 * ------------------------------------------------------------
 * This file contains the main entry point for the script,
 * the doPost function, which is triggered by a POST request
 * from Telegram.
 **************************************************************/

/**
 * @description Main webhook entry point for the Telegram bot.
 * This function is called by Google Apps Script whenever a POST
 * request is sent to the web app's URL. It parses the incoming
 * message from Telegram, routes the user's intent using the
 * Gemini API, and calls the appropriate handler function.
 * @param {object} e - The event parameter from the HTTP POST request.
 */
function doPost(e) {
  activeGeminiModel = null; // Reset fallback model for the new request
  let chatIdForError = null;
  try {
    // 1. Parse the incoming request from Telegram
    const contents = JSON.parse(e.postData.contents);
    const message = contents.message || contents.edited_message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    chatIdForError = chatId;

    // Security check using whitelist
    const allowedChatIdsStr = PropertiesService.getScriptProperties().getProperty("ALLOWED_CHAT_IDS");
    if (allowedChatIdsStr) {
      const allowedChatIds = allowedChatIdsStr.split(",").map(id => id.trim());
      if (allowedChatIds.indexOf(String(chatId)) === -1) {
        log("Unauthorized access attempt from Chat ID: " + chatId);
        sendMessage(chatId, "🚫 Unauthorized access. This bot is private.");
        return;
      }
    }

    const text = message.text.trim();

    // Check for simple greetings or help requests to bypass Gemini API and save quota
    if (isSimpleGreetingOrHelp(text)) {
      const welcome = "*Welcome to Expense Tracker!* 📊\n\n" +
                      "I help you manage your expenses directly in Google Sheets.\n\n" +
                      "*Here is what you can do:*\n" +
                      "* *Add expenses:* \"breakfast 120\", \"cab 250, snacks 50 today\", \"dinner 400 yesterday\"\n" +
                      "* *Delete expenses:* \"remove tea\", \"delete eggs today\", \"clear all expenses\"\n" +
                      "* *Update expenses:* \"update coffee to 60\", \"change rent to 9000\"\n" +
                      "* *Get summaries:* \"summary for this month\", \"expenses this week\", \"how much did I spend on food in the last 2 weeks?\"\n\n" +
                      "Simply send me a command to get started!";
      sendMessage(chatId, welcome);
      return;
    }

    const history = getConversationHistory(chatId);

    // 2. Route the user's intent using the Gemini API
    const modelResponse = routeUserIntent(text, history, chatId);
    log("modelResponse_Intent: " + JSON.stringify(modelResponse, null, 2));

    if (!modelResponse || !modelResponse.content || !modelResponse.content.parts) {
      handleChat(chatId, text, history); // Fallback to chat if response is weird
      return;
    }

    const parts = modelResponse.content.parts;
    const functionCalls = parts.filter(part => part.functionCall); // Get all function calls

    // 3. Handle function calls from the Gemini API
    if (functionCalls.length > 0) {

      // Sort function calls to handle deletions and updates before additions
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

      // Loop through all function calls and execute them
      for (const part of functionCalls) {
        const call = part.functionCall;
        const args = call.args || {}; // The arguments are already a parsed JSON object

        // Add raw_text for logging/history
        args.raw_text = text;
        args.action_text = args.action_text || text; // Use arg if present, else full text

        updateConversationHistory(chatId, text, call.name); // Log the function name as the "bot response"

        // Route to the appropriate handler function based on the function name
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

    // 4. Handle chat responses from the Gemini API
    const chatResponse = parts.find(part => part.text);
    if (chatResponse && chatResponse.text) {
      updateConversationHistory(chatId, text, chatResponse.text);
      sendMessage(chatId, chatResponse.text);
    } else {
      // Fallback if there's no function and no text
      handleChat(chatId, text, history);
    }

  } catch (err) {
    // 5. Handle any critical errors
    log("Critical Error in doPost: " + (err.message || JSON.stringify(err, null, 2)));
    if (chatIdForError) {
      if (err.message === "RATE_LIMIT_EXCEEDED") {
        sendMessage(chatIdForError, "⚠️ Google API rate limit exceeded. Please try again in 1 minute.");
      } else {
        sendMessage(chatIdForError, "⚠️ Something went wrong processing your message. Please try again.");
      }
    }
  } finally {
    flushLogs();
  }
}

/**
 * @description Checks if a message is a simple greeting or help request.
 * @param {string} text - The user's input.
 * @returns {boolean} True if the input is a simple greeting or help request.
 */
function isSimpleGreetingOrHelp(text) {
  if (!text) return false;
  const clean = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  return (
    clean === "hi" ||
    clean === "hello" ||
    clean === "hey" ||
    clean === "start" ||
    clean === "help"
  );
}
