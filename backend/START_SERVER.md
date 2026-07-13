# Start Backend Server

## Prerequisites
1. Install ngspice (Windows: ngspice_con)
2. Train ML model: `python src/train.py` (from parent directory)

## Install Dependencies
```bash
python -m pip install fastapi uvicorn pydantic pandas numpy scikit-learn joblib httpx python-multipart
```

## Run Server
```bash
python main.py
```

Server will start at: **http://localhost:8000**

API Documentation: **http://localhost:8000/docs**
