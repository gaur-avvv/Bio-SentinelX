import { HealthRecord, DatasetStats, ColumnStats } from '../types';

export const parseCSV = async (file: File): Promise<HealthRecord[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        resolve([]);
        return;
      }

      // Handle different newline formats
      const lines = text.split(/\r\n|\n/).map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length < 2) {
        resolve([]);
        return;
      }

      // Robust header parsing
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '')); // Remove quotes if present
      const data: HealthRecord[] = [];

      // Parse up to 1000 rows to provide a better statistical sample without crashing browser
      const MAX_ROWS = 1000;
      const limit = Math.min(lines.length, MAX_ROWS + 1); 
      
      for (let i = 1; i < limit; i++) {
        const currentLine = lines[i].split(',');
        
        // Skip malformed lines
        if (currentLine.length < headers.length) continue;

        const record: HealthRecord = {};
        let hasValues = false;

        headers.forEach((header, index) => {
          let value = currentLine[index] ? currentLine[index].trim() : '';
          value = value.replace(/^"|"$/g, ''); // Clean quotes
          
          // Handle common missing value indicators
          const lowerVal = value.toLowerCase();
          if (['n/a', 'na', 'null', 'undefined', '-', 'nan'].includes(lowerVal)) {
            value = '';
          }
          
          if (value !== '') hasValues = true;
          
          const numValue = parseFloat(value);
          // Store as number if it's a valid number and not an empty string, otherwise string
          record[header] = !isNaN(numValue) && value !== '' ? numValue : value;
        });

        if (hasValues) {
          data.push(record);
        }
      }
      resolve(data);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};

export const calculateDatasetStats = (data: HealthRecord[]): DatasetStats => {
  if (data.length === 0) return {};

  const stats: DatasetStats = {};
  const headers = Object.keys(data[0]);

  headers.forEach(header => {
    // Check if column is numeric by checking the first few non-empty rows
    const isNumeric = data.slice(0, 20).every(row => {
      const val = row[header];
      return typeof val === 'number' || val === '';
    });

    if (isNumeric) {
      const values = data
        .map(row => row[header])
        .filter(val => typeof val === 'number') as number[];

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = parseFloat((sum / values.length).toFixed(2));

        stats[header] = { min, max, mean };
      }
    }
  });

  return stats;
};

export const summarizeHealthData = (data: HealthRecord[]): string => {
  if (data.length === 0) return "No historical health data provided.";

  const headers = Object.keys(data[0]);
  const sampleCount = data.length;
  const stats = calculateDatasetStats(data);
  
  // Format stats for the LLM
  let statsSummary = "Descriptive Statistics for Numerical Columns:\n";
  Object.entries(stats).forEach(([col, stat]) => {
    statsSummary += `- ${col}: Min=${stat.min}, Max=${stat.max}, Mean=${stat.mean}\n`;
  });

  const sampleJson = JSON.stringify(data.slice(0, 15)); 

  return `
    Dataset Summary:
    - Total Records Loaded: ${sampleCount} (showing first 15)
    - Columns Detected: ${headers.join(', ')}
    
    ${statsSummary}

    - Sample Data: ${sampleJson}
  `;
};