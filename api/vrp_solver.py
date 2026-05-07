import pandas as pd
import numpy as np
import math
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

def haversine_distance_meters(lat1, lon1, lat2, lon2):
    """Calculate the great-circle distance between two points on the Earth surface."""
    R = 6371.0 # Radius of earth in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2)**2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(R * c * 1000)

def solve_dispatch_vrp(work_orders_df: pd.DataFrame, technicians_df: pd.DataFrame):
    """
    Solves the VRP for given work orders and technicians.
    Returns: List of dicts representing assigned sequences per technician.
    """
    num_orders = len(work_orders_df)
    num_techs = len(technicians_df)
    
    # ----------------------------------------
    # 1. SETUP LOCATIONS & DISTANCE MATRIX
    # ----------------------------------------
    locations = []
    
    # Indices 0 to num_orders-1 are Work Orders
    for _, row in work_orders_df.iterrows():
        locations.append((row['Latitude'], row['Longitude']))
        
    # Indices num_orders to num_orders + num_techs - 1 are Technician Start Locations
    for _, row in technicians_df.iterrows():
        locations.append((row['StartLat'], row['StartLong']))
        
    # Given techs don't have to return to a depot, we create a Dummy End Node.
    # We will set the distance from any node to this dummy node to 0. 
    dummy_end_idx = len(locations)
    locations.append((0.0, 0.0)) 

    # Building distance matrix
    distance_matrix = []
    for i in range(len(locations)):
        row_distances = []
        for j in range(len(locations)):
             if i == dummy_end_idx or j == dummy_end_idx:
                 row_distances.append(0) # 0 distance to artificial end
             else:
                 row_distances.append(haversine_distance_meters(
                     locations[i][0], locations[i][1], 
                     locations[j][0], locations[j][1]
                 ))
        distance_matrix.append(row_distances)

    # ----------------------------------------
    # 2. SETUP ROUTING INDEX MANAGER
    # ----------------------------------------
    starts = [num_orders + i for i in range(num_techs)]
    ends = [dummy_end_idx for _ in range(num_techs)]
    
    manager = pywrapcp.RoutingIndexManager(len(locations), num_techs, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    # ----------------------------------------
    # 3. SET DISTANCE CALLBACKS
    # ----------------------------------------
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    # Optional constraint: Max travel distance per technician (e.g. 500km)
    routing.AddDimension(
        transit_callback_index,
        0,         # no slack
        500000,    # maximum distance limit (500,000 meters)
        True,      # start cumulative distance to zero
        "Distance"
    )

    # ----------------------------------------
    # 4. ENFORCE RULES (Skills & Priority)
    # ----------------------------------------
    work_order_skills = work_orders_df['SkillNeeded'].tolist()
    work_order_priorities = work_orders_df['Priority'].tolist()
    tech_skills = technicians_df['SkillLevel'].tolist()

    for order_idx in range(num_orders):
        order_index = manager.NodeToIndex(order_idx)
        required_skill = work_order_skills[order_idx]
        priority = work_order_priorities[order_idx]
        
        # Find which vehicles (techs) have the required skill level
        # Assuming you want the tech's skill to be greater than or equal to what's needed.
        # Change `tech_skills[v] >= required_skill` if you need an exact skill match.
        allowed_vehicles = [
            v for v in range(num_techs) 
            if tech_skills[v] >= required_skill
        ]
        
        if allowed_vehicles:
            # Constrain order to only be serviced by capable technicians
            routing.VehicleVar(order_index).SetValues(allowed_vehicles)
            
            # Penalize dropping the order. Scale penalty extensively by priority.
            # Example: 100,000 baseline * priority (1-5), making priority 5 cost 500,000.
            # If the tech doesn't have time/distance capacity, the solver knows to drop 
            # low priority tasks before high priority tasks.
            penalty = int(100000 * priority)
            routing.AddDisjunction([order_index], penalty)
        else:
            # Fast fail gracefully: No tech has the required skill, so drop order for free
            routing.AddDisjunction([order_index], 0) 

    # ----------------------------------------
    # 5. SOLVE & EXTRACT
    # ----------------------------------------
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    search_parameters.time_limit.seconds = 5 # Gives Google OR tools 5 seconds to find optimal route
    
    solution = routing.SolveWithParameters(search_parameters)
    
    assignments = []
    
    if solution:
        for vehicle_id in range(num_techs):
            tech_record_id = technicians_df.iloc[vehicle_id]['ID']
            route_sequence = []
            
            index = routing.Start(vehicle_id)
            while not routing.IsEnd(index):
                node_index = manager.IndexToNode(index)
                if node_index < num_orders: 
                    route_sequence.append(work_orders_df.iloc[node_index]['ID'])
                index = solution.Value(routing.NextVar(index))
                
            assignments.append({
                'TechID': tech_record_id, 
                'AssignedWorkOrders': route_sequence
            })
            
    return assignments

# ==========================================
# Example Execution Context
# ==========================================
if __name__ == '__main__':
    # Sample Test Data
    orders_data = {
        'ID': ['WO1', 'WO2', 'WO3', 'WO4'],
        'Latitude': [34.0522, 34.0622, 34.0722, 33.9522],
        'Longitude': [-118.2437, -118.2537, -118.2637, -118.1437],
        'Priority': [5, 1, 3, 5],
        'SkillNeeded': [2, 1, 3, 1]
    }
    
    techs_data = {
        'ID': ['TechA', 'TechB'],
        'StartLat': [34.00, 33.90],
        'StartLong': [-118.20, -118.10],
        'SkillLevel': [2, 3] # TechB takes higher level jobs
    }
    
    df_orders = pd.DataFrame(orders_data)
    df_techs = pd.DataFrame(techs_data)
    
    routes = solve_dispatch_vrp(df_orders, df_techs)
    
    for r in routes:
        print(f"Technician: {r['TechID']} -> Route: {r['AssignedWorkOrders']}")
