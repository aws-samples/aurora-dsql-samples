"""
Load sample data into the grid investigation DSQL database.
Uses psycopg2 + boto3 DSQL IAM auth token.

Usage:
  python infra/load_sample_data.py --endpoint <cluster-id>.dsql.us-east-1.on.aws
"""

import argparse
import boto3
import psycopg2

REGION = "us-east-1"


def get_connection(endpoint: str):
    client = boto3.client("dsql", region_name=REGION)
    token = client.generate_db_connect_admin_auth_token(
        Hostname=endpoint, Region=REGION
    )
    return psycopg2.connect(
        host=endpoint,
        port=5432,
        user="admin",
        password=token,
        dbname="postgres",
        sslmode="require",
    )


def run(endpoint: str):
    conn = get_connection(endpoint)
    conn.autocommit = True
    cur = conn.cursor()

    # ── grid_incidents ──
    incidents = [
        ("INC-001","F324","voltage_instability","high","2024-01-15T14:10:00Z","2024-01-15T14:20:00Z","Voltage instability detected on feeder F324 during storm conditions"),
        ("INC-002","F324","outage","critical","2024-01-10T08:30:00Z","2024-01-10T10:15:00Z","Full outage on F324 due to transformer failure"),
        ("INC-003","F324","fault","medium","2024-01-05T16:45:00Z","2024-01-05T17:30:00Z","Ground fault detected on F324 segment 3"),
        ("INC-004","F112","outage","critical","2024-01-12T03:00:00Z","2024-01-12T06:30:00Z","Ice storm caused widespread outage on F112"),
        ("INC-005","F112","voltage_instability","medium","2024-01-18T11:00:00Z","2024-01-18T11:45:00Z","Minor voltage fluctuations on F112"),
        ("INC-006","F205","fault","high","2024-01-14T22:00:00Z","2024-01-15T01:00:00Z","Phase-to-ground fault on F205"),
        ("INC-007","F205","outage","critical","2024-01-08T14:00:00Z","2024-01-08T18:00:00Z","Extended outage on F205 after equipment failure"),
        ("INC-008","F410","voltage_instability","low","2024-01-20T09:00:00Z","2024-01-20T09:30:00Z","Brief voltage dip on F410"),
        ("INC-009","F410","fault","medium","2024-01-03T13:00:00Z","2024-01-03T14:00:00Z","Intermittent fault on F410 section 2"),
        ("INC-010","F550","outage","high","2024-01-16T07:00:00Z","2024-01-16T09:00:00Z","Morning outage on F550 due to overloaded transformer"),
        ("INC-011","F550","voltage_instability","medium","2024-01-22T15:00:00Z","2024-01-22T15:20:00Z","Voltage instability on F550"),
        ("INC-012","F678","fault","high","2024-01-11T10:00:00Z","2024-01-11T12:00:00Z","Cable fault on F678"),
        ("INC-013","F678","outage","critical","2024-01-19T20:00:00Z","2024-01-20T02:00:00Z","Overnight outage on F678"),
        ("INC-014","F678","voltage_instability","low","2024-01-25T08:00:00Z","2024-01-25T08:15:00Z","Minor voltage event on F678"),
        ("INC-015","F999","outage","high","2024-01-17T12:00:00Z","2024-01-17T14:00:00Z","Outage on F999 during high load"),
    ]
    cur.execute("DELETE FROM grid_incidents")
    for r in incidents:
        cur.execute("INSERT INTO grid_incidents (incident_id,feeder_id,incident_type,severity,started_at,resolved_at,description) VALUES (%s,%s,%s,%s,%s,%s,%s)", r)
    print(f"Inserted {len(incidents)} grid_incidents")


    # ── feeder_events ──
    feeder_events = [
        ("FE-001","F324","voltage_spike",12.8,245.0,59.92,"2024-01-15T14:11:00Z","SENS-324-A"),
        ("FE-002","F324","voltage_spike",13.5,260.0,59.88,"2024-01-15T14:13:00Z","SENS-324-A"),
        ("FE-003","F324","phase_imbalance",12.1,310.0,59.95,"2024-01-15T14:15:00Z","SENS-324-B"),
        ("FE-004","F324","current_surge",12.4,380.0,59.90,"2024-01-15T14:17:00Z","SENS-324-A"),
        ("FE-005","F324","voltage_spike",13.9,290.0,59.85,"2024-01-15T14:19:00Z","SENS-324-B"),
        ("FE-006","F324","voltage_spike",13.0,250.0,59.98,"2024-01-10T08:35:00Z","SENS-324-A"),
        ("FE-007","F324","current_surge",12.0,400.0,59.80,"2024-01-10T08:40:00Z","SENS-324-A"),
        ("FE-008","F112","voltage_spike",11.5,200.0,60.01,"2024-01-12T03:10:00Z","SENS-112-A"),
        ("FE-009","F112","phase_imbalance",11.0,220.0,59.97,"2024-01-12T03:30:00Z","SENS-112-B"),
        ("FE-010","F205","current_surge",12.9,350.0,59.91,"2024-01-14T22:10:00Z","SENS-205-A"),
        ("FE-011","F410","voltage_spike",12.2,230.0,60.02,"2024-01-20T09:05:00Z","SENS-410-A"),
        ("FE-012","F550","voltage_spike",13.1,270.0,59.93,"2024-01-16T07:10:00Z","SENS-550-A"),
        ("FE-013","F678","current_surge",12.6,360.0,59.87,"2024-01-11T10:15:00Z","SENS-678-A"),
        ("FE-014","F999","voltage_spike",12.3,240.0,59.99,"2024-01-17T12:10:00Z","SENS-999-A"),
        ("FE-015","F550","phase_imbalance",12.0,280.0,59.94,"2024-01-22T15:05:00Z","SENS-550-B"),
    ]
    cur.execute("DELETE FROM feeder_events")
    for r in feeder_events:
        cur.execute("INSERT INTO feeder_events (event_id,feeder_id,event_type,voltage_kv,current_amps,frequency_hz,recorded_at,sensor_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", r)
    print(f"Inserted {len(feeder_events)} feeder_events")

    # ── switching_events ──
    switching = [
        ("SW-001","F324","open","OP-101","Voltage instability isolation","2024-01-15T14:12:00Z",False),
        ("SW-002","F324","reclose","OP-101","Attempted reclose after voltage stabilized","2024-01-15T14:18:00Z",True),
        ("SW-003","F324","open","OP-102","Transformer failure isolation","2024-01-10T08:32:00Z",False),
        ("SW-004","F324","close","OP-102","Restored after transformer replacement","2024-01-10T10:10:00Z",False),
        ("SW-005","F112","open",None,"Automatic trip during ice storm","2024-01-12T03:05:00Z",True),
        ("SW-006","F112","reclose",None,"Auto-reclose attempt","2024-01-12T03:15:00Z",True),
        ("SW-007","F205","open","OP-103","Fault isolation","2024-01-14T22:05:00Z",False),
        ("SW-008","F410","reclose",None,"Auto-reclose","2024-01-03T13:10:00Z",True),
        ("SW-009","F550","open","OP-104","Overload protection","2024-01-16T07:05:00Z",False),
        ("SW-010","F678","open","OP-105","Cable fault isolation","2024-01-11T10:05:00Z",False),
    ]
    cur.execute("DELETE FROM switching_events")
    for r in switching:
        cur.execute("INSERT INTO switching_events (switch_id,feeder_id,switch_type,operator_id,reason,switched_at,automated) VALUES (%s,%s,%s,%s,%s,%s,%s)", r)
    print(f"Inserted {len(switching)} switching_events")

    # ── transformer_inspections ──
    transformers = [
        ("TI-001","TRF-324-1","F324","degraded",92.5,78.3,"2024-01-14T10:00:00Z","INSP-201","Oil temperature elevated, load near capacity"),
        ("TI-002","TRF-324-1","F324","overloaded",105.0,85.1,"2024-01-15T14:16:00Z","INSP-201","Transformer overloaded during voltage instability event"),
        ("TI-003","TRF-324-2","F324","ok",65.0,55.0,"2024-01-13T09:00:00Z","INSP-202","Normal operation"),
        ("TI-004","TRF-112-1","F112","failed",0.0,12.0,"2024-01-12T04:00:00Z","INSP-203","Transformer failed during ice storm"),
        ("TI-005","TRF-205-1","F205","degraded",88.0,72.0,"2024-01-14T20:00:00Z","INSP-204","Showing signs of degradation"),
        ("TI-006","TRF-550-1","F550","overloaded",110.0,90.0,"2024-01-16T07:30:00Z","INSP-205","Overloaded during morning peak"),
    ]
    cur.execute("DELETE FROM transformer_inspections")
    for r in transformers:
        cur.execute("INSERT INTO transformer_inspections (inspection_id,transformer_id,feeder_id,status,load_percent,oil_temp_c,inspected_at,inspector_id,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", r)
    print(f"Inserted {len(transformers)} transformer_inspections")

    # ── incident_weather ──
    weather = [
        ("WX-001","F324","2024-01-15T14:00:00Z",-2.5,85.0,18.5,"NW",3.2,2.5,"storm"),
        ("WX-002","F324","2024-01-15T14:15:00Z",-3.0,87.0,22.0,"NW",4.1,1.8,"storm"),
        ("WX-003","F324","2024-01-10T08:30:00Z",5.0,60.0,8.0,"S",0.0,50.0,"clear"),
        ("WX-004","F112","2024-01-12T03:00:00Z",-8.0,92.0,25.0,"N",5.5,0.5,"ice"),
        ("WX-005","F112","2024-01-12T04:00:00Z",-9.0,94.0,28.0,"N",6.0,0.3,"ice"),
        ("WX-006","F205","2024-01-14T22:00:00Z",2.0,70.0,12.0,"W",1.0,15.0,"storm"),
        ("WX-007","F550","2024-01-16T07:00:00Z",0.0,75.0,10.0,"E",0.5,30.0,"clear"),
        ("WX-008","F678","2024-01-19T20:00:00Z",-1.0,80.0,15.0,"NE",2.0,5.0,"storm"),
        ("WX-009","F999","2024-01-17T12:00:00Z",8.0,55.0,5.0,"SE",0.0,100.0,"clear"),
    ]
    cur.execute("DELETE FROM incident_weather")
    for r in weather:
        cur.execute("INSERT INTO incident_weather (weather_id,feeder_id,recorded_at,temperature_c,humidity_pct,wind_speed_ms,wind_direction,precipitation,lightning_dist,condition) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", r)
    print(f"Inserted {len(weather)} incident_weather")

    # ── maintenance_log ──
    maintenance = [
        ("ML-001","F324","TRF-324-1","repair","completed","2024-01-20T08:00:00Z","2024-01-20T12:00:00Z","TECH-301","Replaced cooling fan on TRF-324-1"),
        ("ML-002","F112","CBL-112-5","replacement","completed","2024-01-19T09:00:00Z","2024-01-19T16:00:00Z","TECH-302","Replaced damaged cable section from ice storm"),
        ("ML-003","F550","TRF-550-1","inspection","completed","2024-01-21T10:00:00Z","2024-01-21T11:00:00Z","TECH-303","Post-incident transformer inspection"),
        ("ML-004","F678","SW-678-2","upgrade","in_progress","2024-01-22T08:00:00Z",None,"TECH-304","Upgrading switch gear on F678"),
        ("ML-005","F999","TRF-999-1","inspection","scheduled","2024-01-24T09:00:00Z",None,"TECH-305","Scheduled quarterly inspection"),
        ("ML-006","F324","TRF-324-1","inspection","completed","2024-01-14T08:00:00Z","2024-01-14T10:00:00Z","TECH-301","Pre-storm inspection, noted elevated oil temp"),
        ("ML-007","F205","CBL-205-3","repair","completed","2024-01-15T06:00:00Z","2024-01-15T08:00:00Z","TECH-306","Repaired cable splice on F205"),
        ("ML-008","F410","SW-410-1","replacement","completed","2024-01-04T09:00:00Z","2024-01-04T14:00:00Z","TECH-307","Replaced faulty recloser"),
    ]
    cur.execute("DELETE FROM maintenance_log")
    for r in maintenance:
        cur.execute("INSERT INTO maintenance_log (log_id,feeder_id,asset_id,work_type,status,scheduled_at,completed_at,technician_id,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", r)
    print(f"Inserted {len(maintenance)} maintenance_log")

    cur.close()
    conn.close()
    print("\nAll sample data loaded successfully!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load sample data into DSQL")
    parser.add_argument(
        "--endpoint", required=True,
        help="DSQL cluster endpoint, e.g. <cluster-id>.dsql.us-east-1.on.aws",
    )
    args = parser.parse_args()
    run(args.endpoint)
