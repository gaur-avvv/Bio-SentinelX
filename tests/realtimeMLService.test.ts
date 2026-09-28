import { describe, it, expect } from 'vitest';
import {
  computeRocAndAuc,
  autoDetectFeaturesAndLabel,
  generateIEEELaTeXTable,
  exportExperimentalResultsCSV,
  runStratifiedCrossValidation,
  TrainingResult,
} from '../services/realtimeMLService';

describe('Real-Time ML Rigor & Statistical Benchmark Suite', () => {
  describe('computeRocAndAuc (Multiclass One-vs-Rest ROC & Trapezoidal AUC)', () => {
    it('should compute near-perfect AUC (>= 0.95) for a separable 3-class prediction', () => {
      // 3 classes, 6 samples with well-calibrated probabilities
      const yTrue = [0, 0, 1, 1, 2, 2];
      const yProb = [
        [0.90, 0.05, 0.05],
        [0.85, 0.10, 0.05],
        [0.05, 0.90, 0.05],
        [0.10, 0.80, 0.10],
        [0.05, 0.05, 0.90],
        [0.02, 0.08, 0.90],
      ];
      const classNames = ['Disease A', 'Disease B', 'Disease C'];

      const roc = computeRocAndAuc(yTrue, yProb, classNames);

      expect(roc).toBeDefined();
      expect(roc.macroAuc).toBeGreaterThanOrEqual(0.95);
      expect(roc.microAuc).toBeGreaterThanOrEqual(0.95);
      expect(roc.classAucs!['Disease A']).toBeGreaterThanOrEqual(0.95);
      expect(roc.classAucs!['Disease B']).toBeGreaterThanOrEqual(0.95);
      expect(roc.classAucs!['Disease C']).toBeGreaterThanOrEqual(0.95);

      // Verify standardized 50-step FPR interpolation grid
      expect(roc.macro.length).toBe(51);
      expect(roc.macro[0].fpr).toBe(0.0);
      expect(roc.macro[50].fpr).toBe(1.0);
      expect(roc.micro.length).toBe(51);
    });

    it('should handle edge cases with 0 and 1 probability boundaries', () => {
      const yTrue = [0, 1];
      const yProb = [
        [1.0, 0.0],
        [0.0, 1.0],
      ];
      const classNames = ['Negative', 'Positive'];

      const roc = computeRocAndAuc(yTrue, yProb, classNames);
      expect(roc.macroAuc).toBe(1.0);
      expect(roc.microAuc).toBe(1.0);
    });
  });

  describe('autoDetectFeaturesAndLabel', () => {
    it('should correctly classify columns and detect classification task', () => {
      const mockData = [
        { age: '25', temp: '36.5', cough: '1', disease: 'Flu' },
        { age: '30', temp: '37.8', cough: '0', disease: 'Cold' },
        { age: '45', temp: '39.0', cough: '1', disease: 'Flu' },
        { age: '60', temp: '38.2', cough: '1', disease: 'Dengue' },
        { age: '50', temp: '36.7', cough: '0', disease: 'Cold' },
      ];

      const detected = autoDetectFeaturesAndLabel(mockData);

      expect(detected.features).toContain('age');
      expect(detected.features).toContain('temp');
      expect(detected.features).toContain('cough');
      expect(detected.label).toBe('disease');
      expect(detected.taskType).toBe('classification');
      expect(detected.numClasses).toBe(3);
    });
  });

  describe('generateIEEELaTeXTable & exportExperimentalResultsCSV', () => {
    const mockResult: TrainingResult = {
      modelType: 'xgboost',
      accuracy: 0.942,
      loss: 0.125,
      f1Score: 0.938,
      precision: 0.940,
      recall: 0.936,
      trainTime: 1.45,
      featureImportance: [
        { feature: 'temp', importance: 0.55 },
        { feature: 'humidity', importance: 0.45 },
      ],
      trainingHistory: [],
      perClassMetrics: [
        {
          className: 'Class A',
          classIndex: 0,
          support: 30,
          tp: 28,
          fp: 3,
          tn: 67,
          fn: 2,
          precision: 0.903,
          recall: 0.933,
          specificity: 0.957,
          f1Score: 0.918,
          npv: 0.971,
          auc: 0.985,
        },
        {
          className: 'Class B',
          classIndex: 1,
          support: 70,
          tp: 67,
          fp: 2,
          tn: 28,
          fn: 3,
          precision: 0.971,
          recall: 0.957,
          specificity: 0.933,
          f1Score: 0.964,
          npv: 0.903,
          auc: 0.985,
        },
      ],
      macroAuc: 0.985,
      microAuc: 0.985,
      crossValidation: {
        kFolds: 5,
        folds: [
          { fold: 1, accuracy: 0.95, f1Score: 0.94, precision: 0.95, recall: 0.93, auc: 0.95, valSamples: 20 },
          { fold: 2, accuracy: 0.93, f1Score: 0.92, precision: 0.93, recall: 0.91, auc: 0.93, valSamples: 20 },
        ],
        meanAccuracy: 0.94,
        stdAccuracy: 0.014,
        ci95Accuracy: [0.928, 0.952],
        meanF1: 0.93,
        stdF1: 0.014,
        ci95F1: [0.918, 0.942],
        meanPrecision: 0.94,
        stdPrecision: 0.014,
        meanRecall: 0.92,
        stdRecall: 0.014,
        meanAuc: 0.94,
        stdAuc: 0.014,
      },
    };

    it('should generate IEEEtran-compliant booktabs LaTeX code', () => {
      const latex = generateIEEELaTeXTable(mockResult);

      expect(latex).toContain('\\begin{table*}');
      expect(latex).toContain('\\toprule');
      expect(latex).toContain('\\midrule');
      expect(latex).toContain('\\bottomrule');
      expect(latex).toContain('Class A');
      expect(latex).toContain('Class B');
      expect(latex).toContain('0.985'); // AUC check
      expect(latex).toContain('Stratified 5-Fold Cross-Validation');
    });

    it('should generate properly structured experimental CSV', () => {
      const csv = exportExperimentalResultsCSV(mockResult);

      expect(csv).toContain('Category,Class Name,Support,Precision,Recall_Sensitivity,Specificity,NPV,F1_Score,AUC_ROC');
      expect(csv).toContain('Disease,"Class A",30,0.903,0.933,0.957,0.971,0.918,0.985');
      expect(csv).toContain('Summary,Macro Average,100,0.94,0.936,N/A,N/A,0.938,0.985');
      expect(csv).toContain('Cross Validation Fold,Accuracy,Precision,Recall,F1_Score,AUC,Validation Samples');
      expect(csv).toContain('Mean,0.94,0.94,0.92,0.93,0.94');
    });
  });

  describe('runStratifiedCrossValidation', () => {
    it('should partition folds preserving stratification and calculate 95% confidence intervals', async () => {
      // 3 classes with 10 samples each = 30 samples total
      const syntheticData: Record<string, unknown>[] = [];
      const classes = ['Disease_A', 'Disease_B', 'Disease_C'];
      for (let c = 0; c < 3; c++) {
        for (let s = 0; s < 10; s++) {
          syntheticData.push({
            age: 20 + c * 15 + s,
            temp: 36.0 + c * 1.2 + (s * 0.1),
            humidity: 0.4 + c * 0.2,
            target: classes[c],
          });
        }
      }

      const autoDetect = autoDetectFeaturesAndLabel(syntheticData);
      const cvSummary = await runStratifiedCrossValidation(
        syntheticData,
        {
          modelType: 'xgboost',
          epochs: 5,
          learningRate: 0.1,
          batchSize: 8,
          validationSplit: 0.2,
          hiddenLayers: [8],
          nEstimators: 3,
          maxDepth: 2,
        },
        autoDetect,
        3
      );

      expect(cvSummary).toBeDefined();
      expect(cvSummary.kFolds).toBe(3);
      expect(cvSummary.folds.length).toBe(3);
      expect(cvSummary.meanAccuracy).toBeGreaterThan(0);
      expect(cvSummary.meanAccuracy).toBeLessThanOrEqual(1.0);
      expect(cvSummary.ci95Accuracy).toBeDefined();
      expect(cvSummary.ci95Accuracy.length).toBe(2);
      expect(cvSummary.ci95Accuracy[0]).toBeLessThanOrEqual(cvSummary.ci95Accuracy[1]);
      expect(cvSummary.meanF1).toBeGreaterThan(0);
    });
  });
});
