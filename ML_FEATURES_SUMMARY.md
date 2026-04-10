# Bio-SentinelX ML Features - Comprehensive Summary

## Overview
A complete in-browser ML training and prediction system has been integrated into Bio-SentinelX, enabling real-time disease risk assessment using multiple algorithm backends.

---

## 1. Real-Time ML Training (`services/realtimeMLService.ts`)

### Supported Algorithms
- **XGBoost**: Gradient Boosted Decision Trees
- **Deep Learning**: Multi-layer neural networks (configurable hidden layers)
- **WebML + TensorFlow Lite**: Quantized neural inference for edge deployment
- **Ensemble**: RF + XGBoost + NN + TFLite (weighted model averaging)

### Training Pipeline
1. **CSV Upload & Auto-Detection**
   - Auto-detects numeric/categorical/text/datetime columns
   - Automatically identifies best model type
   - Validates dataset (min 10 samples, max 100,000 rows)
   - Max file size: 50MB

2. **Manual Feature/Label Selection**
   - Override auto-detected features and labels
   - Select/clear individual features
   - Choose target label from available columns

3. **Configurable Training Settings**
   - Epochs, Learning Rate, Batch Size
   - Validation Split ratio
   - Number of Trees (estimators), Max Depth
   - Hidden layer configuration

4. **Training Metrics & Progress**
   - Real-time epoch-by-epoch progress display
   - Training/validation loss and accuracy curves
   - Feature importance ranking

### Performance Metrics Tracked
- **Accuracy**: % of correct predictions
- **Loss**: Validation loss value
- **F1 Score**: Harmonic mean of precision/recall
- **Precision**: True positive rate of positive predictions
- **Recall**: True positive rate among actual positives
- **Training Time**: Total training duration (seconds)
- **Confusion Matrix**: Per-class prediction breakdown

---

## 2. Trained Model Inference (`predictWithTrainedModel`)

### Full Feature Payload Passed to Model
**Core Weather Features:**
- Temperature, feels-like, pressure, humidity, wind speed/direction
- Cloud coverage, visibility, UV index, AQI

**Advanced Atmospheric:**
- PM2.5, PM10, O3, NO2, SO2, CO, CO2
- Boundary layer height, CAPE, convective inhibition
- Wind gusts, wet bulb temperature, soil temp/moisture

**Pollen/Allergen Signals:**
- Alder, birch, grass, mugwort, olive, ragweed pollen

**User Context:**
- Age, height, weight, BMI
- Smoking, lifestyle, medication, exercise level
- Allergies, medical history, food habits

**Local Intelligence:**
- User feedback text with keyword extraction
- Fog, smoke, pollen, water stagnation indicators

### Output Payload
```typescript
{
  prediction: string;                    // Disease class predicted
  confidence: number;                    // 0-1 confidence score
  probabilities: Record<string, number>; // All class probabilities
  topFactors: Array<...>;               // Top 5 contributing factors
  factorContributions: Array<...>;      // SHAP-like signed contributions
  confidenceBreakdown: {                // Why this prediction was chosen
    topClass: string;
    topClassProbabilityPct: number;
    secondClass: string;
    secondClassProbabilityPct: number;
    marginPct: number;                  // Decision margin
  };
  topPredictorSnapshot: Array<...>;     // Top 8 predictors + values used
}
```

---

## 3. Model Input Features

### Live Feature-Only Mode
- Toggle: "Use Selected Live Features Only"
- When enabled: prediction input restricted to exact trained feature set
- Includes canonical matching for naming variations
- Prevents feature mismatch errors

### Auto Feature Masking
- Maps weather/user data to trained feature names
- Handles null/undefined values (defaults to 0)
- Validates all values are finite

---

## 4. Signed Contributions (SHAP-like) 

### Factor Impact Chart
- **Red bars**: Features that increase disease risk
- **Green bars**: Features that decrease disease risk
- **Bar length**: Magnitude of feature contribution
- **Hover tooltip**: Shows feature value and exact importance score

### Contribution Calculation
- Normalizes feature values relative to training statistics
- Weights by learned feature importance
- Clamps to [-1, 1] range for stability
- Handles categorical features with ordinal encoding

---

## 5. Report Generation & Export

### Generated Report Sections
1. Trained Model Prediction
2. Why This Disease Was Chosen
3. Confidence Breakdown (top vs runner-up)
4. Class Probability Distribution
5. Model Input Snapshot (top predictors + values)
6. Model Performance Metrics
7. Contributing Factors
8. Recommendations

### Export Options
- **JSON Export**: Full snapshot with all metadata (validated, size-checked)
- **CSV Export**: Factor contributions table (filtered, formatted)
- Both exports include timestamps and data validation

