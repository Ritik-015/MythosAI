from dotenv import load_dotenv
import os

load_dotenv()

LM_STUDIO_BASE_URL = os.getenv("LM_STUDIO_BASE_URL")
LM_STUDIO_API_KEY = os.getenv("LM_STUDIO_API_KEY")

MODEL_NAME  = os.getenv("MODEL_NAME")

TEMPERATURE = float(os.getenv("TEMPERATURE", 0.7))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", 2048))

DEBUG = os.getenv("DEBUG", "False").lower() == "true"