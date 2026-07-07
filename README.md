# Auto-Delete Photos Google Drive

A full-stack application built with Next.js and NestJS that allows users to upload photos to Google Drive and automatically deletes them after a configured duration (e.g., 5 minutes).

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose installed on your machine.
- Google Cloud Console account to set up OAuth 2.0 Credentials.

## Google Auth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the **Google Drive API** for the project.
4. Configure the **OAuth Consent Screen**:
   - Set it to "Testing" or "In production".
   - If "Testing", remember to add test users' email addresses.
5. Create **Credentials** -> **OAuth client ID** (Web application):
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:5000/auth/google/callback`
6. Note down your `Client ID` and `Client Secret`.

## Running the Application (with Docker)

This project is fully dockerized. You just need to configure the environment variables and run Docker Compose.

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd tool-google-photo
   ```

2. **Configure Environment Variables:**
   - In the `backend` folder, copy `.env.example` to `.env` and fill in your Google Client ID and Secret:
     ```env
     PORT=5000
     FRONTEND_URL=http://localhost:3000
     GOOGLE_CLIENT_ID=your_google_client_id
     GOOGLE_CLIENT_SECRET=your_google_client_secret
     GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
     DELETE_DELAY_MINUTES=5
     ```
   - In the `frontend` folder, copy `.env.example` to `.env` and configure the backend URL:
     ```env
     NEXT_PUBLIC_API_URL=http://localhost:5000
     ```

3. **Run with Docker Compose:**
   ```bash
   docker-compose up --build -d
   ```

4. **Access the Application:**
   - Open your browser and go to `http://localhost:3000`

## Stopping the Application

To stop the containers, run:
```bash
docker-compose down
```

## Tech Stack

- **Frontend:** Next.js (React), Tailwind CSS
- **Backend:** NestJS (Node.js), TypeScript, TypeORM, SQLite (In-memory)
- **Deployment:** Docker & Docker Compose
