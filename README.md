# AI-Powered CV Screening System

An automated resume screening tool that extracts information from PDF resumes, evaluates candidates based on predefined hiring criteria, and automatically shortlists the most relevant applicants.

## Features

- Read multiple PDF resumes from a folder
- Extract resume text automatically
- AI-powered candidate information extraction using Groq LLM
- Candidate scoring based on:
  - Education
  - Field of study
  - AI/ML experience
  - Technical skills
- Automatic shortlisting of qualified candidates
- CSV report generation
- Error handling for invalid or unreadable PDFs

## Tech Stack

- Python
- Groq API
- Llama 3.3 70B
- PyPDF
- Pydantic
- Instructor
- Pandas

## Project Structure

```text
project/

├── input_cvs/
│   └── Candidate PDFs

├── shortlisted_cvs/
│   └── Shortlisted PDFs

├── groq_screener.py

└── screening_results.csv