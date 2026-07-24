# 🚀 Nexus AI ATS Engine

An open-source, production-ready, and 100% free **AI-Powered Resume Screening & Shortlisting System**. Built using **FastAPI**, **React**, **Tailwind CSS**, and the **Google Gemini LLM**, Nexus ATS automates candidate evaluation by bulk-parsing CVs, calculating dynamic ATS match scores, and physically organizing files into downloadable categorized archives.

![Nexus ATS Banner](frontend/public/favicon.png)

---

## 🔗 Live Application & Demo

* **Live Web App:** [https://YOUR-NETLIFY-URL.netlify.app](https://YOUR-NETLIFY-URL.netlify.app)
* **Backend API Base:** [https://YOUR-RENDER-URL.onrender.com](https://YOUR-RENDER-URL.onrender.com)

---

## ✨ Key Features

* **📦 Multi-Format Bulk Upload:** Process individual resumes (`.pdf`, `.docx`, `.doc`) or entire bulk ZIP archives simultaneously.
* **🧠 Dynamic Gemini LLM Analysis:** Scores candidates against target roles, custom job descriptions, and required skill matrices.
* **📁 Physical File Auto-Sorting:** Automatically organizes resumes into `Shortlisted/`, `Manual_Review/`, and `Rejected/` subdirectories on the fly.
* **⚡ Downloadable ZIP Bundles:** Generates a clean, categorized ZIP package containing sorted candidate files for instant downloading.
* **🔑 Bring Your Own Key (BYOK) Security:** Zero server-side API cost. Users authenticate locally with their own free Gemini API key stored strictly in `sessionStorage`.
* **⏱️ Concurrency & Rate-Limit Shield:** Integrated batching engine and ThreadPoolExecutor handle API quotas gracefully without crashing.
* **📊 Analytics & Export:** Real-time event streaming (`Server-Sent Events`) with 1-click CSV report export.
* **🔒 Auto-Cleanup Security:** Temporary files and generated archives are automatically wiped from server storage via background tasks after processing.

---

## 🛠️ Tech Stack

### **Frontend**
* **Framework:** React 19 + Vite
* **Styling:** Tailwind CSS v4
* **Animations:** Framer Motion
* **Icons:** Lucide React
* **Routing:** React Router DOM v6
* **Deployment:** Netlify

### **Backend**
* **Framework:** FastAPI (Python 3.10+)
* **AI Engine:** Google Gemini Pro (`google-generativeai`)
* **Document Parsing:** PyPDF2 / `python-docx`
* **Concurrency:** `asyncio` + `ThreadPoolExecutor`
* **Server:** Uvicorn
* **Deployment:** Render

---

## 📁 Repository Structure

```text
AI-Powered-Resume-Screening-and-Shortlisting-System-for-Recruitments/
├── frontend/                     # React + Vite Frontend Application
│   ├── public/                   # Static assets, sitemap, robots.txt, _redirects
│   │   ├── _redirects            # Netlify SPA routing rules
│   │   ├── favicon.png           # Custom Nexus Logo
│   │   ├── robots.txt            # Search engine directives
│   │   └── sitemap.xml           # SEO Sitemap
│   ├── src/                      # Source React components
│   │   ├── App.jsx               # Main SPA routing & UI logic
│   │   ├── index.css             # Tailwind imports
│   │   └── main.jsx              # Entry point
│   ├── index.html                # Pre-rendered HTML + OpenGraph Meta + Schema
│   ├── package.json              # Frontend dependencies
│   └── vite.config.js            # Vite bundler configuration
│
└── backend/                      # FastAPI Backend Server
    ├── main.py                   # API routes, SSE streaming, file packaging
    ├── scanner.py                # Gemini LLM prompt construction & PDF parsing
    └── requirements.txt          # Python dependencies
    

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
