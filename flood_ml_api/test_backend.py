import asyncio
from models.schemas import PredictionRequest
from services.predictor import FloodPredictor
from services.feature_engineering import build_feature_vector

req = PredictionRequest(latitude=20.0, longitude=80.0)
df = build_feature_vector(req)
print(df.head())

predictor = FloodPredictor()
wards = predictor._generate_ward_grid(20.0, 80.0, 10.0)
print(wards)
print('Success!')
