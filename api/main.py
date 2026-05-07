import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
from typing import List, Dict, Any

# Import the solver function we wrote
from vrp_solver import solve_dispatch_vrp

app = FastAPI(title="VRP Dispatch Solver API")

class OptimizationRequest(BaseModel):
    work_orders: List[Dict[str, Any]]
    technicians: List[Dict[str, Any]]

@app.post("/solve")
def solve(request: OptimizationRequest):
    try:
        # Convert JSON back to pandas DataFrames
        df_orders = pd.DataFrame(request.work_orders)
        df_techs = pd.DataFrame(request.technicians)
        
        # Run the logic
        routes = solve_dispatch_vrp(df_orders, df_techs)
        return {"status": "success", "routes": routes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
