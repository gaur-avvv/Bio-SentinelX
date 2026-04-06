import re

with open('services/outbreakPredictionService.ts', 'r') as f:
    content = f.read()

# Fix the duplicate import of IDSP_SYNDROMES issue
content = re.sub(r"import \{ IDSP_SYNDROMES \} from '\./indicDataService';\n", "", content)

# But ensure we still have it imported at the top
if "import { IDSP_SYNDROMES, type IDSPSyndrome" not in content:
    content = "import { IDSP_SYNDROMES, type IDSPSyndrome, type EpiClimRecord } from './indicDataService';\n" + content

with open('services/outbreakPredictionService.ts', 'w') as f:
    f.write(content)

with open('components/AnalysisDashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "import { checkCloudEarlyWarning, type CloudEarlyWarning } from '../services/outbreakPredictionService';",
    "import { checkCloudEarlyWarning, type CloudEarlyWarning } from '../services/outbreakPredictionService';"
)

with open('components/AnalysisDashboard.tsx', 'w') as f:
    f.write(content)
