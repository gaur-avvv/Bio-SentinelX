import re

with open('services/geminiService.ts', 'r') as f:
    content = f.read()

# Enhance the prompt generation to emphasize extreme precision in reporting since it's a matter of health
# We'll update the system instructions in geminiService to be much more strict about precision.
content = content.replace("Generate a highly precise, scientific, and structured analytical report",
                          "Generate a highly precise, highly accurate, scientific, and structured analytical report. This is a matter of critical human health. Do not guess or hallucinate. Rely strictly on the provided real-time data and scientific medical knowledge.")

with open('services/geminiService.ts', 'w') as f:
    f.write(content)
