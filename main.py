import os  # Helps your code talk to your computer's operating system (used to find files or create new folders).
import shutil  # A tool for moving and copying files (used to copy the winning CVs into your "shortlisted" folder).
import pandas as pd  # Organizes data into neat rows and columns (great if you want to export your final CV results into an Excel or CSV spreadsheet).
from pypdf import PdfReader  # Opens PDF files and rips the raw text out of them so the AI can read it.
from pydantic import BaseModel, Field  # Creates a strict "blueprint" or rulebook that forces the AI to give us specific data (like exact numbers or specific words).
from openai import OpenAI  # The main bridge that lets your code talk to AI models over the internet (works for ChatGPT, Groq, or DeepSeek).
import instructor  # A clever add-on tool that acts like a manager, making absolutely sure the AI outputs our clean Pydantic blueprint data instead of conversational chat.

# =====================================================
# CONFIGURATION
# =====================================================

GROQ_API_KEY = "YOUR API KEY"

INPUT_FOLDER = "input_cvs"
OUTPUT_FOLDER = "shortlisted_cvs"

MINIMUM_SCORE = 60

TARGET_SKILLS = [
    "python",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "langchain",
    "llm",
    "nlp",
    "computer vision",
    "data science",
    "scikit-learn",
]
# =====================================================
# GROQ CLIENT
# =====================================================

client = instructor.from_openai(
    OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=GROQ_API_KEY,
    ),
    mode=instructor.Mode.JSON,
)

# =====================================================
# STRUCTURED OUTPUT
# =====================================================

class CandidateProfile(BaseModel):
    full_name: str = Field(default="")
    highest_degree: str = Field(default="")
    field_of_study: str = Field(default="")
    ai_experience_years: float = Field(default=0)
    technical_skills: list[str] = Field(default_factory=list)
    summary: str = Field(default="")

# =====================================================
# PDF READER
# =====================================================

def extract_text_from_pdf(pdf_path):
    try:
        reader = PdfReader(pdf_path)

        text = ""

        for page in reader.pages:
            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

        return text[:15000]

    except Exception as e:
        print(f"PDF Error: {e}")
        return ""

# =====================================================
# AI EXTRACTION
# =====================================================

def analyze_resume(text):

    prompt = f"""
You are a professional AI recruiter.

Extract:

1. Full Name
2. Highest Degree
3. Field Of Study
4. AI/ML/Data Science experience in years
5. Technical Skills
6. Short professional summary

Resume:

{text}
"""

    result = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        response_model=CandidateProfile,
        messages=[
            {
                "role": "system",
                "content": "Extract resume information accurately."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return result

# =====================================================
# SCORING
# =====================================================

def calculate_score(candidate):

    score = 0

    degree = candidate.highest_degree.upper()
    field = candidate.field_of_study.upper()

    if any(x in degree for x in ["PHD"]):
        score += 40

    elif any(x in degree for x in ["MASTER", "MS", "M.SC"]):
        score += 30

    elif any(x in degree for x in ["BACHELOR", "BS", "B.SC"]):
        score += 15

    ai_fields = [
        "ARTIFICIAL INTELLIGENCE",
        "AI",
        "MACHINE LEARNING",
        "DATA SCIENCE",
        "COMPUTER SCIENCE",
    ]

    if any(f in field for f in ai_fields):
        score += 30

    score += min(candidate.ai_experience_years * 8, 40)

    skill_matches = 0

    for skill in candidate.technical_skills:
        if skill.lower() in TARGET_SKILLS:
            skill_matches += 1

    score += skill_matches * 3

    return round(score, 2)

# =====================================================
# MAIN PIPELINE
# =====================================================

def run():

    os.makedirs(INPUT_FOLDER, exist_ok=True)
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    pdfs = [
        f for f in os.listdir(INPUT_FOLDER)
        if f.lower().endswith(".pdf")
    ]

    if not pdfs:
        print("No PDFs found.")
        return

    results = []

    print(f"\nFound {len(pdfs)} CV(s)\n")

    for pdf in pdfs:

        pdf_path = os.path.join(INPUT_FOLDER, pdf)

        print("=" * 60)
        print(f"Processing: {pdf}")

        text = extract_text_from_pdf(pdf_path)

        if not text.strip():
            print("Skipped: Empty PDF")
            continue

        try:

            candidate = analyze_resume(text)

            score = calculate_score(candidate)

            shortlisted = score >= MINIMUM_SCORE

            if shortlisted:

                shutil.copy(
                    pdf_path,
                    os.path.join(OUTPUT_FOLDER, pdf)
                )

            results.append({
                "File": pdf,
                "Name": candidate.full_name,
                "Degree": candidate.highest_degree,
                "Field": candidate.field_of_study,
                "AI Experience": candidate.ai_experience_years,
                "Score": score,
                "Shortlisted": shortlisted,
                "Skills": ", ".join(candidate.technical_skills)
            })

            print(f"Name: {candidate.full_name}")
            print(f"Degree: {candidate.highest_degree}")
            print(f"Field: {candidate.field_of_study}")
            print(f"Experience: {candidate.ai_experience_years} years")
            print(f"Score: {score}")

            if shortlisted:
                print("✅ SHORTLISTED")
            else:
                print("❌ REJECTED")

        except Exception as e:
            print(f"Groq Error: {e}")

    if results:

        df = pd.DataFrame(results)

        df = df.sort_values(
            by="Score",
            ascending=False
        )

        df.to_csv(
            "screening_results.csv",
            index=False
        )

        print("\nCSV report saved:")
        print("screening_results.csv")

    print("\nDone.")

# =====================================================
# ENTRY POINT
# =====================================================

if __name__ == "__main__":
    run()