### Error Handling
- File size limits (>10MB rejected)
- Invalid value detection and filtering
- Graceful error messages to user
- Console logging for debugging

---

## 6. Auto-Retrain with Live Data

### Configuration
- **Enable/Disable**: Toggle in ML Train panel
- **Interval Options**: 5, 10, 15, 30, 45, 60 minutes
- **Settings Persisted**: localStorage

### Status Display
- Last auto-retrain timestamp
- Next run countdown (real-time updated)
- Enabled/disabled state

### Auto-Retrain Flow
1. Checks if enabled and interval elapsed
2. Runs WebLLM training with latest weather
3. Updates outbreak predictions
4. Records last-run timestamp
5. 10-minute timeout protection

---

## 7. Model Accuracy & Performance Metrics Display

### UI Card (ML Inference Section)
Displays when a trained model makes a prediction:
- Accuracy (%)
- Loss (validation)
- F1 Score (%)
- Training Time (s)
- Precision (%)
- Recall (%)

### Report Integration
Appended to generated analysis markdown:
- Model Accuracy
- Model Loss
- F1 Score
- Precision / Recall
- Training Time

---

## 8. Feature Enhancements & Refinements

### Error Handling
- Input validation (file size, row count, data types)
- Null/undefined checks throughout prediction pipeline
- Training timeout protection (10 minutes)
- Graceful fallbacks for missing data

### Data Validation
- CSV files: max 50MB, max 100,000 rows
- Training samples: min 10, max 100,000
- Feature values: must be numeric or categorical
- Export payloads: size-checked and sanitized

### Error Messages
- User-friendly descriptions
- Actionable guidance (e.g., "At least 10 samples required")
- Console logging for developers

### Performance
- Efficient factor importance sorting
- Lazy computation of metrics
- Minimal memory allocations during prediction
- Clamped numeric values prevent NaN/Infinity propagation

---

## 9. UI Polish & UX

### ML Train Panel
- Step-by-step guided workflow (Upload → Detect → Configure → Train)
- Clear status indicators (checkmarks, progress bars)
- Collapsible advanced settings
- Auto-retrain status with countdown
- Responsive grid layouts (mobile-friendly)

### ML Inference Card  
- Prominent display of trained model metrics
- Color-coded confidence levels
- Interactive tooltips with detailed explanations
- Export buttons positioned for easy access
- Copy-friendly data in tables/cards

### Accessibility
- Semantic HTML (labels linked to inputs)
- ARIA labels on buttons
- Keyboard navigable controls
- High contrast color schemes

---

## 10. Configuration Defaults

```typescript
DEFAULT_TRAINING_CONFIG = {
  modelType: 'ensemble',
  epochs: 50,
  learningRate: 0.01,
  batchSize: 32,
  validationSplit: 0.2,
  hiddenLayers: [128, 64, 32],
  nEstimators: 100,
  maxDepth: 6,
};
```

---

## 11. Integration Points

### Dashboard (`AnalysisDashboard.tsx`)
- Auto-retrain interval tick (60-second polling)
- Trained model prediction in analysis flow
- Parallel execution with Gemini analysis
- Full feature context passed to inference

### ML Training Panel (`MLTrainingPanel.tsx`)
- Default opens if no model trained
- Auto-switches to Health Profile after training
- Persists settings (auto-retrain, feature-only mode)
- Real-time countdown display

### Services
- `realtimeMLService`: Training & prediction logic
- `mlService`: Bio-Sentinel API integration (fallback)
- `webLLMTrainingService`: Edge model fine-tuning

---

## 12. Key Files Modified/Created

- `/workspaces/Bio-SentinelX/services/realtimeMLService.ts` - ML core
- `/workspaces/Bio-SentinelX/components/AnalysisDashboard.tsx` - Integration
- `/workspaces/Bio-SentinelX/components/MLTrainingPanel.tsx` - Training UI
- `/workspaces/Bio-SentinelX/services/mlService.ts` - Extended types

---

## 13. Testing Recommendations

1. **CSV Upload**: Test with various sizes (small, medium, large)
2. **Feature Selection**: Train with different feature combinations
3. **Auto-Retrain**: Verify countdown updates correctly
4. **Export**: Ensure JSON/CSV contain valid data
5. **Prediction**: Verify all features flow through correctly
6. **Performance**: Monitor training time with different dataset sizes

---

## 14. Future Enhancements

- Confusion matrix visualization
- Per-class precision/recall breakdown
- Cross-validation results display
- Model comparison tool (before/after)
- Automated model versioning & rollback
- Cloud model synchronization
- Real-time model monitoring dashboard
