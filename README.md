# AI-Powered CV Screening and Shortlisting System

An automated CV screening system that uses Google Gemini to analyze PDF resumes, score candidates, generate an ATS-style CSV report, and move shortlisted CVs into a separate folder.

## Features

- Direct PDF CV analysis using Gemini
- No local PDF parsing libraries required
- One ATS decision per CV
- Automatic candidate scoring
- CSV report generation
- Parallel processing for faster screening
- Quota-safe batch processing
- Automatic movement of shortlisted CVs
- Handles locked CSV files by creating a timestamped report

## Tech Stack

- Python
- Google Gemini API
- Gemini 3.1 Flash Lite
- CSV reporting
- Parallel processing with `ThreadPoolExecutor`

## Project Structure

```text
resume_analyzer/
├── input_cvs/
│   └── candidate_resume.pdf
├── shortlisted_cvs/
│   └── shortlisted_resume.pdf
├── main.py
├── screening_results.csv
└── README.md
