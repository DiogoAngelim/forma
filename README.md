# forma

Root repository for Forma, a full-stack visual builder and web experience platform.

This repository includes frontend, backend, and shared packages for the Forma application.

## Prerequisites

- Node.js >= 20
- pnpm (for frontend)
- npm (for backend)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/DiogoAngelim/forma.git
   cd forma
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd ../frontend
   pnpm install
   ```

## Setup

1. Set up environment variables for the backend:
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your configuration (API keys, database URL, etc.)
   ```

2. Run database migrations:
   ```bash
   npm run migrate
   ```

## Running the Application

1. Start the backend API (in a new terminal):
   ```bash
   cd backend
   npm run dev
   ```
   The API will be available at `http://localhost:3000`.

2. Start the frontend visual builder (in another terminal):
   ```bash
   cd frontend/artifacts/visual-builder
   PORT=5173 BASE_PATH=/ pnpm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

## Development

- Backend: Uses npm workspaces with TypeScript and Vitest for testing.
- Frontend: Uses pnpm workspaces with Vite, React, and Tailwind CSS.

## Building for Production

1. Backend:
   ```bash
   cd backend
   npm run build
   ```

2. Frontend:
   ```bash
   cd frontend
   pnpm run build
   ```
