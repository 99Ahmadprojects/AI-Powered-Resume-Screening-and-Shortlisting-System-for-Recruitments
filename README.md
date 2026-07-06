🚀 Nexus AI ATS
===============

**Intelligent Agentic Resume Screening**

Nexus AI ATS is an advanced, full-stack Applicant Tracking System powered by Google's Gemini AI. It allows recruiters to upload candidate CVs (PDFs) in bulk, define target roles and required skills, and let an intelligent agent automatically screen, score, and shortlist the best talent.

Featuring a stunning dark-mode glassmorphism UI, real-time progress streaming, and intelligent API rate-limit handling, Nexus completely automates the most tedious part of the hiring process.

✨ Key Features
--------------

*   **Bulk Document Processing:** Drag and drop dozens of PDF resumes at once.
    
*   **Agentic AI Screening:** Uses gemini-3.1-flash-lite (or any configured Gemini model) to evaluate candidates based on education, experience, and matched/missing skills.
    
*   **Real-Time SSE Streaming:** Watch the AI analyze CVs live. The frontend receives Server-Sent Events (SSE) to update progress bars and candidate status without page reloads.
    
*   **Smart Quota Management:** Automatically detects the API limits of your chosen Gemini model and smoothly orchestrates concurrent processing to avoid 429 Rate Limit errors. Includes a beautiful glowing cooldown timer if the limit is reached.
    
*   **Premium UI/UX:** Built with React, Tailwind CSS v4, and Framer Motion for buttery-smooth page transitions, glassmorphism panels, and a premium SaaS aesthetic.
    
*   **1-Click Export:** Download the final screening results as a fully formatted .csv report.
    

🛠️ Tech Stack
--------------

**Frontend:**

*   React 18 (Vite)
    
*   Tailwind CSS v4
    
*   Framer Motion (Animations)
    
*   Lucide React (Icons)
    

**Backend:**

*   Python 3.13
    
*   FastAPI & Uvicorn
    
*   Google Gemini API (generativelanguage)
    
*   ThreadPoolExecutor for non-blocking concurrent processing
    

💻 Local Installation & Setup
-----------------------------

### Prerequisites

*   Node.js (v18+)
    
*   Python (3.11 - 3.13)
    
*   A free [Google Gemini API Key](https://aistudio.google.com/app/apikey)
    

### 1\. Backend Setup

Open a terminal and navigate to the backend directory:


```
Bash
cd backend  
    # Create a virtual environment  
    python -m venv venv  
    # Activate the virtual environment  
    # Windows:  
    venv\Scripts\activate  
    # Mac/Linux:  
    source venv/bin/activate  
    # Install dependencies  
    pip install -r requirements.txt   `
```
Create a .env file inside the backend folder and add your Gemini API Key:

Code snippet

`   GEMINI_API_KEY=your_actual_api_key_here   `

Start the FastAPI server:

Bash

`   python main.py   `

_The backend will now be running on http://localhost:8000._

### 2\. Frontend Setup

Open a second terminal and navigate to the frontend directory:

Bash

`   cd frontend  # Install dependencies  npm install   `

Create a .env file inside the frontend folder to connect to your backend:

Code snippet
`   VITE_API_URL=http://localhost:8000   `

Start the Vite development server:

Bash

`   npm run dev   `

_The frontend will now be running on http://localhost:5173._

🚀 Deployment Guide
-------------------

This application is built to be deployed using a hybrid architecture: **Render** for the Python backend and **Netlify** for the React frontend.

### Deploying the Backend (Render)

1.  Push your code to a GitHub repository.
    
2.  Log into [Render](https://render.com/) and create a new **Web Service**.
    
3.  Connect your repository.
    
4.  Set the **Root Directory** to backend.
    
5.  Set the **Build Command** to pip install -r requirements.txt.
    
6.  Set the **Start Command** to uvicorn main:app --host 0.0.0.0 --port $PORT.
    
7.  Add your GEMINI\_API\_KEY under Environment Variables.
    
8.  Click **Create Web Service**. Copy the generated URL
    

**Keeping Render Awake (Free Tier):**
Render spins down free services after 15 minutes. To prevent this, create a free account on [UptimeRobot](https://uptimerobot.com/). Set up an HTTP(s) monitor pointing to your Render URL (Root /) with a ping interval of **13 minutes**. The backend has a built-in HEAD/GET health-check route specifically designed to accept these pings.

### Deploying the Frontend (Netlify)

1.  Log into [Netlify](https://www.netlify.com/) and click **Add new site** -> **Import an existing project**.
    
2.  Connect your GitHub repository.
    
3.  Set the **Base directory** to frontend.
    
4.  Set the **Build command** to npm run build.
    
5.  Set the **Publish directory** to frontend/dist.
    
6.  Add an Environment Variable:
    
    *   VITE\_API\_URL = _(Your Render URL)_.
        
7.  Click **Deploy Site**.
