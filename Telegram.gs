/**************************************************************
 * Telegram.gs
 * ------------------------------------------------------------
 * This file contains all the functions that interact with the
 * Telegram API.
 **************************************************************/

/**
 * @description Sends a message to a Telegram chat.
 * This function constructs a POST request to the Telegram API's
 * sendMessage method.
 * @param {number} chatId - The chat ID to send the message to.
 * @param {string} text - The message to send.
 */
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

/**
 * @description Sets the Telegram webhook.
 * This function is used to set the webhook URL for the Telegram
 * bot. It should be run once after deploying the web app.
 */
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
