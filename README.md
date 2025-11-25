# Expense Tracker Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Last Commit](https://img.shields.io/github/last-commit/Saisibanshu/expense-tracker-bot.svg)](https://github.com/Saisibanshu/expense-tracker-bot/commits/master)

Say goodbye to manual expense tracking! 👋 This intelligent Telegram bot, powered by Google Apps Script and the Gemini API, makes it effortless to manage your finances. Simply chat with the bot in natural language to log expenses, get summaries, and more—all from the convenience of your favorite messaging app.

## Table of Contents

- [Features](#features)
- [How it Works](#how-it-works)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Google Sheet Setup](#google-sheet-setup)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Features

-   **🤖 Natural Language Processing:** Powered by the Gemini API, the bot understands and processes your requests in plain English.
-   **✍️ Effortless Expense Logging:** Add single or multiple expenses on the fly (e.g., "coffee 50, sandwich 120").
-   **🗓️ Smart Date Recognition:** Automatically parses dates like "today," "yesterday," or specific dates (e.g., "July 25th").
-   **📊 Insightful Summaries:** Get a clear overview of your spending with daily or date-range summaries.
-   **✏️ Easy Modifications:** Update or delete expenses with simple, intuitive commands.
-   **🧠 Conversational Context:** The bot remembers the context of your conversation for a seamless experience.
-   **📋 Detailed Logging:** All transactions and errors are automatically logged in a separate Google Sheet for your reference.

## How it Works

The bot is built on Google Apps Script and works as a web app that receives updates from Telegram via a webhook. When you send a message to the bot, Telegram forwards it to the Google Apps Script web app.

The script then uses the Gemini API to perform intent routing and entity extraction on your message. It determines whether you want to add, update, delete, or get a summary of expenses. The script then interacts with a Google Sheet to store or retrieve the necessary data and sends a confirmation message back to you on Telegram.

## 🏛️ Architecture

```
┌─────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
│                 │      │                      │      │                  │
│  Telegram Bot   ├─────►│  Google Apps Script  ├─────►│    Gemini API    │
│                 │      │      (Web App)       │      │     (for NLP)    │
└─────────────────┘      │                      │      └──────────────────┘
                         │                      │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────┐
                         │                  │
                         │   Google Sheet   │
                         │(for data storage)│
                         └──────────────────┘
```

## 📋 Prerequisites

Before you begin, ensure you have the following:

-   A **Google Account** (e.g., Gmail)
-   A **Telegram Account**
-   A **Telegram Bot**. If you don't have one, create it by talking to the [BotFather](https://t.me/botfather).
-   A **Gemini API Key**. Get yours from [Google AI Studio](https://aistudio.google.com/app/apikey).
-   **Node.js and npm** installed on your local machine.

## 🛠️ Setup Instructions

Follow these steps to set up and deploy your expense tracker bot:

### 1. Create a Google Sheet

-   Create a new [Google Sheet](https://sheets.new).
-   Rename the first sheet (usually "Sheet1") to **`Expenses`**.
-   Set up the following columns in the `Expenses` sheet:
    -   Column A: `Date` (e.g., "1st Jan")
    -   Column B: `Amount` (formatted as a number)
    -   Column C: `Description` (string)
-   Create a new sheet and rename it to **`Logs`**. This will be used for logging.
-   Copy the **Sheet ID** from the URL. The ID is the long string of characters between `/d/` and `/edit`.
    -   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_SHEET_ID`**`/edit`

### 2. Set Up the Google Apps Script Project

There are two ways to set up the project:

#### A) The Easy Way (Copy & Paste)

1.  Go to [Google Apps Script](https://script.google.com/) and create a new project.
2.  Give your project a name (e.g., "Expense Tracker Bot").
3.  Open the `Code.js` file and paste the contents of the `Code.js` file from this repository.
4.  Click on **File > New > JSON file** and create a file named `appsscript.json`.
5.  Paste the contents of the `appsscript.json` file from this repository into your new file.

#### B) The Developer Way (using `clasp`)

1.  **Install `clasp`:**
    ```bash
    npm install -g @google/clasp
    ```
2.  **Clone this repository:**
    ```bash
    git clone https://github.com/Saisibanshu/expense-tracker-bot.git
    cd expense-tracker-bot
    ```
3.  **Log in to `clasp`:**
    ```bash
    clasp login
    ```
4.  **Create a new Apps Script project:**
    ```bash
    clasp create --title "Expense Tracker Bot"
    ```
5.  **Push the code:**
    ```bash
    clasp push
    ```

### 3. Set Script Properties

1.  In the Apps Script editor, go to **Project Settings** (the ⚙️ icon on the left).
2.  Under **Script Properties**, click **Add script property**.
3.  Add the following properties:
    -   `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather.
    -   `GEMINI_API_KEY`: Your Gemini API key.
    -   `LOG_SHEET_ID`: The ID of the Google Sheet you created in Step 1.
    -   `WEBAPP_URL`: The URL of your deployed web app (you'll get this in the next step).

### 4. Deploy the Web App

1.  In the Apps Script editor, click **Deploy > New deployment**.
2.  Click the ⚙️ icon next to "Select type" and choose **Web app**.
3.  Configure the web app with the following settings:
    -   **Description:** A brief description of your bot.
    -   **Execute as:** `Me`
    -   **Who has access:** `Anyone`
4.  Click **Deploy**.
5.  **Important:** Copy the **Web app URL**.
6.  Go back to **Project Settings > Script Properties** and paste the URL into the `WEBAPP_URL` property.

### 5. Set the Telegram Webhook

1.  In the Apps Script editor, make sure you are in the `Code.js` file.
2.  From the function dropdown at the top, select `setWebhook` and click **Run**.
3.  You can check the execution logs to confirm that the webhook was set successfully.

Your bot should now be live and ready to use in Telegram! 🎉

## 📈 Google Sheet Setup

Your `Expenses` sheet should be structured with the following columns:

| Date      | Amount | Description             |
| --------- | ------ | ----------------------- |
| 1st Jan   | 170    | coffee 50, sandwich 120 |
| 2nd Jan   | 250    | pizza 250               |
| ...       | ...    | ...                     |

Your `Logs` sheet will be automatically populated with timestamps and messages for debugging and monitoring.

## 💬 Usage Examples

You can interact with the bot using natural language commands in your Telegram chat. Here are a few examples:

-   **Add an expense:**
    > `add coffee 50 and a sandwich 120 for today`
-   **Get a summary:**
    > `what's the summary for this week?`
-   **Update an expense:**
    > `update coffee to 60 for yesterday`
-   **Delete an expense:**
    > `remove the sandwich from today`
-   **Have a conversation:**
    > `what was my most expensive purchase last month?`

<p align="center">
  <i>(Add a screenshot of your bot in action here!)</i>
</p>

## 🙌 Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue on the GitHub repository.

If you'd like to contribute code, please follow these steps:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and commit them with a clear and descriptive message.
4.  Push your changes to your fork.
5.  Create a pull request to the main repository.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
