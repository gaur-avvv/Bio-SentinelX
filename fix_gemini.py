import sys

with open('services/geminiService.ts', 'r') as f:
    content = f.read()

# Fix parameter list
old_params = 'apiKey?: string\n): Promise<AnalysisResponse> => {'
new_params = 'apiKey?: string,\n  mlPrediction?: any,\n): Promise<AnalysisResponse> => {'
content = content.replace(old_params, new_params)

# Fix context injection
if '### ML Intelligence Core Prediction' not in content:
    old_insertion = 'const feedbackContext = `'
    new_insertion = """const mlPredictionContext = `
    ### ML Intelligence Core Prediction
    ${mlPrediction ? `
    - Disease: ${mlPrediction.disease}
    - Confidence: ${(mlPrediction.confidence * 100).toFixed(1)}%
    - Risk Level: ${mlPrediction.riskLevel}
    - Primary Trigger: ${mlPrediction.primaryTrigger}
    - Recommendation: ${mlPrediction.recommendation}
    ` : "No ML prediction available."}
    `;

  const feedbackContext = `"""
    content = content.replace(old_insertion, new_insertion)

# Fix template usage
if 'mlPredictionContext' not in content:
     content = content.replace('### Ground Intel & Lifestyle', '${mlPredictionContext}\n\n    ### Ground Intel & Lifestyle')

with open('services/geminiService.ts', 'w') as f:
    f.write(content)
