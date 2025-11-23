# GitGenius - Repo Preview & AI Assistant

GitGenius is a powerful React application that allows users to preview GitHub repositories, navigate file trees, and view code with syntax highlighting. It integrates Google's Gemini 2.5 Flash and 3.0 Pro models to analyze code, answer questions, and even generate code modifications with live previews.

## Features

- **Repository Explorer:** Navigate any public GitHub repository file structure.
- **Code Viewer:** Syntax highlighting for various file types.
- **Live Preview:** Render HTML/CSS/JS files directly in the browser with smart relative path rewriting.
- **AI Chat Assistant:** Ask questions about the codebase using Gemini 2.5 Flash.
- **AI Code Modification:** Select a file and ask the AI (Gemini 3.0 Pro) to refactor, fix bugs, or add features.
- **Context Management:** Toggle whether to send existing file context to the AI or generate from scratch.

## Local Development

1.  **Clone the repository**
2.  **Install dependencies**
    ```bash
    npm install
    ```
3.  **Set up Environment Variables**
    Create a `.env` file in the root directory and add your Google Gemini API key:
    ```env
    API_KEY=your_google_ai_studio_api_key
    ```
4.  **Start the development server**
    ```bash
    npm start
    ```

## Deployment Guide

This is a static React application. It can be deployed to any static site hosting provider. The critical step is ensuring the `API_KEY` environment variable is accessible during the build process (or at runtime if using a specific configuration).

### Option 1: Vercel (Recommended) 🏆

Vercel is the creators of Next.js and provides the best-in-class developer experience for React applications.

1.  Push your code to a GitHub repository.
2.  Log in to [Vercel](https://vercel.com) and click **"Add New Project"**.
3.  Import your GitGenius repository.
4.  In the **"Environment Variables"** section, add:
    *   **Key:** `API_KEY`
    *   **Value:** `your_actual_gemini_api_key`
5.  Click **"Deploy"**.

### Option 2: Render

Render is a unified cloud to build and run all your apps and websites.

1.  Log in to [Render](https://render.com).
2.  Click **"New +"** and select **"Static Site"**.
3.  Connect your GitHub repository.
4.  In the **"Environment"** section (or "Environment Variables"), add:
    *   **Key:** `API_KEY`
    *   **Value:** `your_actual_gemini_api_key`
5.  Click **"Create Static Site"**.

---

## Verdict: Which is better?

**We recommend Vercel.**

While both platforms are excellent, **Vercel** is the better choice for this specific application for the following reasons:

1.  **React Optimization:** Vercel's infrastructure is specifically tuned for React and frontend frameworks, often resulting in slightly faster build times and edge caching.
2.  **Configuration:** Vercel automatically detects most React build settings without manual configuration.
3.  **Instant Rollbacks:** If a deployment fails or contains a bug, reverting to a previous version is one click away.
4.  **Global Edge Network:** Vercel's CDN is incredibly fast, ensuring your repo previews load quickly for users worldwide.
