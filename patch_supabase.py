import re

with open('services/outbreakPredictionService.ts', 'r') as f:
    content = f.read()

# Make sure IDSP_SYNDROMES is imported properly for the checkCloudEarlyWarning
if "import { fetchGlobalSignals" in content:
    content = content.replace("import { fetchGlobalSignals, fetchGlobalAlerts } from './supabaseService';",
    """import { fetchGlobalSignals, fetchGlobalAlerts } from './supabaseService';
import { IDSP_SYNDROMES } from './indicDataService';""")

with open('services/outbreakPredictionService.ts', 'w') as f:
    f.write(content)
