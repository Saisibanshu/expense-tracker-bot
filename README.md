# Expense Tracker Bot

This is a Google Apps Script-based Telegram bot for tracking expenses. It uses the Gemini API for natural language processing to understand user input and a Google Sheet to store expense data.

## Features

- **Natural Language Expense Logging:** Add expenses using everyday language (e.g., "coffee 50, sandwich 120").
- **Multi-Item Entries:** Log multiple items in a single message.
- **Automated Date Parsing:** Automatically understands dates like "today," "yesterday," or specific dates.
- **Expense Summaries:** Get daily or date-range summaries of your expenses.
- **Modify and Delete Entries:** Easily update or remove expenses with simple commands.
- **Conversation History:** Remembers the context of your conversation for a more natural interaction.
- **Logging:** Keeps a log of all transactions and errors in a separate Google Sheet.

## How it Works

The bot is built on Google Apps Script and works as a web app that receives updates from Telegram via a webhook. When you send a message to the bot, Telegram forwards it to the Google Apps Script web app.

The script then uses the Gemini API to perform intent routing and entity extraction on your message. It determines whether you want to add, update, delete, or get a summary of expenses. The script then interacts with a Google Sheet to store or retrieve the necessary data and sends a confirmation message back to you on Telegram.

## Prerequisites

- A Google account
- A Telegram account and a Telegram bot token
- A Gemini API key
- Node.js and npm installed on your local machine for using `clasp`

## Setup Instructions

1. **Create a Google Sheet:**
   - Create a new Google Sheet.
   - Name the first sheet "Expenses".
   - Set up the columns as follows:
     - Column A: `Date` (e.g., "1st Jan")
     - Column B: `Amount` (formatted as a number)
     - Column C: `Description` (string)

2. **Create a Google Apps Script Project:**
   - Go to [Google Apps Script](https://script.google.com/) and create a new project.
   - Copy the code from `Code.js` and `appsscript.json` into the corresponding files in your new project.

3. **Set Script Properties:**
   - In the Apps Script editor, go to **Project Settings > Script Properties**.
   - Add the following script properties:
     - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token.
     - `GEMINI_API_KEY`: Your Gemini API key.
     - `LOG_SHEET_ID`: The ID of the Google Sheet you want to use for logging.
     - `WEBAPP_URL`: The URL of your deployed web app (you'll get this after deploying).

4. **Deploy the Web App:**
   - In the Apps Script editor, click **Deploy > New deployment**.
   - Select **Web app** as the deployment type.
   - Configure the web app with the following settings:
     - **Execute as:** `Me`
     - **Who has access:** `Anyone`
   - Click **Deploy**.
   - Copy the web app URL and add it to the `WEBAPP_URL` script property.

5. **Set the Telegram Webhook:**
   - In the Apps Script editor, run the `setWebhook` function to set up the connection between your Telegram bot and your web app.

## Google Sheet Setup

Your "Expenses" sheet should be structured with the following columns:

| Date        | Amount | Description                |
|-------------|--------|----------------------------|
| 1st Jan     | 170    | coffee 50, sandwich 120    |
| 2nd Jan     | 250    | pizza 250                  |
| ...         | ...    | ...                        |

## Usage

You can interact with the bot using natural language commands in your Telegram chat:

- **Add an expense:** "add coffee 50 and a sandwich 120 for today"
- **Get a summary:** "what's the summary for this week?"
- **Update an expense:** "update coffee to 60 for yesterday"
- **Delete an expense:** "remove the sandwich from today"
- **Chat:** You can also have a natural conversation with the bot.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
